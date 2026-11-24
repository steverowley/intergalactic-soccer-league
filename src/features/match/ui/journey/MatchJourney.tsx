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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { color, font, hairline, size, space, tone, type } from '../../../../shared/design';
import { Crest, Stack, Tag } from '../../../../shared/ui';
import { useReducedMotion } from '@features/entities';
import { formatSpan, legState, legStatus, matchJourney, worldOf, type Leg } from '../../logic/journey';
import { resolveKits } from '../../logic/viewer';
import { PIXEL_SCALE } from '../viewer/render';
import { groundFor } from '../../../../data/stadiums';
import { ART, drawJourney, horizonY, journeyLayout, starfield } from './journeyArt';
import { placeLabel, type Box } from './labelPlacement';

export { starfield } from './journeyArt';

/** One club as the journey needs it. */
export interface JourneyTeam {
  /** Team id: picks the club's ground from the lore (data/stadiums.ts). */
  id?: string | null;
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
export function MatchJourney({ home, away, kickoffMs, ground: groundName, seed }: MatchJourneyProps) {
  const now = useNow(1000);
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);


  const kits = useMemo(() => resolveKits(home.color, away.color), [home.color, away.color]);
  const stars = useMemo(() => starfield(seed, 70), [seed]);
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const stadiumWorld = worldOf(home.location);
  const awayWorld = worldOf(away.location);
  const derby = stadiumWorld.name === awayWorld.name;
  const ground = useMemo(() => groundFor(home.id), [home.id]);
  const journey = useMemo(
    () => matchJourney(home.location, away.location, kickoffMs, ground.training?.name),
    [home.location, away.location, kickoffMs, ground],
  );
  // The real sky on the day, and everything placed from it.
  const layout = useMemo(
    () => journeyLayout(stadiumWorld.name, awayWorld.name, kickoffMs, ground.look.style, ground.capacity),
    [stadiumWorld.name, awayWorld.name, kickoffMs, ground],
  );
  const geometry = useMemo(
    () => ({
      obstacles: [
        ...layout.boxes.sky.map((b) => b.box),
        layout.boxes.base,
        layout.boxes.ground,
        ...layout.boxes.ships,
      ],
      horizon: horizonY,
    }),
    [layout],
  );
  const sideOrder = ['above', 'below', 'right', 'left'] as const;
  const labels: SceneLabelSpec[] = [
    ...(layout.boxes.away
      ? [{ key: 'away', text: awayWorld.name, target: layout.boxes.away, order: sideOrder }]
      : [{ key: 'away', text: `${awayWorld.name}, far side`, target: layout.boxes.ships[0]!, order: ['above', 'left'] as const }]),
    { key: 'base', text: ground.training?.name ?? 'Training ground', target: layout.boxes.base, order: ['above', 'right'] as const },
    { key: 'ground', text: stadiumWorld.name, target: layout.boxes.ground, order: ['above', 'right', 'left'] as const },
    // The Sun and the other worlds are named when there is clear room.
    ...layout.boxes.sky
      .filter((b) => b.kind !== 'away')
      .map((b) => ({ key: `sky-${b.name}`, text: b.name === 'Largest Orbital Colony' ? 'Orbital Colony' : b.name, target: b.box, order: sideOrder, optional: true })),
  ];
  const frameRef = useRef<HTMLDivElement>(null);
  const placed = useLabelLayout(frameRef, labels, geometry);

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
        stadium: { style: ground.look.style, capacity: ground.capacity },
        homeLook: stadiumWorld.look,
        layout,
        training: ground.training?.quality ?? 'standard',
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
  }, [kits, awayState.phase, awayState.progress, homeState.phase, homeState.progress, stadiumWorld.look, layout, ground, stars, reducedMotion]);

  const label = `${away.name}: ${legStatus(journey.away, now, clock)}. ${home.name}: ${legStatus(journey.home, now, clock)}.`;

  return (
    <Stack gap={12}>
      <Stack direction="row" justify="space-between" align="end" gap={16} wrap>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <span style={{ ...type.label, ...tone.secondary }}>Match day{derby ? ` \u00B7 ${stadiumWorld.name} derby` : ''}</span>
          <span style={{ ...type.subheading }}>On the way to {groundName ?? ground.name ?? stadiumWorld.name}</span>
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
        ref={frameRef}
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
        {labels.map((l) =>
          placed[l.key] === null ? null : <SceneLabel key={l.key} name={l.key} text={l.text} at={placed[l.key] ?? undefined} />,
        )}
      </div>

      {/* The ground, in the lore's own words. */}
      {(ground.nickname || ground.look.line) && (
        <Stack gap={4}>
          {ground.nickname && <span style={{ ...type.label, ...tone.secondary }}>{`${ground.name ?? ''} \u00B7 ${ground.nickname}`}</span>}
          {ground.look.line && <span style={{ ...type.small, ...tone.primary }}>{`\u201C${ground.look.line}\u201D`}</span>}
        </Stack>
      )}

      <Stack gap={12}>
        <ShipRow team={away} side="Away" leg={journey.away} now={now} clock={clock} bar={kits.away.outfield.shirt} />
        <ShipRow team={home} side="Home" leg={journey.home} now={now} clock={clock} bar={kits.home.outfield.shirt} />
      </Stack>
    </Stack>
  );
}

/**
 * A place name over the scene, in the label style, at the spot the layout
 * found for it (hidden until measured).
 */
function SceneLabel({ name, text, at }: { name: string; text: string; at: { x: number; y: number } | undefined }) {
  const style: CSSProperties = {
    ...type.label,
    ...tone.secondary,
    position: 'absolute',
    left: at ? at.x : 0,
    top: at ? at.y : 0,
    visibility: at ? 'visible' : 'hidden',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };
  return (
    <span data-scene-label={name} aria-hidden="true" style={style}>
      {text}
    </span>
  );
}

/** Space kept from the frame's edges and between a label and anything else. */
const LABEL_MARGIN = 12;
const LABEL_GAP = 8;

/**
 * Lay the scene labels out in clear sky: measure the frame and each label,
 * then place them one by one (labelPlacement.ts), each placed label becoming
 * an obstacle for the next. Re-runs when the frame is resized.
 */
/** A label for the scene: what it names, where to try, and whether it may be left out. */
interface SceneLabelSpec {
  key: string;
  text: string;
  target: Box;
  order: ReadonlyArray<'above' | 'below' | 'left' | 'right'>;
  /** Left out (null) when it has no clean spot. */
  optional?: boolean;
}

function useLabelLayout(
  frameRef: React.RefObject<HTMLDivElement | null>,
  labels: readonly SceneLabelSpec[],
  geometry: { obstacles: readonly Box[]; horizon: (x: number) => number },
): Record<string, { x: number; y: number } | null> {
  const [placed, setPlaced] = useState<Record<string, { x: number; y: number } | null>>({});
  const signature = labels.map((l) => `${l.key}:${l.text}`).join('|');
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const layout = () => {
      const fw = frame.clientWidth, fh = frame.clientHeight;
      if (!fw || !fh) return;
      const k = fw / ART.w;
      const scale = (b: Box): Box => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k });
      const obstacles = geometry.obstacles.map(scale);
      const next: Record<string, { x: number; y: number } | null> = {};
      for (const l of labels) {
        const el = frame.querySelector<HTMLElement>(`[data-scene-label="${l.key}"]`);
        if (!el) continue;
        const size = { w: el.offsetWidth, h: el.offsetHeight };
        const p = placeLabel({
          size,
          target: scale(l.target),
          order: l.order,
          frame: { w: fw, h: fh },
          margin: LABEL_MARGIN,
          gap: LABEL_GAP,
          obstacles,
          horizon: (x) => geometry.horizon(x / k) * k,
        });
        if (l.optional && p.cost > 0) {
          next[l.key] = null;
          continue;
        }
        next[l.key] = { x: p.x, y: p.y };
        obstacles.push({ x: p.x, y: p.y, w: size.w, h: size.h });
      }
      setPlaced(next);
    };
    layout();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(layout);
    ro.observe(frame);
    return () => ro.disconnect();
    // labels/geometry are rebuilt each render; their content is the signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, geometry]);
  return placed;
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
