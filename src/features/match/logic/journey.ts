// ── features/match/logic/journey.ts ─────────────────────────────────────────
//
// Match day before kick-off: each club's team ship (the ISL's team bus)
// flies from its home world to the stadium. The match page draws it in
// place of the empty pitch until kick-off (owner, 2026-11-13).
//
// Pure: schedule and state from the two home worlds, the kick-off time and
// the clock. The ships are on a real timetable, so a fan who opens the page
// sees exactly where they are, and a fan who comes back later sees them
// further along:
//
//   away ship   leaves its home world early enough to land LAND_BEFORE_MS
//               before kick-off. Flight time grows with the real distance
//               between the two worlds on the day (orbits.ts; log scale,
//               capped), so a trip to Mars is quicker when Mars is near.
//   home ship   a short hop from the club's training base, landing first.
//   derby       two clubs on one world: the away side crosses the planet.
//
// No randomness: the same fixture always flies the same timetable.

import { WORLDS, type World } from '../../../data/leagueData';
import { distanceAu } from './orbits';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The away ship lands this long before kick-off. */
export const LAND_BEFORE_MS = 30 * MIN;
/** The home ship lands this long before kick-off. */
export const HOME_LAND_BEFORE_MS = 50 * MIN;
/** The home ship's hop from its training base. */
export const HOME_HOP_MS = 30 * MIN;
/** Two clubs on one world: the away side crosses it. */
export const DERBY_FLIGHT_MS = 45 * MIN;
/** The longest flight in the league. */
export const MAX_FLIGHT_MS = 8 * HOUR;

/** A world we have no record of: drawn grey, flown as if from the Belt. */
const UNKNOWN_WORLD: World = WORLDS['Asteroid Belt Colony']!;

/** Look up a club's home world, tolerating unknown names. */
export function worldOf(location: string | null | undefined): World & { name: string } {
  const name = (location ?? '').trim() || 'Deep space';
  return { name, ...(WORLDS[name] ?? UNKNOWN_WORLD) };
}

/**
 * Flight time between two worlds.
 *
 * @param atMs  When (kick-off): uses the worlds' real distance that day.
 * @returns Milliseconds, rounded to five minutes.
 */
export function flightMs(from: string | null | undefined, to: string | null | undefined, atMs?: number): number {
  const a = worldOf(from);
  const b = worldOf(to);
  if (a.name === b.name) return DERBY_FLIGHT_MS;
  // The real distance on the day when we know it; the orbits' gap otherwise.
  const real = atMs == null ? null : distanceAu(a.name, b.name, atMs);
  const gap = real ?? Math.abs(a.au - b.au);
  const hours = 1 + 1.6 * Math.log(1 + gap);
  const ms = Math.min(MAX_FLIGHT_MS, hours * HOUR);
  return Math.round(ms / (5 * MIN)) * 5 * MIN;
}

/** One ship's timetable. */
export interface Leg {
  side: 'home' | 'away';
  /** Where it leaves from, for the label ("Mars", "Mars training base"). */
  from: string;
  /** The world it flies to (the home club's). */
  to: string;
  departMs: number;
  arriveMs: number;
}

/**
 * Both ships' timetables for a fixture.
 *
 * @param homeLocation  The home club's world (where the stadium is).
 * @param awayLocation  The away club's world.
 * @param kickoffMs     Kick-off, epoch ms.
 */
export function matchJourney(
  homeLocation: string | null | undefined,
  awayLocation: string | null | undefined,
  kickoffMs: number,
  homeBase?: string | null,
): { home: Leg; away: Leg } {
  const to = worldOf(homeLocation).name;
  const awayFrom = worldOf(awayLocation).name;
  const awayArrive = kickoffMs - LAND_BEFORE_MS;
  const homeArrive = kickoffMs - HOME_LAND_BEFORE_MS;
  return {
    home: { side: 'home', from: homeBase ?? `${to} training base`, to, departMs: homeArrive - HOME_HOP_MS, arriveMs: homeArrive },
    away: {
      side: 'away',
      from: awayFrom === to ? `${awayFrom}, far side` : awayFrom,
      to,
      departMs: awayArrive - flightMs(awayLocation, homeLocation, kickoffMs),
      arriveMs: awayArrive,
    },
  };
}

/** Where a ship is now. */
export type LegPhase = 'docked' | 'flying' | 'landed';

/**
 * A ship's phase and how far along its flight it is.
 *
 * @returns progress 0 while docked, 1 once landed, else the share flown.
 */
export function legState(leg: Leg, nowMs: number): { phase: LegPhase; progress: number } {
  if (nowMs < leg.departMs) return { phase: 'docked', progress: 0 };
  if (nowMs >= leg.arriveMs) return { phase: 'landed', progress: 1 };
  return { phase: 'flying', progress: (nowMs - leg.departMs) / (leg.arriveMs - leg.departMs) };
}

/**
 * A short duration for labels: "3h 05m", "14m 07s", "40s".
 *
 * @param ms  Milliseconds (negative is treated as zero).
 */
export function formatSpan(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${two(m)}m`;
  if (m > 0) return `${m}m ${two(sec)}s`;
  return `${sec}s`;
}

/**
 * The one-line status under a ship: where it is and when it moves next.
 *
 * @param clock  Formats an epoch ms as a local time ("14:30").
 */
export function legStatus(leg: Leg, nowMs: number, clock: (ms: number) => string): string {
  const { phase } = legState(leg, nowMs);
  if (phase === 'docked') return `In the hangar at ${leg.from}. Departs ${clock(leg.departMs)}`;
  if (phase === 'flying') return `Left ${leg.from} at ${clock(leg.departMs)}. Lands in ${formatSpan(leg.arriveMs - nowMs)}`;
  return `Landed at ${clock(leg.arriveMs)}`;
}
