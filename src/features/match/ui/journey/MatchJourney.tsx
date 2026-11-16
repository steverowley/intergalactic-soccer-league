// ── features/match/ui/journey/MatchJourney.tsx ──────────────────────────────
//
// Match day before kick-off: the two team ships (the ISL's team buses) on
// their way to the stadium, shown where the pitch will be (owner,
// 2026-11-13). The timetable is real (logic/journey.ts): the away ship
// leaves its home world early enough to land half an hour before kick-off,
// the home ship hops over from its training base, and the page shows where
// each is now.
//
// It sits in the match viewer's own frame and art style (owner, 2026-11-16:
// in keeping with the brand and the pixel style of the matches): the same
// 320 x 208 pixel canvas and hairline box, drawn with the viewer's pixel
// primitives in Lunar Dust on the Abyss, ships and stadium in the clubs'
// match kits (resolveKits, so a ship is the colour of its team's shirts).
// Text is page text from the design system: eyebrow, countdown, ship rows.
//
// Motion (engine flicker, a one-pixel bob, blinking floodlights, twinkling
// stars) runs at a chunky pixel frame rate and stops under reduced motion;
// the ships' travel is the timetable itself.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { color, font, hairline, size, space, tone, type } from '../../../../shared/design';
import { Crest, Stack, Tag } from '../../../../shared/ui';
import { useReducedMotion } from '@features/entities';
import { formatSpan, legState, legStatus, matchJourney, worldOf, type Leg } from '../../logic/journey';
import { resolveKits } from '../../logic/viewer';
import { PIXEL_SCALE } from '../viewer/render';
import { ART, drawJourney, labelAnchors, starfield } from './journeyArt';

export { starfield } from './journeyArt';

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
  /** The stadium's name, for the header. */
  ground: string | null;
  /** Seeds the starfield so a fixture always has the same sky. */
  seed: string;
}

/** Frame interval: chunky pixel animation, not a smooth 60. */
const FRAME_MS = 100;

/**
 * The pre-kick-off journey panel.
 *
 * @returns Header with the countdown, the pixel scene, both ships' status.
 */
export function MatchJourney({ home, away, kickoffMs, ground, seed }: MatchJourneyProps) {
  const now = useNow(1000);
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const journey = useMemo(() => matchJourney(home.location, away.location, kickoffMs), [home.location, away.location, kickoffMs]);
  const kits = useMemo(() => resolveKits(home.color, away.color), [home.color, away.color]);
  const stars = useMemo(() => starfield(seed, 70), [seed]);
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const stadiumWorld = worldOf(home.location);
  const awayWorld = worldOf(away.location);
  const derby = stadiumWorld.name === awayWorld.name;
  const awaySmall = awayWorld.small;
  const anchors = labelAnchors(awaySmall);

  const awayState = legState(journey.away, now);
  const homeState = legState(journey.home, now);

  // Draw: a loop at FRAME_MS for the little motions, or one still frame per
  // clock tick under reduced motion.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext?.('2d');
    if (!ctx) return undefined;
    const frame = (t: number) =>
      drawJourney(ctx, {
        away: { kit: kits.away.outfield, ...awayState },
        home: { kit: kits.home.outfield, ...homeState },
        homeKit: kits.home.outfield,
        awaySmall,
        stars,
        t,
      });
    if (reducedMotion) {
      frame(0);
      return undefined;
    }
    let raf = 0;
    let last = -Infinity;
    const loop = (t: number) => {
      if (t - last >= FRAME_MS) {
        last = t;
        frame(Math.max(1, t));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // The states are re-derived each second; their fields are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kits, awayState.phase, awayState.progress, homeState.phase, homeState.progress, awaySmall, stars, reducedMotion]);

  const label = `${away.name}: ${legStatus(journey.away, now, clock)}. ${home.name}: ${legStatus(journey.home, now, clock)}.`;

  return (
    <Stack gap={12}>
      <Stack direction="row" justify="space-between" align="end" gap={16} wrap>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <span style={{ ...type.label, ...tone.secondary }}>Match day{derby ? ` \u00B7 ${stadiumWorld.name} derby` : ''}</span>
          <span style={{ ...type.subheading }}>On the way to {ground ?? stadiumWorld.name}</span>
        </Stack>
        <Stack gap={4} align="end">
          <span style={{ ...type.label, ...tone.secondary }}>Kick-off in</span>
          <span style={{ fontFamily: font.label, fontSize: size.subheading, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {formatSpan(kickoffMs - now)}
          </span>
        </Stack>
      </Stack>

      {/* The match viewer's frame: same aspect, hairline and pixel canvas. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${ART.w} / ${ART.h}`,
          background: color.bg,
          ...hairline(color.line),
          boxSizing: 'border-box',
        }}
      >
        <canvas
          ref={canvasRef}
          width={ART.w * PIXEL_SCALE}
          height={ART.h * PIXEL_SCALE}
          role="img"
          aria-label={label}
          style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }}
        />
        <SceneLabel at={anchors.away} text={derby ? `${awayWorld.name}, far side` : awayWorld.name} />
        <SceneLabel at={anchors.base} text="Training base" align="end" />
        <SceneLabel at={anchors.ground} text={stadiumWorld.name} />
      </div>

      <Stack gap={12}>
        <ShipRow team={away} side="Away" leg={journey.away} now={now} clock={clock} bar={kits.away.outfield.shirt} />
        <ShipRow team={home} side="Home" leg={journey.home} now={now} clock={clock} bar={kits.home.outfield.shirt} />
      </Stack>
    </Stack>
  );
}

/** A place name laid over the scene, as page text in the label style. */
function SceneLabel({ at, text, align = 'center' }: { at: { x: number; y: number }; text: string; align?: 'center' | 'end' }) {
  const style: CSSProperties = {
    ...type.label,
    ...tone.secondary,
    position: 'absolute',
    left: `${at.x * 100}%`,
    top: `${at.y * 100}%`,
    transform: align === 'end' ? 'translateX(-100%)' : 'translateX(-50%)',
    // The viewer's overlay treatment (its Replay tag): an Abyss backing so
    // the label reads over a world.
    background: color.bg,
    padding: `0 ${space[4]}`,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };
  return <span aria-hidden="true" style={style}>{text}</span>;
}

const PHASE_TAG: Record<ReturnType<typeof legState>['phase'], string> = {
  docked: 'In the hangar',
  flying: 'In flight',
  landed: 'Landed',
};

/** One ship's row: crest, club, side, phase, status line and progress. */
function ShipRow({ team, side, leg, now, clock, bar }: { team: JourneyTeam; side: string; leg: Leg; now: number; clock: (ms: number) => string; bar: string }) {
  const s = legState(leg, now);
  return (
    <Stack gap={8}>
      <Stack direction="row" align="center" gap={8} wrap>
        <Crest color={team.color} size={24} />
        <span style={{ ...type.small, ...tone.primary, fontWeight: 700 }}>{team.name}</span>
        <span style={{ ...type.label, ...tone.secondary }}>{side}</span>
        <Tag>{PHASE_TAG[s.phase]}</Tag>
      </Stack>
      <span style={{ ...type.small, ...tone.secondary }}>{legStatus(leg, now, clock)}</span>
      <div aria-hidden="true" style={{ height: space[4], background: color.lineFaint }}>
        <div style={{ height: '100%', width: `${s.progress * 100}%`, background: bar }} />
      </div>
    </Stack>
  );
}

/** The wall clock, re-read every `everyMs`. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
