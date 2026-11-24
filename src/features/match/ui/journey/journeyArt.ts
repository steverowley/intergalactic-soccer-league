// ── features/match/ui/journey/journeyArt.ts ─────────────────────────────────
//
// The match-day journey drawn the way the match viewer draws the pitch
// (docs/match-viewer.md): one coarse pixel grid on a 320 x 208 art canvas,
// the viewer's own primitives (figure.ts), on the Galactic Abyss.
//
// Each world is drawn as its real body (owner, 2026-11-16: "realistic to our
// solar system"): Jupiter's belts and Great Red Spot, Saturn's and Uranus'
// rings, Earth's oceans, continents and caps, Mars' rust and polar caps,
// Europa's cracked ice, Titan's haze, Enceladus' tiger stripes, Pluto's
// heart, lumpy asteroids, an orbital ring station. The looks live in
// data/leagueData.ts (world data).
//
// And the sky is the real one on the day (owner, 2026-11-16: "real
// positional planets"): logic/sky.ts places the Sun, the planets and the away
// club's world where they actually are as seen from the home ground, sized
// by their real apparent size and lit at their real phase, so every fixture
// has its own sky. The away ship sets off from beside the away world; the
// home ship hops over the horizon from the club's own training facility (the
// lore's, data/stadiums.ts), drawn to its quality tier.
//
// The sky and ground are static for a fixture, so they are drawn once into
// an offscreen layer; each animation frame copies that and adds the moving
// parts.

import { SKY_LOOKS, TRAINING_MOON, WORLDS, type WorldLook } from '../../../../data/leagueData';
import type { StadiumStyle, TrainingQuality } from '../../../../data/stadiums';
import { skyScene, type SkyBody } from '../../logic/sky';
import { deckLift, drawStadium, skyBody, stadiumExtent } from './stadiumArt';
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
  /** The home club's kit, for the stadium stand. */
  homeKit: Kit;
  /** The home club's ground (data/stadiums.ts) and its seats. */
  stadium: { style: StadiumStyle; capacity: number };
  /** The stadium (home) world. */
  homeLook: WorldLook;
  /** The scene's real sky and everything placed from it (journeyLayout). */
  layout: JourneyLayout;
  /** The home club's training facility tier. */
  training: TrainingQuality;
  /** Fixed stars for this fixture, in art pixels. */
  stars: ReadonlyArray<{ x: number; y: number; o: number }>;
  /** Animation time, ms (0 under reduced motion). */
  t: number;
}

// ── Layout (art pixels) ─────────────────────────────────────────────────────

/**
 * The stadium world, seen on arrival: a wide, gently curving horizon along
 * the bottom of the scene, nearly level, so the grounds and the parked ships
 * stand on land.
 */
const STADIUM_WORLD = { cx: 160, cy: 760, r: 600 };
/** Where the ground stands. */
const GROUND_X = 224;
/** Where the club's training facility stands, over to the left. */
const BASE_X = 54;
/** Space kept from the frame's edges. */
const PAD = 14;

/** Drawn radius per size class (the shelf's world gallery). */
const SIZE_R: Record<WorldLook['size'], number> = { giant: 26, planet: 19, moon: 13, minor: 10 };

/** Surface height of the stadium world at column x. */
export function horizonY(x: number): number {
  const { cx, cy, r } = STADIUM_WORLD;
  const dx = x - cx;
  return cy - Math.sqrt(Math.max(0, r * r - dx * dx));
}

/** A box in art pixels. */
export interface ArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pt = { x: number; y: number };

function quad(a: Pt, c: Pt, b: Pt) {
  return (t: number): Pt => {
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  };
}

/** One ship's way: the route, where it waits and where it lands. */
export interface Way {
  at: (t: number) => Pt;
  dock: Pt;
  park: Pt;
}

/** Everything placed for one fixture. */
export interface JourneyLayout {
  /** Bodies in the sky, farthest first. */
  sky: SkyBody[];
  /** The away world in the sky (null for a derby). */
  awayBody: SkyBody | null;
  away: Way;
  home: Way;
  /** Training facility position on the horizon. */
  base: Pt;
  /** Label targets and things labels keep clear of. */
  boxes: { away: ArtBox | null; base: ArtBox; ground: ArtBox; sky: Array<{ name: string; box: ArtBox; kind: SkyBody['kind'] }>; ships: ArtBox[] };
}

/** Grounds with no surface under them: the ships park at deck height. */
const FLOATING: readonly StadiumStyle[] = ['storm', 'tilted', 'colosseum'];

/** How far a body's drawing reaches either side (rings, Haumea's stretch). */
function reach(name: string, r: number): number {
  const look = lookFor(name);
  return look?.ring ? r * 1.95 : look?.feature === 'ellipsoid' ? r * 1.55 : r;
}

/**
 * Place everything for a fixture from the real sky.
 *
 * @param home   Home club's location.
 * @param away   Away club's location.
 * @param ms     When (kick-off).
 * @param style  The home ground, for its height and deck.
 */
export function journeyLayout(home: string, away: string, ms: number, style: StadiumStyle, capacity: number): JourneyLayout {
  const { bodies, away: awayBody } = skyScene(home, away, ms, { width: ART.w, horizon: horizonY, pad: PAD });
  const deck = FLOATING.includes(style) ? deckLift(style) : 0;
  const parkAt = (x: number): Pt => ({ x, y: horizonY(x) - 6 - deck });

  // The away ship waits beside its world, on the side facing the ground; a
  // derby visitor comes over the far horizon.
  let awayDock: Pt;
  if (awayBody) {
    const toward = Math.sign(GROUND_X - awayBody.x) || -1;
    const gap = reach(awayBody.name, awayBody.r) + 16;
    let x = awayBody.x + toward * gap;
    if (x < PAD + 12 || x > ART.w - PAD - 12) x = awayBody.x - toward * gap;
    awayDock = { x: Math.min(Math.max(x, PAD + 12), ART.w - PAD - 12), y: awayBody.y };
  } else {
    awayDock = { x: ART.w - PAD - 12, y: horizonY(ART.w - PAD - 12) - 6 };
  }
  // It lands on the side of the ground it waits on, so it never crosses its
  // own world; the home ship takes the other side.
  const side = awayDock.x > GROUND_X ? 1 : -1;
  const awayPark = parkAt(GROUND_X + side * 46);
  const homePark = parkAt(GROUND_X - side * 44);
  const base = { x: BASE_X, y: horizonY(BASE_X) };
  const homeDock = { x: BASE_X + 26, y: horizonY(BASE_X + 26) - 6 - (FLOATING.includes(style) ? 8 : 0) };
  const arcTop = (a: Pt, b: Pt, lift: number): Pt => ({ x: (a.x + b.x) / 2, y: Math.max(PAD, Math.min(a.y, b.y) - lift) });

  const ext = stadiumExtent(style, capacity);
  const gTop = horizonY(GROUND_X) - ext.up;
  const shipBox = (p: Pt): ArtBox => ({ x: p.x - 14, y: p.y - 7, w: 28, h: 14 });
  return {
    sky: bodies,
    awayBody,
    // The away ship comes in on a descent: out from its world, then down to
    // the ground, never looping up through the sky. A derby visitor hops
    // over the horizon.
    away: {
      at: quad(awayDock, awayBody ? { x: awayPark.x, y: awayDock.y } : arcTop(awayDock, awayPark, 34), awayPark),
      dock: awayDock,
      park: awayPark,
    },
    home: { at: quad(homeDock, arcTop(homeDock, homePark, 34), homePark), dock: homeDock, park: homePark },
    base,
    boxes: {
      away: awayBody ? { x: awayBody.x - reach(awayBody.name, awayBody.r), y: awayBody.y - awayBody.r, w: reach(awayBody.name, awayBody.r) * 2, h: awayBody.r * 2 } : null,
      base: { x: BASE_X - 16, y: base.y - 22, w: 32, h: 22 },
      ground: { x: GROUND_X - ext.half, y: gTop, w: ext.half * 2, h: horizonY(GROUND_X) - gTop },
      sky: bodies.map((b) => ({ name: b.name, kind: b.kind, box: { x: b.x - reach(b.name, b.r), y: b.y - b.r, w: reach(b.name, b.r) * 2, h: b.r * 2 } })),
      ships: [shipBox(awayDock), shipBox(awayPark), shipBox(homeDock), shipBox(homePark)],
    },
  };
}

/** The look for a body in the sky (club worlds, then the Moon and Neptune). */
export function lookFor(name: string): WorldLook | undefined {
  return WORLDS[name]?.look ?? SKY_LOOKS[name];
}

// ── Noise ───────────────────────────────────────────────────────────────────

/** Smooth value noise in [0, 1) on a seeded lattice. */
function noise(x: number, y: number, seed: number): number {
  const h = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Light from the upper left (the shelf's galleries and the near world). */
const DEFAULT_LIGHT = { x: -0.55, y: -0.65, z: 0.5 };

// ── Worlds ──────────────────────────────────────────────────────────────────

/**
 * A world as its real body: a disc lit from the Sun's side in its three shades
 * with a dithered terminator, then its surface feature.
 *
 * @param dim  Darkens the lighting (the near stadium world, so the stand is
 *             the brightest thing on it).
 * @param sun  Unit direction of the light (screen x, screen y down, toward
 *             the viewer): the real phase in the sky.
 */
function drawBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  look: WorldLook,
  seed: number,
  dim = 0,
  sun: { x: number; y: number; z: number } = DEFAULT_LIGHT,
) {
  if (look.feature === 'station') return drawStation(ctx, cx, cy, r, look);
  const [night, day, lit] = look.shades;
  const f = look.feature;
  const stretch = f === 'ellipsoid' ? 1.55 : 1;
  const xr = r * stretch;

  if (look.ring && r < 60) ringPixels(ctx, cx, cy, r, look.ring, 'back');

  for (let y = Math.max(0, Math.floor(cy - r - 2)); y <= Math.min(ART.h - 1, Math.ceil(cy + r + 2)); y++) {
    for (let x = Math.max(0, Math.floor(cx - xr - 2)); x <= Math.min(ART.w - 1, Math.ceil(cx + xr + 2)); x++) {
      const dx = (x + 0.5 - cx) / xr;
      const dy = (y + 0.5 - cy) / r;
      let edge = 1;
      // Lumpy outline for a small rock; the near world keeps a true horizon
      // so the ground and the parked ships sit on it.
      if (f === 'asteroid' && r < 60) {
        // A lumpy outline: the radius wanders with the angle.
        const a = Math.atan2(dy, dx);
        edge = 0.78 + 0.3 * noise(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, seed);
      }
      const d2 = dx * dx + dy * dy;
      if (d2 >= edge * edge) continue;
      const dz = Math.sqrt(Math.max(0, 1 - d2 / (edge * edge)));
      const light = sun.x * dx + sun.y * dy + sun.z * dz - dim;
      const even = (x + y) % 2 === 0;
      // 0 night, 1 day, 2 lit; the two bands between are dithered.
      let tone = light > 0.8 ? 2 : light > 0.7 ? (even ? 2 : 1) : light > 0.3 ? 1 : light > 0.14 ? (even ? 1 : 0) : 0;
      let col = tone === 2 ? lit : tone === 1 ? day : night;
      // Surface detail scales with the drawn size, so the near world's
      // horizon has continents and cloud the size of the small worlds', not
      // a few giant blobs. Seen from its surface, it shows no polar cap.
      const detail = 3 * Math.max(1, r / 22);
      const sx = dx * detail, sy = dy * detail;
      const near = r > 60;

      switch (f) {
        case 'earth': {
          const land = noise(sx + 1.3, sy * 1.2, seed) > 0.56;
          if (land && tone > 0) col = look.land!;
          if (!near && Math.abs(dy) > 0.84 && tone > 0) col = look.cap!;
          else if (noise(sx * 2.2, sy * 5, seed + 9) > 0.78 && tone > 0) col = look.cap!;
          break;
        }
        case 'mars':
          if (noise(sx + 4, sy + 2, seed) > 0.62 && tone > 0) col = look.land!;
          if (!near && Math.abs(dy) > 0.82 && tone > 0) col = look.cap!;
          break;
        case 'bands': {
          // Belts across the globe, wobbling a little.
          const band = Math.floor((dy + 1) * 5.5 * (near ? r / 22 : 1) + 0.6 * noise(sx * 2, dy * 2, seed)) % 2;
          if (band === 1 && tone > 0) tone -= 1;
          col = tone === 2 ? lit : tone === 1 ? day : night;
          if (look.mark) {
            const ex = (dx - 0.28) / 0.24, ey = (dy - 0.36) / 0.12;
            if (ex * ex + ey * ey < 1 && light > 0.05) col = look.mark;
          }
          break;
        }
        case 'clouds': {
          const streak = noise(sx * 0.8, sy * 4 + dx * 2, seed) > 0.55;
          if (streak && tone < 2 && light > 0.2) col = tone === 1 ? lit : day;
          break;
        }
        case 'haze':
          // Smooth: no surface detail, a bright limb on the day side.
          if (d2 > 0.86 && light > 0.2) col = lit;
          break;
        case 'ice': {
          const crack = Math.abs(Math.sin(dx * 7 + noise(sx, sy, seed) * 4)) < 0.1 || Math.abs(Math.sin(dy * 6 - dx * 3 + noise(sx + 3, sy, seed) * 3)) < 0.08;
          if (crack && tone > 0) col = look.mark!;
          break;
        }
        case 'tiger':
          // The stripes vent from the south pole, visible even on its night side.
          if (dy > 0.3 && Math.abs(Math.sin(dx * 9 + dy * 3)) < 0.25) col = look.mark!;
          break;
        case 'heart': {
          // Tombaugh Regio: two lobes over a point, low on the lit side.
          const hx = dx + 0.05, hy = dy - 0.12;
          const lobe = (ox: number) => (hx - ox) ** 2 + (hy + 0.12) ** 2 < 0.075;
          const point = hy > -0.12 && hy < 0.42 && Math.abs(hx) < 0.36 - hy * 0.85;
          if ((lobe(-0.17) || lobe(0.17) || point) && tone > 0) col = look.mark!;
          break;
        }
        case 'ellipsoid':
          if (look.mark && (dx - 0.2) ** 2 + (dy + 0.1) ** 2 < 0.03 && tone > 0) col = look.mark;
          break;
        case 'rocky':
          if (look.land && noise(sx + 7, sy + 7, seed) > 0.6 && tone > 0) col = look.land;
          if (!near && look.cap && dy < -0.7) col = tone > 0 ? look.cap : night;
          break;
        default:
          break;
      }
      px(ctx, x, y, 1, 1, col);
    }
  }

  // Craters on rocky bodies; bright spots where the body has them.
  if (f === 'rocky' || f === 'asteroid') {
    let h = seed * 9973 + 17;
    const rnd = () => (h = (h * 16807) % 2147483647) / 2147483647;
    const n = Math.max(2, Math.round(r / 4));
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r * 0.6;
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (y >= ART.h) continue;
      px(ctx, x, y, 2, 1, night);
      px(ctx, x, y - 1, 2, 1, lit);
    }
    if (look.mark) {
      px(ctx, Math.round(cx - r * 0.25), Math.round(cy - r * 0.1), 1, 1, look.mark);
      px(ctx, Math.round(cx + r * 0.05), Math.round(cy - r * 0.35), 2, 1, look.mark);
    }
  }
  // A colony on a rock: lights on its night side.
  if (look.lights) {
    for (const [ox, oy] of [[0.3, 0.25], [0.1, 0.45], [0.45, 0.05]] as const) {
      px(ctx, Math.round(cx + ox * r), Math.round(cy + oy * r), 1, 1, look.lights);
    }
  }

  if (look.ring && r < 60) ringPixels(ctx, cx, cy, r, look.ring, 'front');
}

/**
 * A planetary ring, tilted: the half behind the globe is drawn first, the
 * half in front after it.
 */
function ringPixels(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, half: 'back' | 'front') {
  const rx0 = r * 1.35, rx1 = r * 1.95, k = 0.3;
  for (let y = Math.floor(cy - rx1 * k); y <= Math.ceil(cy + rx1 * k); y++) {
    const front = y + 0.5 >= cy;
    if ((half === 'front') !== front) continue;
    for (let x = Math.floor(cx - rx1); x <= Math.ceil(cx + rx1); x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / k;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < rx0 || d > rx1) continue;
      // A Cassini-style gap two thirds of the way out.
      if (Math.abs(d - (rx0 + (rx1 - rx0) * 0.62)) < 0.7) continue;
      px(ctx, x, y, 1, 1, col);
    }
  }
}

/** The orbital colony: a ring station with spokes, a hub and lit windows. */
function drawStation(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, look: WorldLook) {
  const [night, day, lit] = look.shades;
  const ry = r * 0.45;
  pixelEllipse(ctx, cx, cy, r, ry, night);
  pixelEllipse(ctx, cx, cy - 1, r, ry, day);
  pixelEllipse(ctx, cx, cy - 1, r - 3, ry - 3, canvasColor.bg);
  pline(ctx, cx - r + 2, cy - 1, cx + r - 2, cy - 1, day);
  pline(ctx, cx, cy - ry + 1, cx, cy + ry - 2, day);
  pixelEllipse(ctx, cx, cy - 1, 3, 2, lit);
  if (look.lights) {
    for (const ox of [-0.8, -0.45, 0.45, 0.8]) px(ctx, Math.round(cx + ox * r), Math.round(cy + (Math.abs(ox) > 0.6 ? 0 : ry - 2)), 1, 1, look.lights);
  }
}

/**
 * The stadium world's own rings seen from its surface: an arch across the
 * sky behind the horizon (Saturn, Uranus).
 */
function skyRing(ctx: CanvasRenderingContext2D, col: string) {
  for (let i = 0; i < 3; i++) {
    const rx = 230 + i * 3, ry = 140 + i * 3, cx = 170, cy = 210;
    for (let x = 0; x < ART.w; x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (Math.abs(dx) >= 1) continue;
      const y = Math.round(cy - ry * Math.sqrt(1 - dx * dx));
      if (y < horizonY(x) - 1 && i !== 1) px(ctx, x, y, 1, 1, col);
    }
  }
}

/** Size of one gallery tile, art pixels. */
export const TILE = 64;

/**
 * One world on its own in a TILE-square canvas, for the shelf's gallery:
 * the same drawing as the journey, at the world's size class.
 */
export function drawWorldTile(ctx: CanvasRenderingContext2D, look: WorldLook, seed: number): void {
  setGrid(PIXEL_SCALE);
  resetFill();
  px(ctx, 0, 0, TILE, TILE, canvasColor.bg);
  // A ringed giant shrinks to fit its rings in the tile.
  drawBody(ctx, TILE / 2, TILE / 2, look.ring ? 15 : SIZE_R[look.size], look, seed);
}

/** Size of one ground tile, art pixels. */
export const GROUND_TILE = { w: 104, h: 72 } as const;

/**
 * One club's ground on a strip of its world, for the shelf's gallery.
 */
export function drawGroundTile(ctx: CanvasRenderingContext2D, style: StadiumStyle, kit: Kit, world: WorldLook, capacity: number, t: number): void {
  setGrid(PIXEL_SCALE);
  resetFill();
  const { w, h } = GROUND_TILE;
  px(ctx, 0, 0, w, h, canvasColor.bg);
  const look = world.feature === 'station' ? TRAINING_MOON : world;
  const surf = (x: number) => 46 + ((x - w / 2) * (x - w / 2)) / 900;
  if (look.ring) for (let x = 0; x < w; x++) px(ctx, x, Math.round(14 + ((x - w / 2) * (x - w / 2)) / 260), 1, 1, look.ring);
  for (let x = 0; x < w; x++) {
    const y = Math.round(surf(x));
    px(ctx, x, y, 1, h - y, look.shades[1]);
    px(ctx, x, y, 1, 1, look.shades[2]);
    if (x % 2 === 0) px(ctx, x, y + 4, 1, h - y - 4, look.shades[0]);
  }
  const sky = skyBody(style);
  const skyLook = sky ? WORLDS[sky]?.look : undefined;
  if (skyLook) drawBody(ctx, 20, 16, 9, skyLook, 4);
  drawStadium({ ctx, gx: w / 2, surf, kit, world: look, capacity, t }, style);
}

/** The Sun: a white core in Lunar Dust rings, smaller the farther out. */
function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (let k = 3; k >= 1; k--) {
    const rr = r + k * 2;
    for (let yy = Math.floor(y - rr); yy <= Math.ceil(y + rr); yy++) {
      for (let xx = Math.floor(x - rr); xx <= Math.ceil(x + rr); xx++) {
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        if (d <= rr && d > r && (xx + yy + k) % (k + 1) === 0) px(ctx, xx, yy, 1, 1, canvasColor.figureDark);
      }
    }
  }
  pixelEllipse(ctx, x, y, r, r, canvasColor.text);
  pixelEllipse(ctx, x, y, Math.max(1, r - 2), Math.max(1, r - 2), canvasColor.figureGlow);
}

/**
 * The club's training facility on its own world, drawn to its lore tier:
 * elite a lit dome and mast, professional a block and pitch, standard a
 * shed and pitch, basic a hut beside a marked-out patch. Floats on a small
 * deck where the world has no ground.
 */
function drawTrainingBase(ctx: CanvasRenderingContext2D, x: number, kit: Kit, quality: TrainingQuality, floating: boolean, t: number) {
  const y = Math.round(horizonY(x)) - (floating ? 8 : 0);
  if (floating) {
    pixelEllipse(ctx, x, y + 2, 18, 2, canvasColor.figureMid);
    px(ctx, x - 1, y + 4, 3, 2 + (t === 0 ? 1 : Math.floor(t / 90) % 3), canvasColor.figureGlow);
  }
  // The training pitch.
  px(ctx, x - 14, y - 2, 28, 2, quality === 'basic' ? canvasColor.figureMid : canvasColor.text);
  px(ctx, x, y - 2, 1, 2, canvasColor.figureMid);
  if (quality === 'elite') {
    for (let a = 0; a <= 12; a++) {
      const th = Math.PI - (Math.PI * a) / 12;
      px(ctx, Math.round(x + 8 + Math.cos(th) * 7), Math.round(y - 2 - Math.sin(th) * 7), 1, 1, canvasColor.figureLight);
    }
    px(ctx, x + 2, y - 4, 13, 2, kit.shirt);
    px(ctx, x - 12, y - 16, 1, 14, canvasColor.figureMid);
    px(ctx, x - 13, y - 17, 3, 1, t === 0 || Math.floor(t / 600) % 2 === 0 ? canvasColor.figureGlow : canvasColor.figureDark);
  } else if (quality === 'professional') {
    px(ctx, x + 2, y - 9, 12, 7, kit.outline);
    px(ctx, x + 3, y - 8, 10, 5, kit.shirt);
    px(ctx, x + 4, y - 6, 8, 1, canvasColor.text);
  } else if (quality === 'standard') {
    px(ctx, x + 4, y - 6, 8, 4, kit.outline);
    px(ctx, x + 5, y - 5, 6, 2, kit.shirt);
    px(ctx, x + 3, y - 7, 10, 1, canvasColor.figureMid);
  } else {
    for (let i = 0; i < 4; i++) px(ctx, x + 6 - i, y - 3 - i, 2 + i * 2, 1, i === 0 ? kit.outline : kit.shirt);
    for (let i = -12; i <= 12; i += 6) px(ctx, x + i, y - 3, 1, 1, canvasColor.figureLight);
  }
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
function drawShip(ctx: CanvasRenderingContext2D, cx: number, cy: number, kit: Kit, flying: boolean, t: number, seed: number, left = false) {
  const x0 = Math.round(cx - SHIP_W / 2);
  // Facing left: mirror each column about the sprite's centre.
  const col = (c: number) => (left ? SHIP_W - 1 - c : c);
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
  if (!flying) px(ctx, x0 + 1, y0 + SHIP_H, SHIP_W - 2, 1, canvasColor.shadow);
  for (let r = 0; r < SHIP_H; r++) {
    const row = SHIP[r]!;
    // Skids only on the ground; in flight the gear is up.
    if (flying && r >= SHIP_H - 2) continue;
    for (let c = 0; c < SHIP_W; c++) {
      const colour = pal[row[c]!];
      if (colour) px(ctx, x0 + col(c), y0 + r, 1, 1, colour);
    }
  }
  if (flying) {
    // Engine: a flickering pixel flame off the tail.
    const len = 3 + (Math.floor(t / 90 + seed * 7) % 3);
    const tail = left ? x0 + SHIP_W : x0;
    const dir = left ? 1 : -1;
    px(ctx, left ? tail : tail - len, y0 + 4, len, 2, canvasColor.text);
    px(ctx, left ? tail : tail - 2, y0 + 4, 2, 2, canvasColor.figureGlow);
    px(ctx, tail + dir * (len + 2) - (left ? 1 : 0), y0 + 4 + (Math.floor(t / 120) % 2), 1, 1, canvasColor.figureLight);
  }
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

/** The static sky and ground, drawn once per fixture. */
let layer: { key: string; canvas: HTMLCanvasElement } | null = null;

function worldsLayer(f: JourneyFrame): HTMLCanvasElement | null {
  const key = JSON.stringify([f.layout.sky, f.homeLook, f.stadium.style]);
  if (layer?.key === key) return layer.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = ART.w * PIXEL_SCALE;
  canvas.height = ART.h * PIXEL_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  setGrid(PIXEL_SCALE);
  resetFill();
  if (f.homeLook.ring) skyRing(ctx, f.homeLook.ring);
  // The real sky, farthest first.
  f.layout.sky.forEach((b, i) => {
    if (b.kind === 'sun') return drawSun(ctx, b.x, b.y, b.r);
    const look = lookFor(b.name);
    if (look) drawBody(ctx, b.x, b.y, b.r, look, 3 + i, 0, b.light);
  });
  // The near world, dimmed so the stand is the bright thing on it.
  drawBody(ctx, STADIUM_WORLD.cx, STADIUM_WORLD.cy, STADIUM_WORLD.r, f.homeLook.feature === 'station' ? { ...TRAINING_MOON, size: 'giant' } : f.homeLook, 8, 0.3);
  layer = { key, canvas };
  return canvas;
}

/**
 * Draw one frame into a canvas sized ART x PIXEL_SCALE.
 */
export function drawJourney(ctx: CanvasRenderingContext2D, f: JourneyFrame): void {
  const worlds = worldsLayer(f);
  setGrid(PIXEL_SCALE);
  resetFill();
  px(ctx, 0, 0, ART.w, ART.h, canvasColor.bg);

  // Stars behind everything: single pixels, a few twinkling.
  f.stars.forEach((s, i) => {
    const twinkle = f.t !== 0 && i % 9 === 0 && Math.floor(f.t / 500 + i) % 4 === 0;
    if (!twinkle) px(ctx, s.x, s.y, 1, 1, s.o > 0.5 ? canvasColor.figureMid : canvasColor.figureDark);
  });
  if (worlds) ctx.drawImage(worlds, 0, 0);
  resetFill();

  const r = f.layout;
  drawTrainingBase(ctx, r.base.x, f.homeKit, f.training, FLOATING.includes(f.stadium.style), f.t);
  resetFill();
  drawRoute(ctx, r.away.at, f.away.phase === 'docked' ? -1 : f.away.progress, f.away.kit);
  drawRoute(ctx, r.home.at, f.home.phase === 'docked' ? -1 : f.home.progress, f.home.kit);
  drawStadium(
    {
      ctx,
      gx: GROUND_X,
      surf: horizonY,
      kit: f.homeKit,
      world: f.homeLook.feature === 'station' ? TRAINING_MOON : f.homeLook,
      capacity: f.stadium.capacity,
      t: f.t,
    },
    f.stadium.style,
  );
  resetFill();

  const place = (s: ShipFrame, leg: Way, seed: number) => {
    const flying = s.phase === 'flying';
    const p = flying ? leg.at(s.progress) : s.phase === 'docked' ? leg.dock : leg.park;
    // Face the way it is going: along the route in flight, toward the ground
    // when waiting or landed.
    const ahead = flying ? leg.at(Math.min(1, s.progress + 0.02)).x - p.x : (s.phase === 'docked' ? leg.park.x : GROUND_X) - p.x;
    drawShip(ctx, p.x, p.y, s.kit, flying, f.t, seed, ahead < 0);
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
