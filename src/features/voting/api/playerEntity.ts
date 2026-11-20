// ── voting/api/playerEntity.ts ───────────────────────────────────────────────
// WHY: Every code path that creates a player must also give him an entity, a
// persona and his people (species), or he is a player the rest of the game
// cannot see: no bio, no voice, and the match viewer cannot draw him as the
// people he belongs to. Election enactment (`insert_player`) and the election
// night replacement for an incinerated player both create players, so the
// provisioning lives here once instead of being re-implemented per path.
//
// The sequence, after the caller has inserted the `players` row:
//   1. Insert an `entities` row (kind='player') built by `createPlayerEntity`,
//      carrying his people: `speciesForNewPlayer(team_id, player id)` written
//      into `meta.profile` as `{ race, species }` (src/data/peoples.ts).
//   2. Link the two via `players.entity_id`.
//   3. Seed a persona via the deterministic factory (no LLM cost).
//
// Failure policy: best-effort. A failed entity insert leaves the player
// without an entity (he still plays; commentary falls back to a generic
// voice) and is logged. A failed link removes the entity it just inserted so
// no orphan is left. Either way the player keeps a null `entity_id`, and the
// daily sweep (playerEntitySweep.ts) provisions him on its next run.

import type { IslSupabaseClient } from '@shared/supabase/client';
import type { Json } from '@/types/database';
import { createPlayerEntity } from '@features/entities';
import { createPersona, upsertPersona } from '@features/agents';

import { speciesForNewPlayer } from '../../../data/peoples';

/** The fields of a just-inserted player row the entity is built from. */
export interface NewPlayerRow {
  id: string;
  name: string;
  team_id: string;
  position: string;
  nationality?: string | null;
}

/**
 * Build the entity insert for a new player, including his people. Pure, so
 * the shape is unit-testable without a database.
 *
 * @param player  The inserted `players` row (its id seeds the people draw).
 * @returns       The `entities` insert payload.
 */
export function newPlayerEntityPayload(player: NewPlayerRow): ReturnType<typeof createPlayerEntity> {
  return createPlayerEntity({
    name: player.name,
    team_id: player.team_id,
    position: player.position,
    nationality: player.nationality ?? null,
    species: speciesForNewPlayer(player.team_id, player.id),
  });
}

/**
 * Give a freshly inserted player his entity (with his people), link it, and
 * seed his persona.
 *
 * @param db      Supabase client allowed to write entities/players/personas.
 * @param player  The inserted `players` row.
 * @param label   Log prefix naming the calling path.
 * @returns       The new entity id, or null when the entity insert or the link
 *                failed (the player is left with no entity, ready for a retry).
 */
export async function provisionPlayerEntity(
  db: IslSupabaseClient,
  player: NewPlayerRow,
  label: string,
): Promise<string | null> {
  const payload = newPlayerEntityPayload(player);
  // `payload.meta` is typed Record<string, unknown>; the column type is the
  // recursive `Json`. Structurally identical at runtime: cast at the boundary.
  const { data: entityRow, error: entityErr } = await db
    .from('entities')
    .insert({ ...payload, meta: payload.meta as Json })
    .select('id, kind, name, display_name, meta')
    .single();

  if (entityErr || !entityRow) {
    console.warn(`[${label}] entity insert failed:`, entityErr?.message);
    return null;
  }

  const entity = entityRow as {
    id: string;
    kind: string;
    name: string;
    display_name: string | null;
    meta: unknown;
  };

  const { error: linkErr } = await db
    .from('players')
    .update({ entity_id: entity.id })
    .eq('id', player.id);
  if (linkErr) {
    // Remove the entity just inserted rather than leave an orphan nobody
    // points at: the player stays without one, so the daily sweep
    // (playerEntitySweep.ts) provisions him cleanly on its next run.
    console.warn(`[${label}] entity link failed:`, linkErr.message);
    const { error: undoErr } = await db.from('entities').delete().eq('id', entity.id);
    if (undoErr) console.warn(`[${label}] orphan entity ${entity.id} not removed:`, undoErr.message);
    return null;
  }

  // A fresh signing has no traits or relationships yet, so the factory falls
  // back to the generic player archetype; the enricher refreshes it later.
  const persona = createPersona({ entity, traits: [], relationships: [] });
  await upsertPersona(db, persona);

  return entity.id;
}
