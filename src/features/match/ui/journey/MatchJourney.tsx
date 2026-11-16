// ── features/match/ui/journey/MatchJourney.tsx ──────────────────────────────
//
// Match day before kick-off: the two team ships (the ISL's team buses) on
// their way to the stadium, drawn in place of the empty pitch (owner,
// 2026-11-13). The timetable is real (logic/journey.ts): the away ship
// leaves its home world early enough to land half an hour before kick-off,
// the home ship hops over from its training base, and the page shows exactly
// where each is now, ticking once a second until kick-off.
//
// Layout:
//   header   "Match day" eyebrow, the stadium, and the kick-off countdown
//   scene    SVG starfield; the away world on the left, the stadium world on
//            the right, the home training base above it; each ship on its
//            route, the flown part of the route in the club colour
//   ships    one row per ship: crest, club, phase tag, status line, progress
//
// The SVG carries no text: labels are page text laid over it by percentage,
// so they stay readable when the scene is phone-sized. Motion (engine flicker,
// a gentle bob) is CSS and stops under prefers-reduced-motion; the ships'
// travel itself is the timetable, not an animation.

import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { color, font, size, space, tone, type } from '../../../../shared/design';
import { Card, Crest, Stack, Tag } from '../../../../shared/ui';
import {
  formatSpan,
  legState,
  legStatus,
  matchJourney,
  worldOf,
  type Leg,
} from '../../logic/journey';

/** One club as the journey needs it. */
export interface JourneyTeam {
  name: string;
  color: string | null;
  /** Home world (teams.location). */
  location: string | null;
}

interface MatchJourneyProps {
  home: JourneyTeam;
  away: JourneyTeam;
  /** Kick-off, epoch ms. */
  kickoffMs: number;
  /** The stadium's name, for the header and the label. */
  ground: string | null;
  /** Seeds the starfield so a fixture always has the same sky. */
  seed: string;
}

// Scene geometry, in viewBox units. The phone scene is narrower (not just
// smaller) so the ships stay a readable size at 390 px.
const WIDE = { w: 1000, h: 420 };
/** The training base moon's radius. */
const BASE_R = 14;
const NARROW = { w: 560, h: 420 };

/**
 * The pre-kick-off journey panel.
 *
 * @returns A card with the countdown, the scene and both ships' status.
 */
export function MatchJourney({ home, away, kickoffMs, ground, seed }: MatchJourneyProps) {
  const now = useNow(1000);
  const narrow = useNarrow();
  const box = narrow ? NARROW : WIDE;
  const journey = useMemo(() => matchJourney(home.location, away.location, kickoffMs), [home.location, away.location, kickoffMs]);
  const stars = useMemo(() => starfield(seed, 90), [seed]);
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const stadiumWorld = worldOf(home.location);
  const awayWorld = worldOf(away.location);
  const derby = stadiumWorld.name === awayWorld.name;

  // Anchors (fractions of the box): the away world low left, the stadium
  // world right, the home club's training base above it.
  const P = {
    origin: { x: 0.13, y: 0.66 },
    stadium: { x: 0.8, y: 0.52 },
    base: { x: 0.66, y: 0.2 },
  };
  const at = (p: { x: number; y: number }) => ({ x: p.x * box.w, y: p.y * box.h });
  const origin = at(P.origin);
  const stadium = at(P.stadium);
  const base = at(P.base);
  const stadiumR = stadiumWorld.small ? 44 : 62;
  const originR = awayWorld.small ? 20 : 30;

  // Routes: the away ship arcs high over the void; the home ship drops in.
  const awayRoute = route(
    { x: origin.x + originR + 14, y: origin.y - 6 },
    { x: (origin.x + stadium.x) / 2, y: box.h * 0.04 },
    { x: stadium.x - stadiumR - 22, y: stadium.y - 18 },
  );
  const homeRoute = route(
    { x: base.x + BASE_R + 36, y: base.y + 4 },
    { x: base.x + 70, y: base.y + 30 },
    { x: stadium.x + 6, y: stadium.y - stadiumR - 20 },
  );

  const awayState = legState(journey.away, now);
  const homeState = legState(journey.home, now);
  const toKickoff = kickoffMs - now;

  const label = `${away.name}: ${legStatus(journey.away, now, clock)}. ${home.name}: ${legStatus(journey.home, now, clock)}.`;

  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <Stack direction="row" justify="space-between" align="end" gap={16} wrap style={{ padding: space[16] }}>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <span style={{ ...type.label, ...tone.secondary }}>Match day {derby ? `\u00B7 ${stadiumWorld.name} derby` : ''}</span>
          <span style={{ ...type.subheading }}>On the way to {ground ?? stadiumWorld.name}</span>
        </Stack>
        <Stack gap={4} align="end">
          <span style={{ ...type.label, ...tone.secondary }}>Kick-off in</span>
          <span style={{ fontFamily: font.score, fontSize: size.heading, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {formatSpan(toKickoff)}
          </span>
        </Stack>
      </Stack>

      <div style={{ position: 'relative', background: color.bg, borderTop: `1px solid ${color.lineFaint}`, borderBottom: `1px solid ${color.lineFaint}` }}>
        <svg viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: 'auto' }}>
          {stars.map((s, i) => (
            <circle key={i} cx={s.x * box.w} cy={s.y * box.h} r={s.r} fill={color.text} fillOpacity={s.o} />
          ))}

          {/* Routes: the whole way dashed, the flown part solid in the club colour. */}
          <path d={awayRoute.d} fill="none" stroke={color.line} strokeWidth={2} strokeDasharray="2 8" strokeLinecap="round" />
          <path d={awayRoute.d} fill="none" stroke={away.color ?? color.text} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={`${awayState.progress} 1`} />
          <path d={homeRoute.d} fill="none" stroke={color.line} strokeWidth={2} strokeDasharray="2 8" strokeLinecap="round" />
          <path d={homeRoute.d} fill="none" stroke={home.color ?? color.text} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={`${homeState.progress} 1`} />

          {/* The away club's world (a crescent of shadow gives it a sun side). */}
          <World cx={origin.x} cy={origin.y} r={originR} fill={awayWorld.color} />
          {/* The home club's training base: a small moon. */}
          <World cx={base.x} cy={base.y} r={BASE_R} fill={stadiumWorld.color} />
          {/* The stadium world, with the ground lit up on its rim in the home colour. */}
          <World cx={stadium.x} cy={stadium.y} r={stadiumR} fill={stadiumWorld.color} />
          <Stadium x={stadium.x + stadiumR * Math.cos(RIM)} y={stadium.y + stadiumR * Math.sin(RIM)} lit={home.color ?? color.text} />

          <Ship leg={journey.away} route={awayRoute} state={awayState} hull={away.color} dock={{ x: origin.x + originR + 34, y: origin.y - 2 }} park={{ x: stadium.x - stadiumR - 30, y: stadium.y + 6 }} />
          <Ship leg={journey.home} route={homeRoute} state={homeState} hull={home.color} dock={{ x: base.x + BASE_R + 36, y: base.y + 2 }} park={{ x: stadium.x + 26, y: stadium.y - stadiumR - 8 }} />
        </svg>

        {/* Labels over the scene, as page text. */}
        <SceneLabel x={P.origin.x} y={P.origin.y + 0.13} align="start" text={derby ? `${awayWorld.name}, far side` : awayWorld.name} />
        <SceneLabel x={P.base.x} y={P.base.y - 0.12} align="center" text="Training base" />
        <SceneLabel x={P.stadium.x} y={P.stadium.y + 0.2} align="center" text={stadiumWorld.name} />
      </div>

      <Stack gap={16} style={{ padding: space[16] }}>
        <ShipRow team={away} leg={journey.away} now={now} clock={clock} />
        <ShipRow team={home} leg={journey.home} now={now} clock={clock} />
      </Stack>

      <style>{`
        @keyframes isl-journey-flicker { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.45; } }
        @keyframes isl-journey-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes isl-journey-pulse { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.3; } }
        .isl-journey-flame { animation: isl-journey-flicker 0.35s ease-in-out infinite; }
        .isl-journey-bob { animation: isl-journey-bob 2.4s ease-in-out infinite; }
        .isl-journey-glow { animation: isl-journey-pulse 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .isl-journey-flame, .isl-journey-bob, .isl-journey-glow { animation: none; }
        }
      `}</style>
    </Card>
  );
}

// ── Scene pieces ────────────────────────────────────────────────────────────

/** Where on the stadium world's rim the ground sits (radians; up and left). */
const RIM = (-112 * Math.PI) / 180;

/**
 * The ground on the stadium world's rim: a bowl in the home colour with a lit
 * pitch, two floodlight masts and a slow glow, so it reads as a lit stadium.
 */
function Stadium({ x, y, lit }: { x: number; y: number; lit: string }) {
  return (
    <g transform={`translate(${x} ${y - 4})`}>
      <circle className="isl-journey-glow" cx={0} cy={-4} r={30} fill={lit} fillOpacity={0.2} />
      <line x1={-20} y1={0} x2={-20} y2={-18} stroke={color.text} strokeOpacity={0.7} strokeWidth={1.5} />
      <line x1={20} y1={0} x2={20} y2={-18} stroke={color.text} strokeOpacity={0.7} strokeWidth={1.5} />
      <circle cx={-20} cy={-19} r={2.5} fill={color.text} />
      <circle cx={20} cy={-19} r={2.5} fill={color.text} />
      <ellipse cx={0} cy={0} rx={18} ry={7} fill={lit} stroke={color.text} strokeOpacity={0.6} strokeWidth={1} />
      <ellipse cx={0} cy={-1} rx={11} ry={3.5} fill={color.text} fillOpacity={0.55} />
    </g>
  );
}

/** A world: a disc with a shadowed night side. */
function World({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const clip = useId();
  return (
    <g>
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx + r * 0.45} cy={cy + r * 0.25} r={r} fill={color.bg} fillOpacity={0.45} clipPath={`url(#${clip})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color.text} strokeOpacity={0.12} />
    </g>
  );
}

/** A route as a quadratic curve, with a point-and-heading lookup. */
interface Route {
  d: string;
  point: (t: number) => { x: number; y: number; angle: number };
}

function route(a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }): Route {
  return {
    d: `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`,
    point: (t) => {
      const u = 1 - t;
      const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
      const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
      const dx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
      const dy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
      return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
    },
  };
}

/**
 * A team ship: a long bus-like hull in the club colour with a row of lit
 * windows and an engine flame while it flies. Docked and landed ships sit
 * level beside their world.
 */
function Ship({
  route: r,
  state,
  hull,
  dock,
  park,
}: {
  leg: Leg;
  route: Route;
  state: ReturnType<typeof legState>;
  hull: string | null;
  dock: { x: number; y: number };
  park: { x: number; y: number };
}) {
  const flying = state.phase === 'flying';
  const p = flying ? r.point(state.progress) : { ...(state.phase === 'docked' ? dock : park), angle: 0 };
  const fill = hull ?? color.textSecondary;
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.angle})`} style={{ transition: 'transform 1s linear' }}>
      <g className={flying ? 'isl-journey-bob' : undefined}>
        {flying && (
          <path className="isl-journey-flame" d="M -30 -5 L -52 0 L -30 5 Z" fill={color.text} fillOpacity={0.85} />
        )}
        {/* Hull: flat-backed, rounded nose, a fin on top. */}
        <path d="M -30 -9 L 18 -9 Q 32 -9 34 0 Q 32 9 18 9 L -30 9 Z" fill={fill} stroke={color.text} strokeOpacity={0.55} strokeWidth={1.5} />
        <path d="M -26 -9 L -18 -17 L -10 -9 Z" fill={fill} stroke={color.text} strokeOpacity={0.55} strokeWidth={1.5} />
        {/* The bus windows. */}
        {[-20, -11, -2, 7].map((x) => (
          <rect key={x} x={x} y={-4} width={6} height={4} rx={1} fill={color.text} fillOpacity={0.85} />
        ))}
        <path d="M 20 -6 Q 29 -5 30 0 L 20 0 Z" fill={color.text} fillOpacity={0.6} />
      </g>
    </g>
  );
}

/** A label laid over the scene at a fraction of its size. */
function SceneLabel({ x, y, align, text }: { x: number; y: number; align: 'start' | 'center'; text: string }) {
  const style: CSSProperties = {
    ...type.label,
    ...tone.secondary,
    position: 'absolute',
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    transform: align === 'center' ? 'translateX(-50%)' : undefined,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };
  return <span aria-hidden="true" style={style}>{text}</span>;
}

// ── Status rows ─────────────────────────────────────────────────────────────

const PHASE_TAG: Record<ReturnType<typeof legState>['phase'], string> = {
  docked: 'In the hangar',
  flying: 'In flight',
  landed: 'Landed',
};

/** One ship's row: crest, club, phase, status line and a progress bar. */
function ShipRow({ team, leg, now, clock }: { team: JourneyTeam; leg: Leg; now: number; clock: (ms: number) => string }) {
  const s = legState(leg, now);
  return (
    <Stack gap={8}>
      <Stack direction="row" align="center" gap={8} wrap>
        <Crest color={team.color} size={24} />
        <span style={{ ...type.small, ...tone.primary, fontWeight: 700 }}>{team.name}</span>
        <Tag>{PHASE_TAG[s.phase]}</Tag>
      </Stack>
      <span style={{ ...type.small, ...tone.secondary }}>{legStatus(leg, now, clock)}</span>
      <div aria-hidden="true" style={{ height: space[4], background: color.lineFaint }}>
        <div style={{ height: '100%', width: `${s.progress * 100}%`, background: team.color ?? color.text, transition: 'width 1s linear' }} />
      </div>
    </Stack>
  );
}

// ── Hooks and helpers ───────────────────────────────────────────────────────

/** The wall clock, re-read every `everyMs`. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** True below 600 px, where the scene switches to its narrow layout. */
function useNarrow(): boolean {
  const query = '(max-width: 599px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/**
 * A fixed starfield for a fixture: positions, sizes and brightness from a
 * hash of the seed, so the sky does not reshuffle on every render.
 */
export function starfield(seed: string, count: number): Array<{ x: number; y: number; r: number; o: number }> {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => ({ x: next(), y: next(), r: 0.6 + next() * 1.4, o: 0.15 + next() * 0.55 }));
}
