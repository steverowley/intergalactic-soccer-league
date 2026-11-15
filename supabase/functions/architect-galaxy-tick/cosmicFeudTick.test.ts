// ── architect-galaxy-tick/cosmicFeudTick.test.ts ─────────────────────────────
// The feud's I/O (issue #760 step 3) against an in-memory fake of the
// Supabase query builder: a reversal end to end, a levelling shift, the
// daily cap and fail-soft reads.

import { describe, expect, it, vi } from 'vitest';
import { FEUD_LORE, VOICE_ENTITY, runCosmicFeud, toLoggedMoves } from './cosmicFeudTick';

type Row = Record<string, any>;

/** A tiny fake of the supabase-js builder over in-memory tables. */
function fakeDb(tables: Record<string, Row[]>, failOn: string | null = null) {
  let seq = 0;
  const get = (row: Row, path: string) => path.split('.').reduce((v: any, k) => (v == null ? v : v[k]), row);
  const contains = (a: any, b: any): boolean => Object.entries(b).every(([k, v]) => a != null && a[k] === v);
  return {
    tables,
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
      let payload: any = null;
      const rowsOf = () => (tables[table] ??= []);
      const run = () => {
        if (failOn === table) return { data: null, error: { message: `${table} down` } };
        if (op === 'insert') {
          const rows = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({ id: `new-${++seq}`, created_at: new Date().toISOString(), ...r }));
          rowsOf().push(...rows);
          return { data: rows, error: null };
        }
        if (op === 'upsert') {
          const i = rowsOf().findIndex((r) => r.scope === payload.scope && r.key === payload.key);
          if (i >= 0) rowsOf()[i] = { ...rowsOf()[i], ...payload }; else rowsOf().push(payload);
          return { data: [payload], error: null };
        }
        const hit = rowsOf().filter((r) => filters.every((f) => f(r)));
        if (op === 'update') { for (const r of hit) Object.assign(r, payload); return { data: hit, error: null }; }
        return { data: hit, error: null };
      };
      const b: any = {
        select: () => b,
        eq: (c: string, v: any) => { filters.push((r) => get(r, c) === v); return b; },
        gte: (c: string, v: any) => { filters.push((r) => get(r, c) >= v); return b; },
        contains: (c: string, v: any) => { filters.push((r) => contains(r[c], v)); return b; },
        insert: (p: any) => { op = 'insert'; payload = p; return b; },
        update: (p: any) => { op = 'update'; payload = p; return b; },
        upsert: (p: any) => { op = 'upsert'; payload = p; return b; },
        maybeSingle: () => { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
        single: () => { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      };
      return b;
    },
  };
}

const NOW = new Date('2026-11-13T12:00:00Z');
const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]!; };

function world() {
  return {
    teams: [
      { id: 't1', name: 'Earth United', league_id: 'L' },
      { id: 't2', name: 'Mars Athletic', league_id: 'L' },
      { id: 't3', name: 'Venus Volcanic', league_id: 'L' },
    ],
    seasons: [{ id: 's1', is_active: true }],
    matches: [
      { status: 'completed', home_team_id: 't1', away_team_id: 't2', home_score: 2, away_score: 0, competitions: { type: 'league', season_id: 's1' } },
    ],
    players: [
      { id: 'p1', name: 'Kael Vorn', team_id: 't1', attacking: 70, defending: 60, mental: 66, athletic: 64, technical: 62 },
      { id: 'p2', name: 'Ola Reyes', team_id: 't3', attacking: 55, defending: 58, mental: 50, athletic: 61, technical: 52 },
      { id: 'p3', name: 'Ivo Stell', team_id: 't2', attacking: 52, defending: 50, mental: 49, athletic: 57, technical: 50 },
    ],
    architect_interventions: [
      // The Architect raised Kael Vorn's mental yesterday (written before the feud: no actor).
      { id: 'iv1', target_table: 'players', target_id: 'p1', field: 'mental', old_value: 63, new_value: 66,
        created_at: '2026-11-12T10:00:00Z', meta: { kind: 'mid_week_trait_shift', team_id: 't1', source: 'architect-galaxy-tick' } },
    ],
    architect_lore: [] as Row[],
    narratives: [] as Row[],
  } as Record<string, Row[]>;
}

describe('runCosmicFeud', () => {
  it('lets the Arbiter reverse the Architect: player restored, both rows marked, grudge stored, whisper written', async () => {
    const db = fakeDb(world());
    // tick rolls (0), reversal branch (0.1), pick first reverser (0), whisper template (0).
    const row = await runCosmicFeud(db, seq(0, 0.1, 0, 0), NOW);

    expect(db.tables.players!.find((p) => p.id === 'p1')!.mental).toBe(63);
    const reversal = db.tables.architect_interventions!.find((r) => r.meta?.kind === 'cosmic_feud_reversal')!;
    expect(reversal.meta).toMatchObject({ source: 'cosmic-feud', actor: 'arbiter', reverses: 'iv1' });
    expect(db.tables.architect_interventions!.find((r) => r.id === 'iv1')!.meta.reversed_by).toBe('arbiter');

    const lore = db.tables.architect_lore!.find((r) => r.scope === FEUD_LORE.scope && r.key === FEUD_LORE.key)!;
    expect(lore.payload.grudge['architect>arbiter']).toBeGreaterThan(0);
    expect(lore.payload.clashes[0]).toMatchObject({ winner: 'arbiter', loser: 'architect' });

    expect(row).toMatchObject({ kind: 'balance_whisper', source: 'scheduled' });
    expect(row!.summary).toBe('The Cosmic Architect touched Kael Vorn. The Arbiter has corrected it. The ledger keeps no favourites.');
    expect(row!.entities_involved).toEqual([VOICE_ENTITY.arbiter, 't1']);
  });

  it('lets the Arbiter level a league when nothing is left to reverse', async () => {
    const w = world();
    w.architect_interventions = [];
    const db = fakeDb(w);
    // tick (0), roll past reversals and grudges (0.9), league (0), arbiter (0.1),
    // then per move: player (0), field (0 = attacking); whisper (0).
    const row = await runCosmicFeud(db, seq(0, 0.9, 0, 0.1, 0, 0, 0, 0, 0), NOW);
    const shifts = db.tables.architect_interventions!.filter((r) => r.meta?.kind === 'cosmic_feud_shift');
    expect(shifts.map((s) => [s.target_id, s.field, s.new_value - s.old_value])).toEqual([['p3', 'attacking', 2], ['p1', 'attacking', -2]]);
    expect(row!.kind).toBe('balance_whisper');
    expect(row!.summary).toContain('Earth United');
    expect(row!.summary).toContain('Mars Athletic');
    expect(db.tables.architect_lore).toEqual([]); // shifts do not touch the feud's state
  });

  it('respects the daily cap and stays quiet on a failed read', async () => {
    const w = world();
    w.architect_interventions!.push(
      { id: 'a', created_at: '2026-11-13T02:00:00Z', meta: { source: 'cosmic-feud' } },
      { id: 'b', created_at: '2026-11-13T04:00:00Z', meta: { source: 'cosmic-feud' } },
    );
    expect(await runCosmicFeud(fakeDb(w), seq(0), NOW)).toBeNull();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await runCosmicFeud(fakeDb(world(), 'teams'), seq(0), NOW)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('toLoggedMoves', () => {
  it('reads Architect intrusions without an actor as the Architect, and skips non-moves', () => {
    const moves = toLoggedMoves([
      { id: 'x', target_id: 'p', field: 'mental', old_value: 1, new_value: 4, created_at: 't', meta: { kind: 'mid_week_trait_shift', team_id: 'T' } },
      { id: 'y', target_id: 'p', field: 'mental', old_value: 1, new_value: 4, created_at: 't', meta: { kind: 'cosmic_feud_reversal', actor: 'arbiter' } },
      { id: 'z', target_id: 'p', field: 'mental', old_value: 4, new_value: 1, created_at: 't', meta: { kind: 'cosmic_feud_shift', actor: 'trickster', reversed_by: 'architect' } },
    ]);
    expect(moves.map((m) => [m.id, m.actor, m.reversedBy])).toEqual([['x', 'architect', null], ['z', 'trickster', 'architect']]);
  });
});
