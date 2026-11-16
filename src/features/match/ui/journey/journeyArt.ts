// ── features/match/ui/journey/journeyArt.ts ─────────────────────────────────
//
// The match-day journey drawn the way the match viewer draws the pitch
// (docs/match-viewer.md): one coarse pixel grid on a 320 x 208 art canvas,
// the viewer's own primitives (figure.ts), Galactic Abyss and Lunar Dust
// shades only, and the club kit colour as the one strong colour. Worlds are
// Lunar Dust with a dithered night side; the team ships are little pixel
// buses in their club's kit, with the squad's heads in the windows.
//
// Pure drawing: everything comes in through `JourneyFrame`, so the panel
// owns the clock and the loop.

import { canvasColor } from '../../../../shared/design';
import type { Kit } from '../../logic/viewer';
import { pixelEllipse, pline, px, resetFill, setGrid } from '../viewer/figure';
import { PIXEL_SCALE } from '../viewer/render';
import type { LegPhase } from '../../logic/journey';

/** Art canvas, the same as the match viewer's. */
export const ART = { w: 320, h: 208 } as const;

/** One ship's state for a frame. */
export interface ShipFrame {
  kit: Kit;
  phase: LegPhase;
  progress: number;
}

/** Everything a frame needs. */
export interface JourneyFrame {
  away: ShipFrame;
  home: ShipFrame;
  /** The home club's kit, for the stadium bowl. */
  homeKit: Kit;
  /** The away world is a moon or colony: drawn smaller. */
  awaySmall: boolean;
  /** Fixed stars for this fixture, in art pixels. */
  stars: ReadonlyArray<{ x: number; y: number; o: number }>;
  /** Animation time, ms (0 under reduced motion). */
  t: number;
}

// ── Layout (art pixels) ─────────────────────────────────────────────────────

/** The stadium world: a big horizon low on the right. */
const STADIUM_WORLD = { cx: 266, cy: 292, r: 132 };
/** The home club's training base: a small moon top right. */
const BASE = { cx: 286, cy: 40, r: 7 };
/** Where the ground sits on the stadium world's horizon. */
const GROUND_X = 228;

/** The away world, low left. */
export function awayWorld(small: boolean) {
  return { cx: 46, cy: 150, r: small ? 13 : 21 };
}

/** Surface height of the stadium world at column x. */
function horizonY(x: number): number {
  const { cx, cy, r } = STADIUM_WORLD;
  const dx = x - cx;
  return cy - Math.sqrt(Math.max(0, r * r - dx * dx));
}

/** Label anchors as fractions of the canvas, for page text laid over it. */
export function labelAnchors(small: boolean) {
  const w = awayWorld(small);
  return {
    away: { x: w.cx / ART.w, y: (w.cy + w.r + 6) / ART.h },
    base: { x: (BASE.cx + BASE.r + 4) / ART.w, y: (BASE.cy + BASE.r + 4) / ART.h },
    ground: { x: GROUND_X / ART.w, y: (horizonY(GROUND_X) + 10) / ART.h },
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

function quad(a: Pt, c: Pt, b: Pt) {
  return (t: number): Pt => {
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  };
}

/** The two routes and the ships' rest points (sprite centres). */
function routes(small: boolean) {
  const w = awayWorld(small);
  const gy = horizonY(GROUND_X);
  const awayDock = { x: w.cx + w.r + 16, y: w.cy - 4 };
  const awayPark = { x: GROUND_X - 44, y: horizonY(GROUND_X - 44) - 6 };
  const homeDock = { x: BASE.cx - 22, y: BASE.cy + 2 };
  const homePark = { x: GROUND_X + 46, y: horizonY(GROUND_X + 46) - 6 };
  return {
    away: { at: quad(awayDock, { x: 130, y: 6 }, awayPark), dock: awayDock, park: awayPark },
    home: { at: quad(homeDock, { x: GROUND_X + 70, y: gy - 50 }, homePark), dock: homeDock, park: homePark },
  };
}

// ── Sprites ─────────────────────────────────────────────────────────────────

/**
 * The team ship, facing right: a long bus hull in the kit, a cockpit, a row
 * of windows with heads in them, a dark underside and landing skids.
 *   o outline  k kit  c cockpit glass  w window  h a head  d underside  s skid
 */
const SHIP = [
  '.......ooooooo..........',
  '......okkkkkkko.........',
  'oooooookkkkkkkooooooo...',
  'okkkkkkkkkkkkkkkkkkkkoo.',
  'okwhwkwhwkwwwkwhwkkkccko',
  'okwwwkwwwkwwwkwwwkkkccko',
  'okkkkkkkkkkkkkkkkkkkkkko',
  'oddddddddddddddddddddddo',
  '.ooo.................oo.',
  '.s.s.................s.s',
];
const SHIP_W = SHIP[0]!.length;
const SHIP_H = SHIP.length;

/** Draw a ship with its centre at (cx, cy). */
function drawShip(ctx: CanvasRenderingContext2D, cx: number, cy: number, kit: Kit, flying: boolean, t: number, seed: number) {
  const x0 = Math.round(cx - SHIP_W / 2);
  const bob = flying ? (Math.sin(t / 380 + seed) > 0 ? 0 : 1) : 0;
  const y0 = Math.round(cy - SHIP_H / 2) + bob;
  const pal: Record<string, string> = {
    o: kit.outline,
    k: kit.shirt,
    c: canvasColor.figureLight,
    w: canvasColor.text,
    h: canvasColor.figureMid,
    d: canvasColor.figureDark,
    s: canvasColor.figureMid,
  };
  // Shadow under a ship standing on the ground.
  if (!flying) px(ctx, x0 + 1, y0 + SHIP_H, SHIP_W - 2, 1, canvasColor.shadow);
  for (let r = 0; r < SHIP_H; r++) {
    const row = SHIP[r]!;
    // Skids only when on the ground; in flight the gear is up.
    if (flying && r >= SHIP_H - 2) continue;
    for (let c = 0; c < SHIP_W; c++) {
      const col = pal[row[c]!];
      if (col) px(ctx, x0 + c, y0 + r, 1, 1, col);
    }
  }
  if (flying) {
    // Engine: a flickering pixel flame off the tail.
    const len = 3 + (Math.floor(t / 90 + seed * 7) % 3);
    px(ctx, x0 - len, y0 + 4, len, 2, canvasColor.text);
    px(ctx, x0 - 2, y0 + 4, 2, 2, canvasColor.figureGlow);
    px(ctx, x0 - len - 2, y0 + 4 + (Math.floor(t / 120) % 2), 1, 1, canvasColor.figureLight);
  }
}

/**
 * A world: Lunar Dust disc, lit from the upper left, the night side dithered
 * in, a few seeded craters.
 */
function drawWorld(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number, dim = 0) {
  pixelEllipse(ctx, cx, cy, r, r, canvasColor.figureDark);
  const lx = -0.55, ly = -0.65;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    if (y < -1 || y > ART.h) continue;
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const dz = Math.sqrt(1 - d2);
      const light = dx * lx + dy * ly + dz * 0.5 - dim;
      // Mostly the mid shade, a lit cap on the sun side, the terminator
      // dithered into the dark: the viewer's tones, never a pale blob.
      if (light > 0.82) px(ctx, x, y, 1, 1, canvasColor.figureLight);
      else if (light > 0.72 && (x + y) % 2 === 0) px(ctx, x, y, 1, 1, canvasColor.figureLight);
      else if (light > 0.3) px(ctx, x, y, 1, 1, canvasColor.figureMid);
      else if (light > 0.12 && (x + y) % 2 === 0) px(ctx, x, y, 1, 1, canvasColor.figureMid);
    }
  }
  // Craters.
  let h = seed * 9973 + 17;
  const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < Math.max(2, Math.round(r / 5)); i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.7;
    const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
    if (y > ART.h) continue;
    px(ctx, x, y, 2, 1, canvasColor.figureDark);
    px(ctx, x, y - 1, 2, 1, canvasColor.figureMid);
  }
}

/**
 * The ground on the stadium world's horizon: a stand in the home kit around
 * a lit pitch, two floodlight masts whose lamps blink on in turn, and pixel
 * beams falling onto the pitch.
 */
function drawStadium(ctx: CanvasRenderingContext2D, kit: Kit, t: number) {
  const gx = GROUND_X;
  const gy = Math.round(horizonY(gx));
  // Beams first, behind the stand.
  pline(ctx, gx - 26, gy - 32, gx - 10, gy - 8, canvasColor.line);
  pline(ctx, gx + 26, gy - 32, gx + 10, gy - 8, canvasColor.line);
  // Masts and lamp heads; the lamps flicker on in turn.
  for (const side of [-1, 1]) {
    const mx = gx + side * 27;
    px(ctx, mx, gy - 32, 1, 30, canvasColor.figureMid);
    const lit = t === 0 || Math.floor(t / 700 + (side > 0 ? 0.5 : 0)) % 2 === 0;
    px(ctx, mx - 2, gy - 35, 5, 3, canvasColor.figureDark);
    px(ctx, mx - 1, gy - 34, 3, 1, lit ? canvasColor.figureGlow : canvasColor.figureLight);
  }
  // The stand: a stepped bowl in the kit, the upper tier outlined.
  pixelEllipse(ctx, gx, gy - 4, 24, 9, kit.outline);
  pixelEllipse(ctx, gx, gy - 4, 23, 8, kit.shirt);
  pixelEllipse(ctx, gx, gy - 5, 19, 6, kit.outline);
  // The pitch inside, lit, with its halfway line and centre circle.
  pixelEllipse(ctx, gx, gy - 5, 15, 4, canvasColor.text);
  px(ctx, gx, gy - 9, 1, 8, canvasColor.figureMid);
  px(ctx, gx - 2, gy - 6, 1, 2, canvasColor.figureMid);
  px(ctx, gx + 2, gy - 6, 1, 2, canvasColor.figureMid);
}

/** A route as dots, the flown part solid in the kit. */
function drawRoute(ctx: CanvasRenderingContext2D, at: (t: number) => Pt, progress: number, kit: Kit) {
  const steps = 120;
  let prev = at(0);
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const p = at(s);
    if (s <= progress) pline(ctx, prev.x, prev.y, p.x, p.y, kit.shirt, 1, true);
    else if (i % 3 === 0) px(ctx, p.x, p.y, 1, 1, canvasColor.line);
    prev = p;
  }
}

// ── Frame ───────────────────────────────────────────────────────────────────

/**
 * Draw one frame into a canvas sized ART x PIXEL_SCALE.
 */
export function drawJourney(ctx: CanvasRenderingContext2D, f: JourneyFrame): void {
  setGrid(PIXEL_SCALE);
  resetFill();
  px(ctx, 0, 0, ART.w, ART.h, canvasColor.bg);

  // Stars: single pixels, a few twinkling.
  f.stars.forEach((s, i) => {
    const twinkle = f.t !== 0 && i % 9 === 0 && Math.floor(f.t / 500 + i) % 4 === 0;
    if (!twinkle) px(ctx, s.x, s.y, 1, 1, s.o > 0.5 ? canvasColor.figureMid : canvasColor.figureDark);
  });

  const w = awayWorld(f.awaySmall);
  const r = routes(f.awaySmall);
  drawWorld(ctx, w.cx, w.cy, w.r, 3);
  drawWorld(ctx, BASE.cx, BASE.cy, BASE.r, 5);
  drawRoute(ctx, r.away.at, f.away.phase === 'docked' ? -1 : f.away.progress, f.away.kit);
  drawRoute(ctx, r.home.at, f.home.phase === 'docked' ? -1 : f.home.progress, f.home.kit);
  // The near world fills the corner, so it is dimmed: the stadium is the bright thing on it.
  drawWorld(ctx, STADIUM_WORLD.cx, STADIUM_WORLD.cy, STADIUM_WORLD.r, 8, 0.45);
  drawStadium(ctx, f.homeKit, f.t);

  const place = (s: ShipFrame, leg: (typeof r)['away'], seed: number) => {
    const flying = s.phase === 'flying';
    const p = flying ? leg.at(s.progress) : s.phase === 'docked' ? leg.dock : leg.park;
    drawShip(ctx, p.x, p.y, s.kit, flying, f.t, seed);
  };
  place(f.home, r.home, 1.7);
  place(f.away, r.away, 0.3);
}

/**
 * A fixed starfield for a fixture (art pixels), seeded from its id so the sky
 * never reshuffles. Keeps clear of the stadium world.
 */
export function starfield(seed: string, count: number): Array<{ x: number; y: number; o: number }> {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const out: Array<{ x: number; y: number; o: number }> = [];
  while (out.length < count) {
    const s = { x: Math.floor(next() * ART.w), y: Math.floor(next() * ART.h), o: next() };
    if (s.y < horizonY(s.x) - 2) out.push(s);
  }
  return out;
}
