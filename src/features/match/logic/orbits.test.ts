// ── features/match/logic/orbits.test.ts ─────────────────────────────────────
// Real positions: checked against facts that do not depend on these numbers.

import { describe, expect, it } from 'vitest';
import { bodyPosition, distanceAu, EPOCH_MS, KM_PER_AU } from './orbits';

const DAY = 86_400_000;
const r = (n: string, ms = EPOCH_MS) => {
  const p = bodyPosition(n, ms)!;
  return Math.hypot(p.x, p.y, p.z);
};
const lon = (n: string, ms = EPOCH_MS) => {
  const p = bodyPosition(n, ms)!;
  return ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
};

describe('orbits', () => {
  it('puts each planet at its distance from the Sun', () => {
    expect(r('Earth')).toBeCloseTo(0.988, 2); // mid-November, heading for January perihelion
    expect(r('Jupiter')).toBeGreaterThan(4.95);
    expect(r('Jupiter')).toBeLessThan(5.46);
    expect(r('Sedna')).toBeGreaterThan(75);
    expect(r('Sedna')).toBeLessThan(90);
  });

  it("puts Earth where the Sun's opposite is: mid-November, ecliptic longitude about 54", () => {
    // The Sun is at about 234 degrees on 16 November, so Earth is at about 54.
    expect(lon('Earth')).toBeGreaterThan(52);
    expect(lon('Earth')).toBeLessThan(56);
  });

  it('moves Earth once round the Sun in a year', () => {
    const year = 365.256 * DAY;
    expect(Math.abs(lon('Earth', EPOCH_MS + year) - lon('Earth'))).toBeLessThan(0.2);
    expect(Math.abs(lon('Earth', EPOCH_MS + year / 2) - lon('Earth'))).toBeGreaterThan(170);
  });

  it('keeps moons close to their planets', () => {
    expect(distanceAu('Europa', 'Jupiter', EPOCH_MS)! * KM_PER_AU).toBeCloseTo(671_000, -4);
    expect(distanceAu('Charon', 'Pluto', EPOCH_MS)! * KM_PER_AU).toBeCloseTo(19_600, -3);
    expect(distanceAu('Largest Orbital Colony', 'Earth', EPOCH_MS)! * KM_PER_AU).toBeGreaterThan(350_000);
  });

  it('is symmetric and returns null for an unknown world', () => {
    expect(distanceAu('Mars', 'Earth', EPOCH_MS)).toBeCloseTo(distanceAu('Earth', 'Mars', EPOCH_MS)!, 12);
    expect(distanceAu('Atlantis', 'Earth', EPOCH_MS)).toBeNull();
  });
});
