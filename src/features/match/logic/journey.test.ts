// ── features/match/logic/journey.test.ts ────────────────────────────────────
// Match-day team ships: flight times by distance, the timetable, phases and
// the labels under each ship.

import { describe, expect, it } from 'vitest';
import {
  DERBY_FLIGHT_MS,
  HOME_HOP_MS,
  HOME_LAND_BEFORE_MS,
  LAND_BEFORE_MS,
  MAX_FLIGHT_MS,
  flightMs,
  formatSpan,
  legState,
  legStatus,
  matchJourney,
  worldOf,
} from './journey';

const MIN = 60_000;
const HOUR = 60 * MIN;
const KO = Date.UTC(2026, 10, 16, 19, 0);

describe('flightMs', () => {
  it('grows with distance: a short hop to Earth, a long haul from the Kuiper Belt', () => {
    const marsEarth = flightMs('Mars', 'Earth');
    const jupiterEarth = flightMs('Jupiter', 'Earth');
    const sednaMercury = flightMs('Sedna', 'Mercury');
    expect(marsEarth).toBeLessThan(2 * HOUR);
    expect(jupiterEarth).toBeGreaterThan(marsEarth);
    expect(sednaMercury).toBe(MAX_FLIGHT_MS);
  });

  it('is the same both ways, a crossing for a derby, and lands on five-minute marks', () => {
    expect(flightMs('Mars', 'Earth')).toBe(flightMs('Earth', 'Mars'));
    expect(flightMs('Mars', 'Mars')).toBe(DERBY_FLIGHT_MS);
    expect(flightMs('Titan', 'Ceres') % (5 * MIN)).toBe(0);
  });

  it('flies an unknown world as if from the Belt rather than failing', () => {
    expect(worldOf('Nowhere').au).toBe(2.8);
    expect(worldOf(null).name).toBe('Deep space');
    expect(flightMs('Nowhere', 'Earth')).toBeGreaterThan(0);
  });
});

describe('matchJourney', () => {
  it('lands the away ship half an hour before kick-off, the home ship first', () => {
    const j = matchJourney('Earth', 'Mars', KO);
    expect(j.away).toMatchObject({ from: 'Mars', to: 'Earth', arriveMs: KO - LAND_BEFORE_MS });
    expect(j.away.departMs).toBe(KO - LAND_BEFORE_MS - flightMs('Mars', 'Earth'));
    expect(j.home).toMatchObject({ from: 'Earth training base', arriveMs: KO - HOME_LAND_BEFORE_MS });
    expect(j.home.arriveMs - j.home.departMs).toBe(HOME_HOP_MS);
    expect(j.home.arriveMs).toBeLessThan(j.away.arriveMs);
  });

  it('sends a derby visitor across the planet', () => {
    expect(matchJourney('Mars', 'Mars', KO).away.from).toBe('Mars, far side');
  });
});

describe('legState and labels', () => {
  const j = matchJourney('Earth', 'Jupiter', KO);
  const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16);

  it('is docked, then flying with progress, then landed', () => {
    expect(legState(j.away, j.away.departMs - 1)).toEqual({ phase: 'docked', progress: 0 });
    const mid = (j.away.departMs + j.away.arriveMs) / 2;
    expect(legState(j.away, mid)).toEqual({ phase: 'flying', progress: 0.5 });
    expect(legState(j.away, j.away.arriveMs)).toEqual({ phase: 'landed', progress: 1 });
  });

  it('says where the ship is and when it moves next', () => {
    expect(legStatus(j.away, j.away.departMs - HOUR, clock)).toBe(`In the hangar at Jupiter. Departs ${clock(j.away.departMs)}`);
    expect(legStatus(j.away, j.away.arriveMs - 14 * MIN, clock)).toBe(`Left Jupiter at ${clock(j.away.departMs)}. Lands in 14m 00s`);
    expect(legStatus(j.away, KO, clock)).toBe(`Landed at ${clock(j.away.arriveMs)}`);
  });

  it('formats spans compactly', () => {
    expect(formatSpan(3 * HOUR + 5 * MIN + 9000)).toBe('3h 05m');
    expect(formatSpan(14 * MIN + 7000)).toBe('14m 07s');
    expect(formatSpan(40_000)).toBe('40s');
    expect(formatSpan(-5)).toBe('0s');
  });
});
