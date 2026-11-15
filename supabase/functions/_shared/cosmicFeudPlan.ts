// ── supabase/functions/_shared/cosmicFeudPlan.ts ─────────────────────────────
//
// What the cosmic feud does on one galaxy tick (issue #760, step 3), and the
// whisper each act leaves on the wire. Pure: the tick passes in the stored
// feud, the move log, the league tables, the clock and its seeded stream,
// and gets back at most ONE act to carry out. The I/O lives in
// architect-galaxy-tick/cosmicFeudTick.ts.
//
// One act per tick, at most MAX_FEUD_ACTS_PER_DAY a day, so the voices feel
// like presences rather than a stat-noise generator. Order of preference
// when the tick rolls an act:
//
//   1. a reversal: a voice undoes a recent move by the voice it beats
//      (the feud's point, so it comes first when one is available)
//   2. a grudge: a resentful voice hits the club its rival last helped
//   3. a motive: the Arbiter levels a league, or the Trickster upsets one
//
// The Architect keeps its own weekly intrusion (runMidWeekIntrusion); here it
// only ever acts as a reverser of the Trickster or out of a grudge.
//
// Whispers never show a number (hidden mechanics, docs/emergent-engine.md
// section 3.6): they say THAT something changed and who did it, not by how much.

import {
  COSMIC_ACTORS,
  VOICE_NAME,
  arbiterMoves,
  grudgeMove,
  lastHelpedTeam,
  moveToReverse,
  strongestGrudge,
  tricksterMove,
  type ClubMove,
  type CosmicActor,
  type FeudState,
  type LoggedMove,
  type TablePlace,
} from './cosmicFeud.ts';
import { tablesByLeague } from './leagueTable.ts';

/** Feud acts allowed per UTC day across all voices. */
export const MAX_FEUD_ACTS_PER_DAY = 2;

/** Chance that a tick acts at all (about 1.2 attempts a day at 12 ticks). */
export const FEUD_TICK_PROB = 0.1;

/** One act of the feud. */
export type FeudAct =
  | { type: 'reverse'; actor: CosmicActor; move: LoggedMove }
  | { type: 'shift'; actor: CosmicActor; moves: ClubMove[]; rival: CosmicActor | null };

export interface PlanInput {
  state: FeudState;
  log: readonly LoggedMove[];
  places: readonly TablePlace[];
  now: Date;
  rand: () => number;
  actsToday: number;
}

/**
 * Plan this tick's act.
 *
 * @returns The act, or null (no roll, the day's cap reached, or nothing to do).
 */
export function planFeudAct({ state, log, places, now, rand, actsToday }: PlanInput): FeudAct | null {
  if (actsToday >= MAX_FEUD_ACTS_PER_DAY) return null;
  if (rand() >= FEUD_TICK_PROB) return null;

  const reversals = COSMIC_ACTORS
    .map((actor) => ({ actor, move: moveToReverse(log, actor, now) }))
    .filter((r): r is { actor: CosmicActor; move: LoggedMove } => r.move != null);

  const grudges: FeudAct[] = [];
  for (const actor of COSMIC_ACTORS) {
    const g = strongestGrudge(state, actor);
    if (!g) continue;
    const mv = grudgeMove(actor, g.grudge, lastHelpedTeam(log, g.against));
    if (mv) grudges.push({ type: 'shift', actor, moves: [mv], rival: g.against });
  }

  const roll = rand();
  if (reversals.length > 0 && roll < 0.5) {
    const r = reversals[Math.floor(rand() * reversals.length)]!;
    return { type: 'reverse', actor: r.actor, move: r.move };
  }
  if (grudges.length > 0 && roll < 0.75) {
    return grudges[Math.floor(rand() * grudges.length)]!;
  }

  const leagues = [...tablesByLeague(places).values()].filter((t) => t.length >= 2);
  if (leagues.length === 0) return null;
  const table = leagues[Math.floor(rand() * leagues.length)]!;
  if (rand() < 0.5) {
    const moves = arbiterMoves(table);
    return moves.length ? { type: 'shift', actor: 'arbiter', moves, rival: null } : null;
  }
  const mv = tricksterMove(table, rand);
  return mv ? { type: 'shift', actor: 'trickster', moves: [mv], rival: null } : null;
}

// ── Whispers ────────────────────────────────────────────────────────────────

/** The narrative kind each voice writes under (identifiers; see migration 0101). */
export const VOICE_KIND: Record<CosmicActor, string> = {
  architect: 'cosmic_disturbance',
  arbiter: 'balance_whisper',
  trickster: 'chaos_whisper',
};

/** Names for the whisper, resolved by the tick. */
export interface WhisperNames {
  /** The player touched (reversals and single moves). */
  player?: string;
  /** The club touched (single moves), or the lifted club (Arbiter). */
  club?: string;
  /** The dulled club (Arbiter's levelling). */
  topClub?: string;
}

const ARBITER_LEVEL = [
  'The ledger was out. {TOP} has given a little back and {CLUB} has been given a little. The Arbiter considers the account settled.',
  'Too much had gathered at {TOP}. Some of it now sits at {CLUB}. The Arbiter does not explain its arithmetic.',
  'An entry has been corrected: {TOP} down a line, {CLUB} up one. Everything evens out. The Arbiter insists on it.',
];
const TRICKSTER_UPSET = [
  '{PLAYER} of {CLUB} woke up different. The Trickster will not say how. It is very pleased with itself.',
  'Something at {CLUB} has been rearranged. The Trickster says it was always like that. It was not.',
  'The Trickster has been to {CLUB}. Ask {PLAYER} about it. {PLAYER} does not know yet.',
];
const REVERSAL: Record<CosmicActor, string[]> = {
  // The voice named is the REVERSER; {RIVAL} is the voice it undid.
  arbiter: [
    '{RIVAL} touched {PLAYER}. The Arbiter has corrected it. The ledger keeps no favourites.',
    'What {RIVAL} wrote into {PLAYER} has been struck through. The Arbiter has entered the correction.',
  ],
  trickster: [
    '{RIVAL} balanced something at {CLUB}. The Trickster has unbalanced it again. Ha.',
    '{RIVAL} straightened {PLAYER} out. The Trickster has bent {PLAYER} back. Somebody had to.',
  ],
  architect: [
    '{RIVAL} meddled with {PLAYER}. The Architect has restored what was written. The script holds.',
    'A small vandalism at {CLUB}, by {RIVAL}. The Architect has painted over it.',
  ],
};
const GRUDGE: Record<CosmicActor, string[]> = {
  arbiter: [
    '{RIVAL} keeps a favourite, {CLUB}. {CLUB} has been charged for it. The Arbiter keeps every account.',
  ],
  trickster: [
    '{CLUB} was {RIVAL}\u2019s little project. The Trickster has taken that personally, and taken something from {CLUB}.',
  ],
  architect: [
    '{RIVAL} keeps undoing what is written. {CLUB}, its latest charity, will pay for that. The Architect forgets nothing.',
  ],
};

/** A voice's name mid-sentence: "the Arbiter" (the whisper's first letter is capitalised after). */
const rivalName = (v: CosmicActor) => VOICE_NAME[v].replace(/^The /, 'the ');
const fill = (t: string, vars: Record<string, string>) => t.replace(/\{([A-Z]+)\}/g, (_, k: string) => vars[k] ?? 'someone');
const pick = <T>(pool: readonly T[], rand: () => number): T => pool[Math.floor(rand() * pool.length)]!;

/**
 * The whisper an act leaves on the wire, in the acting voice.
 *
 * @returns The narrative kind and its text.
 */
export function feudWhisper(act: FeudAct, names: WhisperNames, rand: () => number): { kind: string; summary: string } {
  const vars: Record<string, string> = {
    PLAYER: names.player ?? 'someone',
    CLUB: names.club ?? 'a club',
    TOP: names.topClub ?? 'the top of the table',
  };
  let template: string;
  if (act.type === 'reverse') {
    vars.RIVAL = rivalName(act.move.actor);
    template = pick(REVERSAL[act.actor], rand);
  } else if (act.rival) {
    vars.RIVAL = rivalName(act.rival);
    template = pick(GRUDGE[act.actor], rand);
  } else if (act.actor === 'arbiter') {
    template = pick(ARBITER_LEVEL, rand);
  } else {
    template = pick(TRICKSTER_UPSET, rand);
  }
  const text = fill(template, vars);
  return { kind: VOICE_KIND[act.actor], summary: text.charAt(0).toUpperCase() + text.slice(1) };
}

/** Every template, for the house-style tests (no digits, no em dashes). */
export const ALL_FEUD_TEMPLATES: readonly string[] = [
  ...ARBITER_LEVEL, ...TRICKSTER_UPSET,
  ...Object.values(REVERSAL).flat(), ...Object.values(GRUDGE).flat(),
];
