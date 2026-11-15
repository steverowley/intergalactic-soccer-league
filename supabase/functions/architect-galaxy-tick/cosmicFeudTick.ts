// ── architect-galaxy-tick/cosmicFeudTick.ts ──────────────────────────────────
//
// The cosmic feud between matches (issue #760, step 3): the I/O around the
// pure planner in ../_shared/cosmicFeudPlan.ts. Called once per galaxy tick;
// does at most one act:
//
//   reverse  a voice undoes a recent attribute move by the voice it beats,
//            records the clash (the loser's grudge rises) and whispers it
//   shift    the Arbiter levels a league, the Trickster upsets one, or a
//            resentful voice hits the club its rival last helped
//
// Every move writes an architect_interventions row (meta.source
// 'cosmic-feud', meta.actor, meta.kind) so later ticks can find and reverse
// it, plus one narrative in the acting voice. The feud's grudges live in
// architect_lore (scope 'global', key 'voice_feud').
//
// Fail-soft like the rest of the tick: any read or write error logs and
// returns null; the tick carries on.

// deno-lint-ignore-file no-explicit-any

import {
  clampStat,
  decayGrudges,
  isActor,
  parseFeud,
  recordClash,
  type ClubMove,
  type CosmicActor,
  type FeudState,
  type LoggedMove,
} from '../_shared/cosmicFeud.ts';
import { feudWhisper, planFeudAct, type FeudAct, type WhisperNames } from '../_shared/cosmicFeudPlan.ts';
import { rankLeagues, type TableMatch, type TableTeam } from '../_shared/leagueTable.ts';

/** The five player attribute columns (same list as the Architect's intrusion). */
export const FEUD_TRAIT_COLUMNS = ['attacking', 'defending', 'mental', 'athletic', 'technical'] as const;

/** Entity ids of the three voices (migration 0011). */
export const VOICE_ENTITY: Record<CosmicActor, string> = {
  architect: '50000000-0000-0000-0000-000000000001',
  arbiter: '50000000-0000-0000-0000-000000000002',
  trickster: '50000000-0000-0000-0000-000000000003',
};

/** Where the feud's state is stored in architect_lore. */
export const FEUD_LORE = { scope: 'global', key: 'voice_feud' } as const;

/** How far back a move can still be reversed. */
const LOG_DAYS = 14;

/** Intervention kinds that are attribute moves a voice may reverse. */
const MOVE_KINDS = new Set(['mid_week_trait_shift', 'cosmic_feud_shift']);

type Row = Record<string, any>;

/**
 * Run one tick of the feud.
 *
 * @param db    Service-role client.
 * @param rand  The tick's seeded stream.
 * @param now   The tick's clock.
 * @returns     The narrative row written, or null when nothing happened.
 */
export async function runCosmicFeud(db: any, rand: () => number, now: Date): Promise<Row | null> {
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00Z`;
  const since = new Date(now.getTime() - LOG_DAYS * 86_400_000).toISOString();

  const [todayQ, logQ, loreQ, teamsQ, seasonQ] = await Promise.all([
    db.from('architect_interventions').select('id').gte('created_at', dayStart).contains('meta', { source: 'cosmic-feud' }),
    db.from('architect_interventions')
      .select('id, target_id, field, old_value, new_value, created_at, meta')
      .eq('target_table', 'players')
      .gte('created_at', since),
    db.from('architect_lore').select('payload').eq('scope', FEUD_LORE.scope).eq('key', FEUD_LORE.key).maybeSingle(),
    db.from('teams').select('id, name, league_id'),
    db.from('seasons').select('id').eq('is_active', true).maybeSingle(),
  ]);
  for (const q of [todayQ, logQ, loreQ, teamsQ, seasonQ]) {
    if (q.error) {
      console.warn('[cosmic-feud] read failed:', q.error.message);
      return null;
    }
  }

  let matches: Row[] = [];
  if (seasonQ.data?.id) {
    const mq = await db.from('matches')
      .select('home_team_id, away_team_id, home_score, away_score, competitions!inner(type, season_id)')
      .eq('status', 'completed')
      .eq('competitions.type', 'league')
      .eq('competitions.season_id', seasonQ.data.id);
    if (mq.error) {
      console.warn('[cosmic-feud] matches read failed:', mq.error.message);
      return null;
    }
    matches = mq.data ?? [];
  }

  const teams: Row[] = teamsQ.data ?? [];
  const teamName = new Map<string, string>(teams.map((t) => [t.id, t.name]));
  const rawLog: Row[] = logQ.data ?? [];
  const log = toLoggedMoves(rawLog);
  const state = decayGrudges(parseFeud(loreQ.data?.payload), now);

  const act = planFeudAct({
    state,
    log,
    places: rankLeagues(teams as TableTeam[], matches as TableMatch[]),
    now,
    rand,
    actsToday: (todayQ.data ?? []).length,
  });
  if (!act) return null;

  const done = act.type === 'reverse'
    ? await reverseMove(db, act, rawLog, state, now)
    : await shiftClubs(db, act, state, rand);
  if (!done) return null;

  if (done.state !== state) {
    const save = await db.from('architect_lore').upsert(
      { scope: FEUD_LORE.scope, key: FEUD_LORE.key, payload: done.state, updated_at: now.toISOString() },
      { onConflict: 'scope,key' },
    );
    if (save.error) console.warn('[cosmic-feud] feud state save failed:', save.error.message);
  }

  const names: WhisperNames = { ...done.names };
  if (done.clubIds.club) names.club = teamName.get(done.clubIds.club) ?? names.club;
  if (done.clubIds.top) names.topClub = teamName.get(done.clubIds.top) ?? names.topClub;
  const { kind, summary } = feudWhisper(act, names, rand);
  const involved = [VOICE_ENTITY[act.actor], ...new Set([done.clubIds.club, done.clubIds.top].filter(Boolean))];
  const nq = await db.from('narratives').insert({
    kind,
    summary,
    entities_involved: involved,
    source: 'scheduled',
  }).select().single();
  if (nq.error) {
    console.warn('[cosmic-feud] narrative insert failed:', nq.error.message);
    return null;
  }
  return nq.data;
}

/**
 * Read the intervention log as attribute moves (Architect intrusions and feud
 * shifts). Rows with no actor are the Architect's (written before the feud).
 */
export function toLoggedMoves(rows: readonly Row[]): LoggedMove[] {
  const out: LoggedMove[] = [];
  for (const r of rows) {
    const meta = r.meta ?? {};
    if (!MOVE_KINDS.has(meta.kind)) continue;
    const oldValue = Number(r.old_value);
    const newValue = Number(r.new_value);
    if (!Number.isFinite(oldValue) || !Number.isFinite(newValue) || typeof r.target_id !== 'string' || typeof r.field !== 'string') continue;
    out.push({
      id: r.id,
      actor: isActor(meta.actor) ? meta.actor : 'architect',
      playerId: r.target_id,
      teamId: typeof meta.team_id === 'string' ? meta.team_id : null,
      field: r.field,
      oldValue,
      newValue,
      at: r.created_at,
      reversedBy: isActor(meta.reversed_by) ? meta.reversed_by : null,
    });
  }
  return out;
}

interface Done {
  state: FeudState;
  names: WhisperNames;
  clubIds: { club?: string; top?: string };
}

/** Undo a move: take its change back off the player's CURRENT value. */
async function reverseMove(
  db: any,
  act: Extract<FeudAct, { type: 'reverse' }>,
  rawLog: readonly Row[],
  state: FeudState,
  now: Date,
): Promise<Done | null> {
  const m = act.move;
  if (!(FEUD_TRAIT_COLUMNS as readonly string[]).includes(m.field)) return null;
  const pq = await db.from('players').select(`id, name, team_id, ${m.field}`).eq('id', m.playerId).maybeSingle();
  if (pq.error || !pq.data) {
    console.warn('[cosmic-feud] player read failed:', pq.error?.message ?? 'missing');
    return null;
  }
  const current = Number(pq.data[m.field] ?? 50);
  const restored = clampStat(current - (m.newValue - m.oldValue));
  if (restored !== current) {
    const up = await db.from('players').update({ [m.field]: restored }).eq('id', m.playerId);
    if (up.error) {
      console.warn('[cosmic-feud] reversal update failed:', up.error.message);
      return null;
    }
  }
  await db.from('architect_interventions').insert({
    target_table: 'players',
    target_id: m.playerId,
    field: m.field,
    old_value: current,
    new_value: restored,
    reason: `${act.actor} reversed ${m.actor}'s move on ${pq.data.name} (${m.field}).`,
    meta: { source: 'cosmic-feud', kind: 'cosmic_feud_reversal', actor: act.actor, reverses: m.id, team_id: pq.data.team_id ?? null },
  });
  const original = rawLog.find((r) => r.id === m.id);
  await db.from('architect_interventions')
    .update({ meta: { ...(original?.meta ?? {}), reversed_by: act.actor } })
    .eq('id', m.id);
  return {
    state: recordClash(state, { winner: act.actor, loser: m.actor, at: now.toISOString(), where: `player ${m.playerId} ${m.field}` }),
    names: { player: pq.data.name },
    clubIds: { club: pq.data.team_id ?? undefined },
  };
}

/** Carry out one or two club moves: a random player, a random attribute. */
async function shiftClubs(db: any, act: Extract<FeudAct, { type: 'shift' }>, state: FeudState, rand: () => number): Promise<Done | null> {
  const names: WhisperNames = {};
  const clubIds: Done['clubIds'] = {};
  let applied = 0;
  for (const mv of act.moves) {
    const player = await applyMove(db, mv, act.rival, rand);
    if (!player) continue;
    applied += 1;
    // The Arbiter's pair: the lifted club is {CLUB}, the dulled one {TOP}.
    if (act.actor === 'arbiter' && mv.direction < 0) clubIds.top = mv.teamId;
    else { clubIds.club = mv.teamId; names.player = player; }
  }
  // A shift does not change the feud (only reversals do), so the same state
  // object goes back and the caller skips the save.
  return applied > 0 ? { state, names, clubIds } : null;
}

/**
 * Apply one club move to a random player of that club.
 *
 * @returns The player's name, or null when nothing changed.
 */
async function applyMove(db: any, mv: ClubMove, rival: CosmicActor | null, rand: () => number): Promise<string | null> {
  const pq = await db.from('players').select('id, name, attacking, defending, mental, athletic, technical').eq('team_id', mv.teamId);
  if (pq.error || !pq.data?.length) {
    console.warn('[cosmic-feud] squad read failed:', pq.error?.message ?? `no players at ${mv.teamId}`);
    return null;
  }
  const player = pq.data[Math.floor(rand() * pq.data.length)];
  const field = FEUD_TRAIT_COLUMNS[Math.floor(rand() * FEUD_TRAIT_COLUMNS.length)]!;
  const oldValue = Number(player[field] ?? 50);
  const newValue = clampStat(oldValue + mv.direction * mv.size);
  if (newValue === oldValue) return null;
  const up = await db.from('players').update({ [field]: newValue }).eq('id', player.id);
  if (up.error) {
    console.warn('[cosmic-feud] shift update failed:', up.error.message);
    return null;
  }
  await db.from('architect_interventions').insert({
    target_table: 'players',
    target_id: player.id,
    field,
    old_value: oldValue,
    new_value: newValue,
    reason: `${mv.actor} (${mv.motive}) moved ${player.name}'s ${field}.`,
    meta: { source: 'cosmic-feud', kind: 'cosmic_feud_shift', actor: mv.actor, motive: mv.motive, rival, team_id: mv.teamId },
  });
  return player.name;
}
