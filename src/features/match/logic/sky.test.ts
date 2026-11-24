// ── features/match/logic/sky.test.ts ────────────────────────────────────────
// The sky over the home ground is the real one: positions, sizes and phases
// change with the fixture and the date.

import { describe, expect, it } from 'vitest';
import { EPOCH_MS } from './orbits';
import { apparentRadius, MIN_AWAY_R, skyScene } from './sky';

const opts = { width: 320, horizon: () => 170, pad: 12 };
const at = EPOCH_MS;

describe('skyScene', () => {
  it('shows the away world, and differs from one fixture to the next', () => {
    // (Mars and Jupiter really are side by side in Earth's sky in November
    // 2026, so compare Mars with Venus.)
    const a = skyScene('Earth', 'Mars', at, opts);
    const b = skyScene('Earth', 'Venus', at, opts);
    expect(a.away?.name).toBe('Mars');
    expect(b.away?.name).toBe('Venus');
    expect(a.away!.x).not.toBeCloseTo(b.away!.x, 0);
  });

  it('keeps everything inside the frame and above the horizon', () => {
    for (const [h, w] of [['Earth', 'Sedna'], ['Europa', 'Jupiter'], ['Charon', 'Mercury'], ['Mars', 'Eris']] as const) {
      const { bodies, away } = skyScene(h, w, at, opts);
      expect(away).not.toBeNull();
      for (const b of bodies) {
        expect(b.x).toBeGreaterThanOrEqual(12 - 0.001);
        expect(b.x).toBeLessThanOrEqual(308 + 0.001);
        expect(b.y + b.r).toBeLessThan(170);
      }
    }
  });

  it('draws a near giant huge and a far world small, but never smaller than the minimum', () => {
    const jupiterOverEuropa = skyScene('Europa', 'Jupiter', at, opts).away!;
    const sednaFromMercury = skyScene('Mercury', 'Sedna', at, opts).away!;
    expect(jupiterOverEuropa.r).toBeGreaterThan(20);
    expect(sednaFromMercury.r).toBe(MIN_AWAY_R);
    expect(apparentRadius(696_000, 1)).toBeGreaterThan(apparentRadius(696_000, 86));
  });

  it('turns the lit side toward the Sun, and has no away world for a derby', () => {
    const { bodies } = skyScene('Earth', 'Mars', at, opts);
    const sun = bodies.find((b) => b.kind === 'sun');
    const mars = bodies.find((b) => b.name === 'Mars')!;
    if (sun) expect(Math.sign(mars.light.x) === Math.sign(sun.x - mars.x) || Math.abs(mars.light.x) < 0.05).toBe(true);
    expect(Math.hypot(mars.light.x, mars.light.y, mars.light.z)).toBeCloseTo(1, 6);
    expect(skyScene('Mars', 'Mars', at, opts).away).toBeNull();
  });

  it('keeps the sky legible: no two bodies on top of each other, the away world always shown', () => {
    const { bodies, away } = skyScene('Sedna', 'Mercury', at, opts);
    expect(away?.name).toBe('Mercury');
    for (const a of bodies) for (const b of bodies) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
    // Rings count: nothing sits on Saturn's rings over Titan.
    const titan = skyScene('Titan', 'Saturn Rings', at, opts).bodies;
    const saturn = titan.find((b) => b.name === 'Saturn Rings')!;
    for (const b of titan) if (b !== saturn) expect(Math.hypot(b.x - saturn.x, b.y - saturn.y)).toBeGreaterThanOrEqual(saturn.r * 1.95 + b.r);
  });

  it('hangs the planet over a tidally locked home moon, always in view', () => {
    for (const [moon, planet] of [['Charon', 'Pluto'], ['Europa', 'Jupiter'], ['Titan', 'Saturn']] as const) {
      const p = skyScene(moon, 'Mercury', at, opts).bodies.find((b) => b.name === planet);
      expect(p, moon).toBeDefined();
      expect(p!.r).toBeGreaterThan(15);
    }
  });

  it('draws Saturn once over Titan when the rings club visits', () => {
    const names = skyScene('Titan', 'Saturn Rings', at, opts).bodies.map((b) => b.name);
    expect(names.filter((n) => n === 'Saturn' || n === 'Saturn Rings')).toEqual(['Saturn Rings']);
  });

  it('never draws the ground world in its own sky', () => {
    expect(skyScene('Earth', 'Mars', at, opts).bodies.some((b) => b.name === 'Earth')).toBe(false);
    expect(skyScene('Saturn Rings', 'Titan', at, opts).bodies.some((b) => b.name === 'Saturn')).toBe(false);
  });
});
