// ── features/match/ui/journey/MatchJourney.test.tsx ─────────────────────────
// The pre-kick-off journey panel renders each ship's phase from the real
// timetable, and the starfield is fixed per fixture.

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchJourney, starfield } from './MatchJourney';
import { flightMs, LAND_BEFORE_MS } from '../../logic/journey';

const KO = Date.UTC(2026, 10, 16, 15, 0);
const home = { name: 'Earth United', color: '#1E90FF', location: 'Earth' };
const away = { name: 'Jupiter Titans', color: '#D2691E', location: 'Jupiter' };

describe('MatchJourney', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the away ship in flight and the home ship in the hangar mid-journey', () => {
    const departs = KO - LAND_BEFORE_MS - flightMs('Jupiter', 'Earth', KO);
    vi.setSystemTime(departs + 10 * 60_000);
    const { getByRole, getAllByText, getByText } = render(
      <MatchJourney home={home} away={away} kickoffMs={KO} ground="Blue Marble Arena" seed="m1" />,
    );
    const scene = getByRole('img');
    expect(scene.getAttribute('aria-label')).toMatch(/^Jupiter Titans: Left Jupiter at \d\d:\d\d\. Lands in /);
    expect(scene.getAttribute('aria-label')).toMatch(/Earth United: In the hangar at Earth training base/);
    expect(getByText('In flight')).toBeTruthy();
    expect(getAllByText('In the hangar')).toHaveLength(1);
    expect(getByText('On the way to Blue Marble Arena')).toBeTruthy();
  });

  it('shows both ships landed in the last half hour', () => {
    vi.setSystemTime(KO - 10 * 60_000);
    const { getAllByText, getByText } = render(
      <MatchJourney home={home} away={away} kickoffMs={KO} ground={null} seed="m1" />,
    );
    expect(getAllByText('Landed')).toHaveLength(2);
    expect(getByText('10m 00s')).toBeTruthy();
  });
});

describe('starfield', () => {
  it('is the same sky for the same fixture and a different one for another', () => {
    expect(starfield('m1', 5)).toEqual(starfield('m1', 5));
    expect(starfield('m1', 5)).not.toEqual(starfield('m2', 5));
    for (const s of starfield('x', 50)) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(320);
      expect(s.y).toBeLessThan(208);
    }
  });
});
