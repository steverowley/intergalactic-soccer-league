// ── supabase/functions/_shared/cosmicFeudPlan.test.ts ────────────────────────
// The tick planner and whispers (issue #760 step 3), plus the league table.

import { describe, expect, it } from 'vitest';
import { EMPTY_FEUD, recordClash, type LoggedMove } from './cosmicFeud';
import { ALL_FEUD_TEMPLATES, MAX_FEUD_ACTS_PER_DAY, feudWhisper, planFeudAct } from './cosmicFeudPlan';
import { rankLeagues, tablesByLeague } from './leagueTable';

/** A stream that returns the given values in order, then repeats the last. */
const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]!; };

const now = new Date('2026-11-13T12:00:00Z');
const teams = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, league_id: 'L' }));
const places = rankLeagues(teams, [
  { home_team_id: 'a', away_team_id: 'b', home_score: 3, away_score: 0 },
  { home_team_id: 'c', away_team_id: 'd', home_score: 1, away_score: 1 },
  { home_team_id: 'e', away_team_id: 'f', home_score: 0, away_score: 2 },
]);
const move = (o: Partial<LoggedMove>): LoggedMove => ({
  id: 'm1', actor: 'architect', playerId: 'p1', teamId: 'c', field: 'mental',
  oldValue: 60, newValue: 63, at: '2026-11-12T00:00:00Z', reversedBy: null, ...o,
});

describe('rankLeagues', () => {
  it('orders by points, then goal difference, then goals, then id', () => {
    const t = tablesByLeague(places).get('L')!.map((p) => p.teamId);
    expect(t).toEqual(['a', 'f', 'c', 'd', 'e', 'b']);
    expect(places.every((p) => p.size === 6)).toBe(true);
  });

  it('ignores clubs without a league and matches without scores', () => {
    const p = rankLeagues([{ id: 'x', league_id: null }, { id: 'y', league_id: 'M' }], [{ home_team_id: 'x', away_team_id: 'y', home_score: null, away_score: 1 }]);
    expect(p).toEqual([{ teamId: 'y', leagueId: 'M', position: 1, size: 1 }]);
  });
});

describe('planFeudAct', () => {
  const base = { state: EMPTY_FEUD, log: [] as LoggedMove[], places, now, actsToday: 0 };

  it('does nothing when the tick does not roll, or the day is full', () => {
    expect(planFeudAct({ ...base, rand: seq(0.5) })).toBeNull();
    expect(planFeudAct({ ...base, actsToday: MAX_FEUD_ACTS_PER_DAY, rand: seq(0) })).toBeNull();
  });

  it('prefers a reversal of the beaten voice when one is available', () => {
    const act = planFeudAct({ ...base, log: [move({})], rand: seq(0, 0.1, 0) });
    expect(act).toEqual({ type: 'reverse', actor: 'arbiter', move: move({}) });
  });

  it('pays back a grudge at the club the rival last helped', () => {
    const state = recordClash(EMPTY_FEUD, { winner: 'arbiter', loser: 'architect', at: 'x', where: 'y' });
    const log = [move({ actor: 'arbiter', teamId: 'e', reversedBy: null, at: '2026-11-01T00:00:00Z' })];
    // roll 0.6 skips any reversal (none is eligible anyway: the log entry is outside the window).
    const act = planFeudAct({ ...base, state, log, rand: seq(0, 0.6, 0) });
    expect(act).toMatchObject({ type: 'shift', actor: 'architect', rival: 'arbiter', moves: [{ teamId: 'e', direction: -1, motive: 'grudge' }] });
  });

  it('otherwise follows a motive: the Arbiter levels, the Trickster upsets', () => {
    const arb = planFeudAct({ ...base, rand: seq(0, 0.9, 0, 0.1) });
    expect(arb).toMatchObject({ type: 'shift', actor: 'arbiter', moves: [{ teamId: 'b', direction: 1 }, { teamId: 'a', direction: -1 }] });
    const tri = planFeudAct({ ...base, rand: seq(0, 0.9, 0, 0.9, 0, 0.9) });
    expect(tri).toMatchObject({ type: 'shift', actor: 'trickster', moves: [{ teamId: 'c', direction: 1, size: 5 }] });
  });
});

describe('feudWhisper', () => {
  it('speaks in the acting voice and names the rival it undid', () => {
    const w = feudWhisper({ type: 'reverse', actor: 'arbiter', move: move({}) }, { player: 'Kael Vorn', club: 'Earth United' }, seq(0));
    expect(w.kind).toBe('balance_whisper');
    expect(w.summary).toBe('The Cosmic Architect touched Kael Vorn. The Arbiter has corrected it. The ledger keeps no favourites.');
  });

  it('writes the Trickster as chaos_whisper and the Architect as a disturbance', () => {
    expect(feudWhisper({ type: 'shift', actor: 'trickster', moves: [], rival: null }, { player: 'P', club: 'C' }, seq(0)).kind).toBe('chaos_whisper');
    const g = feudWhisper({ type: 'shift', actor: 'architect', moves: [], rival: 'arbiter' }, { club: 'Mars Athletic' }, seq(0));
    expect(g.kind).toBe('cosmic_disturbance');
    expect(g.summary).toMatch(/^The Arbiter keeps undoing what is written\. Mars Athletic/);
  });

  it('never shows a number or an em dash, and fills every placeholder', () => {
    for (const t of ALL_FEUD_TEMPLATES) {
      expect(t, t).not.toMatch(/\d|\u2014/);
      expect(t.replace(/\{(PLAYER|CLUB|TOP|RIVAL)\}/g, ''), t).not.toMatch(/[{}]/);
    }
  });
});
