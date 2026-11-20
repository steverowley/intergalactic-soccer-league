// ── voting/api/playerEntitySweep.test.ts ─────────────────────────────────────
// The daily sweep gives every player with no entity (admin-added players are
// the known case) his entity, people and persona, through the same
// provisionPlayerEntity the election paths use. Driven against an in-memory
// fake of the supabase-js builder that records every call, so the load
// contract is asserted exactly: ONE read, then writes only for the players
// found, and nothing at all on a normal day.

import { describe, expect, it, vi } from 'vitest';

import type { IslSupabaseClient } from '@shared/supabase/client';

import { raceLine, speciesForNewPlayer } from '../../../data/peoples';

import { SWEEP_LIMIT, sweepPlayerEntities } from './playerEntitySweep';

const { upsertPersona } = vi.hoisted(() => ({ upsertPersona: vi.fn(async (..._args: unknown[]) => null) }));
vi.mock('@features/agents', () => ({
  createPersona: ({ entity }: { entity: { id: string } }) => ({ entity_id: entity.id }),
  upsertPersona: (...args: unknown[]) => upsertPersona(...args),
}));

interface Row {
  id: string;
  name: string;
  team_id: string | null;
  position: string | null;
  nationality: string | null;
  entity_id: string | null;
}

/**
 * In-memory fake: `players` rows plus an `entities` store. Records each call
 * as `op:table` (the read records its filters too) so tests can assert the
 * exact sequence.
 */
function fakeDb(players: Row[], opts: { failInsertFor?: string; readError?: string } = {}) {
  const calls: string[] = [];
  const entities: Array<{ id: string; name: string; meta: Record<string, unknown> }> = [];
  let nextId = 1;

  const db = {
    from(table: string) {
      if (table === 'players') {
        return {
          select(cols: string) {
            const filters: string[] = [];
            let limit = Infinity;
            const builder = {
              is(col: string, v: unknown) { filters.push(`${col} is ${String(v)}`); return builder; },
              not(col: string, op: string, v: unknown) { filters.push(`${col} not ${op} ${String(v)}`); return builder; },
              order() { return builder; },
              limit(n: number) { limit = n; return builder; },
              then(resolve: (r: unknown) => void) {
                calls.push(`select:players(${cols}) where ${filters.join(' and ')} limit ${limit}`);
                if (opts.readError) return resolve({ data: null, error: { message: opts.readError } });
                const data = players
                  .filter((p) => p.entity_id === null && p.team_id !== null)
                  .slice(0, limit)
                  .map(({ entity_id: _e, ...rest }) => rest);
                return resolve({ data, error: null });
              },
            };
            return builder;
          },
          update(payload: { entity_id: string }) {
            return {
              eq: async (_col: string, id: string) => {
                calls.push(`update:players`);
                const p = players.find((x) => x.id === id);
                if (p) p.entity_id = payload.entity_id;
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'entities') {
        return {
          insert(payload: { name: string; meta: Record<string, unknown> }) {
            calls.push('insert:entities');
            return {
              select: () => ({
                single: async () => {
                  if (opts.failInsertFor && payload.name === opts.failInsertFor) {
                    return { data: null, error: { message: 'denied' } };
                  }
                  const row = { id: `e-${nextId++}`, kind: 'player', name: payload.name, display_name: null, meta: payload.meta };
                  entities.push(row);
                  return { data: row, error: null };
                },
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db: db as unknown as IslSupabaseClient, calls, entities, players };
}

const quiet = () => {};

const row = (id: string, name: string, team_id: string | null, entity_id: string | null = null): Row => ({
  id, name, team_id, position: 'MF', nationality: null, entity_id,
});

describe('sweepPlayerEntities', () => {
  it('on a normal day makes one read and no writes', async () => {
    const { db, calls } = fakeDb([row('p-1', 'Linked Already', 'mars-athletic', 'e-old')]);
    const result = await sweepPlayerEntities(db, { log: quiet });
    expect(result).toEqual({ found: 0, provisioned: [], failed: [] });
    expect(calls).toEqual([
      `select:players(id, name, team_id, position, nationality) where entity_id is null and team_id not is null limit ${SWEEP_LIMIT}`,
    ]);
  });

  it('gives an admin-added player his entity, people (from the TS rule) and persona', async () => {
    upsertPersona.mockClear();
    const added = row('3f9c2a10-0000-4000-8000-000000000001', 'Nova Okafor', 'europa-oceanic');
    const { db, calls, entities, players } = fakeDb([row('p-1', 'Old Hand', 'europa-oceanic', 'e-old'), added]);

    const result = await sweepPlayerEntities(db, { log: quiet });

    expect(result.provisioned).toEqual([added.id]);
    expect(calls.slice(1)).toEqual(['insert:entities', 'update:players']);
    expect(upsertPersona).toHaveBeenCalledTimes(1);
    const species = speciesForNewPlayer('europa-oceanic', added.id);
    expect(entities[0]!.meta['profile']).toEqual({ race: raceLine(species), species });
    expect(players.find((p) => p.id === added.id)!.entity_id).toBe(entities[0]!.id);
  });

  it('is idempotent: a second run finds nobody and writes nothing', async () => {
    const fake = fakeDb([row('p-2', 'A', 'mars-athletic'), row('p-3', 'B', 'earth-united')]);
    const first = await sweepPlayerEntities(fake.db, { log: quiet });
    expect(first.provisioned).toEqual(['p-2', 'p-3']);
    fake.calls.length = 0;
    const second = await sweepPlayerEntities(fake.db, { log: quiet });
    expect(second).toEqual({ found: 0, provisioned: [], failed: [] });
    expect(fake.calls).toHaveLength(1);
    expect(fake.entities).toHaveLength(2);
  });

  it('reports a failed player and carries on with the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = fakeDb([row('p-4', 'Fails', 'mars-athletic'), row('p-5', 'Works', 'mars-athletic')], { failInsertFor: 'Fails' });
    const result = await sweepPlayerEntities(fake.db, { log: quiet });
    expect(result).toEqual({ found: 2, provisioned: ['p-5'], failed: ['p-4'] });
    expect(fake.players.find((p) => p.id === 'p-4')!.entity_id).toBeNull();
    warn.mockRestore();
  });

  it('a dry run lists who would be provisioned and writes nothing', async () => {
    const lines: string[] = [];
    const fake = fakeDb([row('p-6', 'Dry Run', 'mars-athletic')]);
    const result = await sweepPlayerEntities(fake.db, { dryRun: true, log: (l) => lines.push(l) });
    expect(result).toEqual({ found: 1, provisioned: [], failed: [] });
    expect(fake.calls).toHaveLength(1);
    expect(lines.some((l) => l.includes('would provision Dry Run'))).toBe(true);
  });

  it('never provisions a player with no club, and caps one run', async () => {
    const many = Array.from({ length: SWEEP_LIMIT + 5 }, (_, i) => row(`p-${String(i).padStart(4, '0')}`, `P${i}`, 'mars-athletic'));
    const fake = fakeDb([row('p-free', 'Free Agent', null), ...many]);
    const result = await sweepPlayerEntities(fake.db, { log: quiet });
    expect(result.found).toBe(SWEEP_LIMIT);
    expect(result.provisioned).not.toContain('p-free');
    expect(fake.calls.filter((c) => c.startsWith('select:'))).toHaveLength(1);
  });

  it('throws when the read fails, so the job can report it', async () => {
    const fake = fakeDb([], { readError: 'timeout' });
    await expect(sweepPlayerEntities(fake.db, { log: quiet })).rejects.toThrow('timeout');
  });
});
