// ── data/stadiums.test.ts ───────────────────────────────────────────────────
// Every club has a lore ground, and groundFor reads name, nickname and seats.

import { describe, expect, it } from 'vitest';
import { TEAMS_BY_LEAGUE } from './leagueData';
import { DEFAULT_STADIUM, groundFor, STADIUMS } from './stadiums';

const teams = Object.values(TEAMS_BY_LEAGUE).flat();

describe('STADIUMS', () => {
  it('gives every club its own ground, and lists no club that does not exist', () => {
    for (const t of teams) expect(STADIUMS[t.id], t.id).toBeDefined();
    const ids = new Set(teams.map((t) => t.id));
    for (const id of Object.keys(STADIUMS)) expect(ids.has(id), id).toBe(true);
  });

  it('quotes only lore that exists in the club data or lore fragments', async () => {
    const lore = await import('./lore.generated');
    const text = JSON.stringify(lore) + JSON.stringify(teams);
    for (const [id, s] of Object.entries(STADIUMS)) {
      if (s.line) expect(text.includes(s.line.replace(/"/g, '\\"')) || text.includes(s.line), id).toBe(true);
    }
  });
});

describe('groundFor', () => {
  it('reads the name, nickname and seats from homeGround and capacity', () => {
    expect(groundFor('hygiea-united')).toMatchObject({ name: 'Subterranean Field', nickname: 'The Dark Pitch', capacity: 18000 });
    expect(groundFor('hygiea-united').look.style).toBe('underground');
  });

  it('falls back to a plain ground for an unknown club', () => {
    expect(groundFor('nobody')).toMatchObject({ look: DEFAULT_STADIUM, name: null, nickname: null });
  });
});
