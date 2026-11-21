// ── voting/api/playerEntitySweep.ts ──────────────────────────────────────────
// WHY: A player whose `entity_id` is null has no bio and no people (species):
// his page shows no profile and the match viewer cannot draw him as the people
// he belongs to. Players added on the admin page are the known source: the
// `admin_add_player` RPC (migration 0042) runs as the signed-in admin and
// inserts only the `players` row, because entity writes are service-role only
// (0073), so the browser cannot create the entity.
//
// THE FIX: this sweep runs server-side with the service role, once a day, in
// the existing `Enact due seasons` job (scripts/enact-due-seasons.ts). It finds
// every player with no entity in ONE query and gives each the same entity,
// people and persona an elected or replacement player gets, through the one
// shared `provisionPlayerEntity`. The species rule therefore stays in
// TypeScript (`speciesForNewPlayer`, src/data/peoples.ts) and is never
// re-implemented in SQL, where it would drift.
//
// It also mops up any other path that ever leaves a player without an entity
// (a best-effort provisioning that failed), whatever created the row.
//
// LOAD (free tier): one read a day of a small table (`players`, a few hundred
// rows); on a normal day it finds nobody and writes nothing. Each player it
// does find costs his own three writes (entity insert, link, persona upsert),
// because each link carries that player's own new entity id; a run is capped
// at SWEEP_LIMIT players so a surprise backlog is spread over days.
//
// IDEMPOTENT: a player is picked only while his `entity_id` is null, and
// `provisionPlayerEntity` removes the entity it just inserted if the link
// fails, so a failed player is retried cleanly the next day.

import type { IslSupabaseClient } from '@shared/supabase/client';

import { provisionPlayerEntity } from './playerEntity';

/**
 * Most players one run provisions. Far above a normal day's count (zero, or a
 * few admin additions); a larger backlog is finished by the following runs.
 */
export const SWEEP_LIMIT = 100;

/** Log prefix, also passed to provisionPlayerEntity for its own warnings. */
const LABEL = 'player-entity-sweep';

/** What one sweep did, for the job log and for tests. */
export interface PlayerEntitySweepResult {
  /** Players found with no entity (at most SWEEP_LIMIT). */
  found: number;
  /** Player ids given an entity this run (empty on a dry run). */
  provisioned: string[];
  /** Player ids whose provisioning failed (retried next run). */
  failed: string[];
}

/** The player columns the sweep reads. */
interface OrphanPlayerRow {
  id: string;
  name: string;
  team_id: string | null;
  position: string | null;
  nationality: string | null;
}

/**
 * Give every player who has no entity his entity, people and persona.
 *
 * @param db       Service-role client (entity writes are service-role only).
 * @param options  `dryRun`: list who would be provisioned, write nothing.
 *                 `log`: line sink, console.log by default.
 * @returns        Counts and ids of what was done.
 * @throws         When the one read fails (the caller decides the exit code).
 */
export async function sweepPlayerEntities(
  db: IslSupabaseClient,
  options: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<PlayerEntitySweepResult> {
  const log = options.log ?? ((line: string) => console.log(line));

  // ONE query: every player with no entity. Players with no club are left
  // out because his people is drawn from his club's mix; none exist today.
  const { data, error } = await db
    .from('players')
    .select('id, name, team_id, position, nationality')
    .is('entity_id', null)
    .not('team_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(SWEEP_LIMIT);
  if (error) throw new Error(`[${LABEL}] players query failed: ${error.message}`);

  const rows = (data ?? []) as OrphanPlayerRow[];
  const result: PlayerEntitySweepResult = { found: rows.length, provisioned: [], failed: [] };
  log(`[${LABEL}] ${rows.length} player(s) with no entity${rows.length === SWEEP_LIMIT ? ` (capped at ${SWEEP_LIMIT}; the rest follow next run)` : ''}`);

  for (const row of rows) {
    if (row.team_id === null) continue; // narrowed for the type; filtered above
    const who = `${row.name} (${row.id.slice(0, 8)}, ${row.team_id})`;
    if (options.dryRun) {
      log(`[${LABEL}] (dry-run) would provision ${who}`);
      continue;
    }
    const entityId = await provisionPlayerEntity(
      db,
      {
        id: row.id,
        name: row.name,
        team_id: row.team_id,
        // Same fallback as the one-shot backfill (scripts/migrate-to-entities.ts).
        position: row.position ?? 'UNK',
        nationality: row.nationality,
      },
      LABEL,
    );
    if (entityId) {
      result.provisioned.push(row.id);
      log(`[${LABEL}] provisioned ${who} -> entity ${entityId.slice(0, 8)}`);
    } else {
      result.failed.push(row.id);
      log(`[${LABEL}] FAILED ${who}; retried next run`);
    }
  }

  log(`[${LABEL}] done: provisioned=${result.provisioned.length} failed=${result.failed.length}`);
  return result;
}
