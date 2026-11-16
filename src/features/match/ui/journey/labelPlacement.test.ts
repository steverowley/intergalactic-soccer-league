// ── features/match/ui/journey/labelPlacement.test.ts ────────────────────────
// Labels keep their space: inside the frame's margin, clear of obstacles and
// never over the home world.

import { describe, expect, it } from 'vitest';
import { placeLabel, type PlaceOptions } from './labelPlacement';

const base: PlaceOptions = {
  size: { w: 60, h: 14 },
  target: { x: 100, y: 100, w: 40, h: 40 },
  order: ['above', 'below', 'left', 'right'],
  frame: { w: 400, h: 260 },
  margin: 12,
  gap: 8,
  obstacles: [],
  horizon: () => 1000,
};

describe('placeLabel', () => {
  it('takes the first spot with room: above the target, centred, a gap clear', () => {
    expect(placeLabel(base)).toEqual({ x: 90, y: 78 });
  });

  it('slides along to keep the margin from the frame edge', () => {
    const p = placeLabel({ ...base, target: { x: 2, y: 100, w: 40, h: 40 } });
    expect(p.x).toBe(12);
  });

  it('moves on when the spot is blocked or too near the top', () => {
    expect(placeLabel({ ...base, target: { x: 100, y: 20, w: 40, h: 40 } }).y).toBe(68);
    expect(placeLabel({ ...base, obstacles: [{ x: 80, y: 60, w: 80, h: 30 }] }).y).toBe(148);
  });

  it('never sits over the home world: a label below the horizon is moved to the sky', () => {
    const p = placeLabel({ ...base, order: ['below', 'above'], horizon: () => 150 });
    expect(p.y + 14).toBeLessThanOrEqual(150);
  });

  it('still returns a spot inside the frame when nothing fits', () => {
    const p = placeLabel({ ...base, obstacles: [{ x: 0, y: 0, w: 400, h: 260 }] });
    expect(p.x).toBeGreaterThanOrEqual(12);
    expect(p.y).toBeGreaterThanOrEqual(12);
  });
});
