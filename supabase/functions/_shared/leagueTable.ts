// ── supabase/functions/_shared/leagueTable.ts ────────────────────────────────
//
// League positions from completed league matches, for the cosmic voices'
// motives (issue #760): the Arbiter needs the top and bottom club of a
// league, the Trickster the middle third. Pure; vitest covers it.
//
// Ordering matches the site's standings: points (3 for a win, 1 for a
// draw), then goal difference, then goals scored, then team id so the
// order is stable when everything else ties.

import type { TablePlace } from './cosmicFeud.ts';

/** A club and the league it plays in. */
export interface TableTeam {
  id: string;
  league_id: string | null;
}

/** A completed league match (scores may be missing on bad rows; skipped). */
export interface TableMatch {
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
}

interface Tally { pts: number; gd: number; gf: number }

/**
 * Rank every league's clubs.
 *
 * @param teams    All clubs (those without a league are ignored).
 * @param matches  Completed league matches of the current season.
 * @returns        One TablePlace per club with a league; a league with no
 *                 results yet is still ranked (all level, by id).
 */
export function rankLeagues(teams: readonly TableTeam[], matches: readonly TableMatch[]): TablePlace[] {
  const tally = new Map<string, Tally>();
  for (const t of teams) if (t.league_id) tally.set(t.id, { pts: 0, gd: 0, gf: 0 });
  for (const m of matches) {
    if (typeof m.home_score !== 'number' || typeof m.away_score !== 'number') continue;
    const h = tally.get(m.home_team_id);
    const a = tally.get(m.away_team_id);
    if (!h || !a) continue;
    h.gf += m.home_score; a.gf += m.away_score;
    h.gd += m.home_score - m.away_score; a.gd += m.away_score - m.home_score;
    if (m.home_score > m.away_score) h.pts += 3;
    else if (m.home_score < m.away_score) a.pts += 3;
    else { h.pts += 1; a.pts += 1; }
  }
  const byLeague = new Map<string, string[]>();
  for (const t of teams) {
    if (!t.league_id) continue;
    byLeague.set(t.league_id, [...(byLeague.get(t.league_id) ?? []), t.id]);
  }
  const out: TablePlace[] = [];
  for (const [leagueId, ids] of byLeague) {
    const sorted = [...ids].sort((x, y) => {
      const a = tally.get(x)!, b = tally.get(y)!;
      return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || x.localeCompare(y);
    });
    sorted.forEach((teamId, i) => out.push({ teamId, leagueId, position: i + 1, size: sorted.length }));
  }
  return out;
}

/**
 * Split ranked places back into one table per league.
 *
 * @returns League id to its places, top first.
 */
export function tablesByLeague(places: readonly TablePlace[]): Map<string, TablePlace[]> {
  const out = new Map<string, TablePlace[]>();
  for (const p of places) out.set(p.leagueId, [...(out.get(p.leagueId) ?? []), p]);
  for (const t of out.values()) t.sort((a, b) => a.position - b.position);
  return out;
}
