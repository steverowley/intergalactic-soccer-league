// ── features/match/ui/journey/stadiumArt.ts ─────────────────────────────────
//
// Every club's ground in pixels, after the lore (data/stadiums.ts): the Heat
// Box under its sun shield, Limeil Stadium on its summit, the Trench down a
// canyon, the Red Spot floating over Jupiter's storm, the Dark Pitch whose
// floodlights stay off, the Dig's headframe and half a roof, and so on.
//
// Drawn in the match viewer's style: one pixel grid, the viewer's
// primitives, Lunar Dust structure, the home kit as the one strong colour,
// the home world's own shades for rock, ice and ground. Capacity sets the
// size. Gas giants and the ring station have no ground, so their stadiums
// float (deckLift).

import type { StadiumStyle } from '../../../../data/stadiums';
import type { WorldLook } from '../../../../data/leagueData';
import { canvasColor as C } from '../../../../shared/design';
import type { Kit } from '../../logic/viewer';
import { pixelEllipse, pline, px } from '../viewer/figure';

/** What a stadium drawing needs. */
export interface StadiumScene {
  ctx: CanvasRenderingContext2D;
  /** Centre column of the ground. */
  gx: number;
  /** The world's surface height at a column. */
  surf: (x: number) => number;
  kit: Kit;
  world: WorldLook;
  /** Seats, for the size. */
  capacity: number;
  /** Animation time, ms (0 = still frame). */
  t: number;
}

/** How far above the surface a floating ground's deck sits. */
export function deckLift(style: StadiumStyle): number {
  switch (style) {
    case 'storm':
      return 26;
    case 'tilted':
      return 22;
    case 'colosseum':
      return 18;
    case 'drifter':
      return 10;
    case 'peak':
      return 30;
    default:
      return 0;
  }
}

/** A world drawn in the sky over the ground (Charon's view of Pluto). */
export function skyBody(style: StadiumStyle): string | null {
  return style === 'lagrange' ? 'Pluto' : null;
}

/** Half-width of the stand from capacity: 8,000 seats to 110,000. */
export function halfWidth(capacity: number): number {
  return Math.round(14 + 16 * Math.min(1, Math.max(0, capacity) / 110_000));
}

/** On/off for a blinking light; always on in a still frame. */
const on = (t: number, period: number, phase = 0) => t === 0 || Math.floor(t / period + phase) % 2 === 0;

// ── Shared pieces ───────────────────────────────────────────────────────────

/** Ground built up from `top` to the surface on every column, so nothing floats. */
function groundUnder(s: StadiumScene, x0: number, x1: number, top: number) {
  for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    const h = Math.round(s.surf(x)) - top + 1;
    if (h > 0) px(s.ctx, x, top, 1, h, s.world.shades[0]);
  }
}

/** A bowl: tiers of stand in the kit round a lit pitch. */
function bowl(s: StadiumScene, x: number, y: number, hw: number, tiers = 2, hhScale = 1) {
  const hh = Math.max(4, Math.round(hw * 0.36 * hhScale));
  pixelEllipse(s.ctx, x, y, hw, hh, s.kit.outline);
  pixelEllipse(s.ctx, x, y, hw - 1, hh - 1, s.kit.shirt);
  for (let i = 1; i < tiers; i++) {
    pixelEllipse(s.ctx, x, y - i, hw - 1 - i * 4, hh - 1 - i, s.kit.outline);
    pixelEllipse(s.ctx, x, y - i, hw - 2 - i * 4, hh - 2 - i, s.kit.shirt);
  }
  const pw = Math.round(hw * 0.62), ph = Math.max(2, Math.round(hh * 0.45));
  pixelEllipse(s.ctx, x, y - tiers, pw + 1, ph + 1, s.kit.outline);
  pixelEllipse(s.ctx, x, y - tiers, pw, ph, C.text);
  px(s.ctx, x, y - tiers - ph + 1, 1, ph * 2 - 1, C.figureMid);
}

/** Two floodlight masts with beams; `lit` false leaves the lamps dark. */
function masts(s: StadiumScene, x: number, y: number, span: number, h: number, lit = true) {
  for (const side of [-1, 1]) {
    const mx = x + side * span;
    if (lit) pline(s.ctx, mx, y - h, x + side * Math.round(span * 0.4), y - 4, C.line);
    px(s.ctx, mx, y - h, 1, h, C.figureMid);
    px(s.ctx, mx - 2, y - h - 3, 5, 3, C.figureDark);
    const glow = lit && on(s.t, 700, side > 0 ? 0.5 : 0);
    px(s.ctx, mx - 1, y - h - 2, 3, 1, glow ? C.figureGlow : lit ? C.figureLight : C.figureDark);
  }
}

/** A box stand: outline, kit fill. */
function box(s: StadiumScene, x: number, y: number, w: number, h: number) {
  px(s.ctx, x, y, w, h, s.kit.outline);
  px(s.ctx, x + 1, y + 1, w - 2, h - 2, s.kit.shirt);
}

/** An arch outline (top half of an ellipse). */
function arch(s: StadiumScene, x: number, y: number, rx: number, ry: number, col: string) {
  let prev: [number, number] | null = null;
  for (let a = 0; a <= 24; a++) {
    const th = Math.PI - (Math.PI * a) / 24;
    const p: [number, number] = [Math.round(x + Math.cos(th) * rx), Math.round(y - Math.sin(th) * ry)];
    if (prev) pline(s.ctx, prev[0], prev[1], p[0], p[1], col, 1, true);
    else px(s.ctx, p[0], p[1], 1, 1, col);
    prev = p;
  }
}

/** Thrusters under a floating deck, flickering. */
function thrusters(s: StadiumScene, xs: number[], y: number) {
  for (const [i, x] of xs.entries()) {
    px(s.ctx, x - 1, y, 3, 2, C.figureDark);
    const len = s.t === 0 ? 3 : 2 + ((Math.floor(s.t / 90) + i) % 3);
    px(s.ctx, x, y + 2, 1, len, C.figureGlow);
    px(s.ctx, x - 1, y + 2, 3, 1, C.text);
  }
}

/** A flat floating deck. */
function deck(s: StadiumScene, x: number, y: number, hw: number) {
  pixelEllipse(s.ctx, x, y + 2, hw + 4, 3, C.figureMid);
  pixelEllipse(s.ctx, x, y + 4, hw, 2, C.figureDark);
}

// ── The grounds ─────────────────────────────────────────────────────────────

/**
 * Draw a club's ground.
 *
 * @param style  From data/stadiums.ts.
 */
export function drawStadium(s: StadiumScene, style: StadiumStyle): void {
  const { ctx, gx, kit, world, t } = s;
  const hw = halfWidth(s.capacity);
  const y0 = Math.round(s.surf(gx)) + 3;
  const lift = deckLift(style);

  switch (style) {
    case 'heatbox': {
      // The Heat Box: a sealed stand under a slanted sun shield, the air
      // above it shimmering.
      const top = y0 - 14;
      groundUnder(s, gx - hw, gx + hw, y0 - 2);
      box(s, gx - hw, top, hw * 2, 14);
      px(ctx, gx - hw + 4, top + 5, hw * 2 - 8, 3, C.text);
      pline(ctx, gx - hw - 4, top - 2, gx + hw + 4, top - 5, C.figureLight, 2);
      for (let i = 0; i < 6; i++) {
        const x = gx - hw + 4 + Math.round((i * (hw * 2 - 8)) / 5);
        const rise = t === 0 ? i % 3 : Math.floor(t / 140 + i) % 4;
        px(ctx, x + (Math.floor(t / 220 + i) % 2), top - 8 - rise, 1, 2, C.figureLight);
      }
      break;
    }
    case 'grand': {
      // The Blue Marble: three tiers, four masts, flags round the rim.
      groundUnder(s, gx - hw, gx + hw, y0 - 4);
      masts(s, gx, y0, hw + 3, 30);
      masts(s, gx, y0, Math.round(hw * 0.6), 24);
      bowl(s, gx, y0 - 4, hw, 3);
      for (let i = -2; i <= 2; i++) {
        const fx = gx + Math.round((i * hw) / 2.6);
        const fy = y0 - 4 - Math.round(hw * 0.36) - 6;
        px(ctx, fx, fy, 1, 6, C.figureMid);
        px(ctx, fx + 1, fy + (on(t, 400, i * 0.3) ? 0 : 1), 3, 2, kit.shirt);
      }
      break;
    }
    case 'dome': {
      // Pressure Cooker Stadium: a bowl under a pressure dome, steam venting.
      groundUnder(s, gx - hw, gx + hw, y0 - 4);
      bowl(s, gx, y0 - 4, hw);
      arch(s, gx, y0 - 5, hw + 2, hw * 0.8, C.figureLight);
      for (let i = -2; i <= 2; i++) {
        const x = gx + Math.round((i * hw) / 2.4);
        const top = Math.round(y0 - 5 - Math.sqrt(Math.max(0, 1 - ((x - gx) / (hw + 2)) ** 2)) * hw * 0.8);
        for (let y = top + 2; y < y0 - 8; y += 2) px(ctx, x, y, 1, 1, C.figureMid);
      }
      for (const side of [-1, 1]) {
        const vx = gx + side * (hw + 4);
        px(ctx, vx, y0 - 5, 2, 4, C.figureDark);
        const puff = t === 0 ? 2 : Math.floor(t / 160 + (side > 0 ? 2 : 0)) % 5;
        px(ctx, vx, y0 - 8 - puff * 2, 2, 2, C.figureLight);
      }
      break;
    }
    case 'greenhouse': {
      // The Greenhouse: glass arches over a green park.
      groundUnder(s, gx - hw, gx + hw, y0 - 3);
      box(s, gx - hw, y0 - 6, hw * 2, 5);
      const r = Math.round((hw * 2) / 6);
      for (let i = 0; i < 3; i++) {
        const ax = gx - hw + r + i * r * 2;
        arch(s, ax, y0 - 6, r, r * 1.2, C.figureLight);
        for (let k = 0; k < 4; k++) px(ctx, ax - r + 2 + ((k * 5 + i * 3) % (r * 2 - 3)), y0 - 8 - ((k * 3 + i) % Math.max(1, r - 2)), 1, 1, world.land ?? kit.shirt);
      }
      px(ctx, gx - hw + 3, y0 - 4, hw * 2 - 6, 1, C.text);
      break;
    }
    case 'dustbowl': {
      // The Dust Bowl: a low, wide open bowl; dust devils at its edges.
      groundUnder(s, gx - hw - 4, gx + hw + 4, y0 - 2);
      bowl(s, gx, y0 - 2, hw + 4, 1, 0.75);
      for (const side of [-1, 1]) {
        const dx = gx + side * (hw + 12);
        for (let k = 0; k < 6; k++) {
          const sway = Math.round(Math.sin(t / 200 + k + side) * (k / 2));
          px(ctx, dx + sway, Math.round(s.surf(dx)) - 2 - k * 2, 1 + Math.floor(k / 2), 1, world.shades[2]);
        }
      }
      break;
    }
    case 'peak': {
      // Limeil Stadium: the bowl on the summit of the mountain.
      const base = hw + 12;
      for (let y = 0; y < lift; y++) {
        const half = Math.round(base * (1 - y / (lift + 4)));
        const yy = y0 - y;
        px(ctx, gx - half, yy, half * 2, 1, world.shades[1]);
        px(ctx, gx - half, yy, Math.max(1, Math.round(half * 0.35)), 1, world.shades[2]);
        px(ctx, gx + half - Math.round(half * 0.4), yy, Math.round(half * 0.4), 1, world.shades[0]);
      }
      groundUnder(s, gx - base, gx + base, y0);
      bowl(s, gx, y0 - lift - 2, Math.round(hw * 0.8));
      masts(s, gx, y0 - lift - 2, Math.round(hw * 0.8) + 2, 16);
      break;
    }
    case 'trench': {
      // The Trench: terraces stepping down both walls of a canyon, the pitch
      // on its floor.
      const depth = 15, top = hw + 8, bot = Math.round(hw * 0.6);
      for (let r = 0; r <= depth; r++) {
        const half = Math.round(top + (bot - top) * (r / depth));
        const yy = y0 - 3 + r;
        px(ctx, gx - half, yy, half * 2, 1, world.shades[0]);
        px(ctx, gx - half, yy, 2, 1, world.shades[2]);
        px(ctx, gx + half - 2, yy, 2, 1, world.shades[1]);
        // Terraces stepping down both walls.
        if (r % 3 === 1 && r < depth - 2) {
          px(ctx, gx - half + 2, yy, 5, 2, kit.shirt);
          px(ctx, gx - half + 2, yy + 2, 5, 1, kit.outline);
          px(ctx, gx + half - 7, yy, 5, 2, kit.shirt);
          px(ctx, gx + half - 7, yy + 2, 5, 1, kit.outline);
        }
      }
      px(ctx, gx - bot + 2, y0 + depth - 5, bot * 2 - 4, 1, kit.outline);
      px(ctx, gx - bot + 2, y0 + depth - 4, bot * 2 - 4, 2, C.text);
      px(ctx, gx, y0 + depth - 4, 1, 2, C.figureMid);
      masts(s, gx, y0 - 3, top + 2, 12);
      break;
    }
    case 'ring': {
      // The Ring: an upright ring habitat on a pylon, the pitch round the
      // inside of its floor, spokes to a lit hub.
      const R = Math.round(hw * 0.7) + 3;
      const cy = y0 - R - 6;
      px(ctx, gx - 1, cy + R - 1, 3, y0 - cy - R + 2, C.figureMid);
      for (let y = cy - R; y <= cy + R; y++) {
        for (let x = gx - R; x <= gx + R; x++) {
          const d = Math.hypot(x + 0.5 - gx, y + 0.5 - cy);
          if (d > R - 0.5 && d <= R + 0.5) px(ctx, x, y, 1, 1, kit.outline);
          else if (d > R - 3.5 && d <= R - 0.5) px(ctx, x, y, 1, 1, kit.shirt);
          else if (d > R - 5.5 && d <= R - 3.5 && y > cy + R * 0.45) px(ctx, x, y, 1, 1, C.text);
        }
      }
      for (const a of [0.4, 1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0]) pline(ctx, gx, cy, Math.round(gx + Math.cos(a) * (R - 4)), Math.round(cy + Math.sin(a) * (R - 4)), C.figureDark);
      pixelEllipse(ctx, gx, cy, 3, 3, C.figureLight);
      for (const a of [0, Math.PI]) px(ctx, Math.round(gx + Math.cos(a) * (R + 1)), cy, 1, 1, on(t, 600) ? C.figureGlow : C.figureMid);
      break;
    }
    case 'storm': {
      // The Red Spot: Jupiter has no ground, so the arena floats on
      // thrusters over the storm, which turns beneath it.
      const dy = y0 - lift;
      const swirl = world.mark ?? kit.shirt;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + (t === 0 ? 0 : t / 1500);
        px(ctx, Math.round(gx + Math.cos(a) * (hw + 6)), Math.round(y0 + 1 + Math.sin(a) * 4), 2, 1, swirl);
      }
      thrusters(s, [gx - Math.round(hw * 0.6), gx, gx + Math.round(hw * 0.6)], dy + 5);
      deck(s, gx, dy, hw);
      bowl(s, gx, dy - 1, hw, 2);
      masts(s, gx, dy, hw + 3, 18);
      break;
    }
    case 'subsurface': {
      // The Ice Bowl: under Europa's ice. A hatch on the surface; the bowl
      // shows through the ice below, a lift shaft between.
      pixelEllipse(ctx, gx, y0 + 9, hw + 3, Math.round(hw * 0.36) + 3, world.shades[0]);
      bowl(s, gx, y0 + 9, hw);
      // The crust over it: ice glazed across every other row.
      for (let y = y0 + 1; y <= y0 + 16; y += 2) {
        for (let x = gx - hw - 3; x <= gx + hw + 3; x++) if ((x + y) % 4 === 0) px(ctx, x, y, 1, 1, world.shades[2]);
      }
      for (let y = y0 - 1; y < y0 + 4; y += 2) px(ctx, gx, y, 1, 1, C.figureMid);
      arch(s, gx, y0 - 1, 5, 4, C.figureLight);
      px(ctx, gx - 5, y0 - 1, 11, 1, C.figureMid);
      px(ctx, gx - 2, y0 - 3, 1, 1, on(t, 500) ? C.figureGlow : C.figureMid);
      px(ctx, gx + 2, y0 - 3, 1, 1, on(t, 500, 0.5) ? C.figureGlow : C.figureMid);
      break;
    }
    case 'crater': {
      // A crater: a raised rim either side, the bowl sunk inside it.
      for (const side of [-1, 1]) {
        for (let k = 0; k < 9; k++) {
          const x = gx + side * (hw + 2 + k);
          const h = Math.round(7 * Math.sin((k / 9) * Math.PI));
          const sy = Math.round(s.surf(x));
          px(ctx, x, sy - h, 1, h + 1, world.shades[1]);
          px(ctx, x, sy - h, 1, 1, world.shades[2]);
        }
      }
      pixelEllipse(ctx, gx, y0, hw + 3, 5, world.shades[0]);
      bowl(s, gx, y0 - 1, hw);
      masts(s, gx, y0 - 1, hw + 5, 14);
      break;
    }
    case 'den': {
      // The Howling Den: a long low stand under jagged gables, icicles
      // hanging from the eaves.
      groundUnder(s, gx - hw, gx + hw, y0 - 2);
      box(s, gx - hw, y0 - 10, hw * 2, 9);
      px(ctx, gx - hw + 3, y0 - 6, hw * 2 - 6, 2, C.text);
      const n = Math.max(3, Math.round(hw / 6));
      for (let i = 0; i < n; i++) {
        const x0 = gx - hw + Math.round((i * hw * 2) / n), w = Math.round((hw * 2) / n);
        pline(ctx, x0, y0 - 10, x0 + Math.round(w / 2), y0 - 16, kit.outline);
        pline(ctx, x0 + Math.round(w / 2), y0 - 16, x0 + w, y0 - 10, kit.outline);
      }
      for (let x = gx - hw + 1; x < gx + hw; x += 3) px(ctx, x, y0 - 1, 1, 1 + ((x * 7) % 2), C.figureLight);
      break;
    }
    case 'haze': {
      // Hydrocarbon Park: an open pitch with one stand, a methane lake beside
      // it, orange haze drifting across.
      groundUnder(s, gx - hw - 20, gx + hw, y0 - 2);
      pixelEllipse(ctx, gx - hw - 10, y0 - 1, 9, 2, world.shades[0]);
      px(ctx, gx - hw - 13, y0 - 2, 3, 1, world.shades[2]);
      box(s, gx - Math.round(hw * 0.8), y0 - 4, Math.round(hw * 1.6), 3);
      px(ctx, gx - Math.round(hw * 0.8) + 1, y0 - 3, Math.round(hw * 1.6) - 2, 1, C.text);
      box(s, gx - Math.round(hw * 0.7), y0 - 10, Math.round(hw * 1.4), 6);
      for (const [row, k] of [[y0 - 15, 1], [y0 - 21, -1]] as const) {
        const off = t === 0 ? 0 : Math.floor(t / 180) * k;
        for (let x = 0; x < hw * 3; x += 5) px(ctx, gx - Math.round(hw * 1.5) + ((x + off) % (hw * 3) + hw * 3) % (hw * 3), row, 3, 1, world.shades[2]);
      }
      break;
    }
    case 'geyser': {
      // The Spray: geysers behind the stand, erupting when you least expect.
      groundUnder(s, gx - hw, gx + hw, y0 - 4);
      for (const [i, side] of [-1, 1].entries()) {
        const x = gx + side * (hw + 7);
        const cycle = t === 0 ? (i === 0 ? 12 : 0) : (t / 90 + i * 23) % 40;
        const h = cycle < 18 ? Math.round(cycle * 1.4) : 0;
        if (h > 0) {
          px(ctx, x, Math.round(s.surf(x)) - h, 2, h, C.text);
          px(ctx, x - 1, Math.round(s.surf(x)) - h - 1, 4, 2, C.figureGlow);
        }
        px(ctx, x - 1, Math.round(s.surf(x)), 4, 1, world.mark ?? C.figureMid);
      }
      bowl(s, gx, y0 - 4, hw);
      break;
    }
    case 'carved': {
      // The Rock: terraces cut into a rock outcrop.
      const w = hw + 6, h = 20;
      for (let r = 0; r < h; r++) {
        const half = Math.round(w - r * 0.35 + ((r * 13) % 3));
        const yy = y0 - r;
        px(ctx, gx - half, yy, half * 2, 1, world.shades[1]);
        px(ctx, gx - half, yy, 2, 1, world.shades[2]);
        px(ctx, gx + half - 3, yy, 3, 1, world.shades[0]);
      }
      groundUnder(s, gx - w, gx + w, y0);
      for (let i = 0; i < 4; i++) {
        const half = Math.round(hw * 0.9 - i * 2);
        px(ctx, gx - half, y0 - 4 - i * 4, half * 2, 2, kit.shirt);
        px(ctx, gx - half, y0 - 2 - i * 4, half * 2, 1, kit.outline);
      }
      px(ctx, gx - Math.round(hw * 0.9), y0 - 1, Math.round(hw * 1.8), 2, C.text);
      break;
    }
    case 'drifter': {
      // The Drifter: the stadium walks on thruster legs; it is never quite
      // where you left it.
      const bob = t === 0 ? 0 : Math.floor(t / 600) % 2;
      const dy = y0 - lift - bob;
      for (const lx of [-1, -0.4, 0.4, 1]) {
        const x = gx + Math.round(lx * hw);
        const fy = Math.round(s.surf(x));
        pline(ctx, x, dy + 3, x + Math.round(lx * 3), fy - 1, C.figureMid);
        px(ctx, x + Math.round(lx * 3) - 1, fy - 1, 3, 1, C.figureDark);
      }
      deck(s, gx, dy, hw - 2);
      bowl(s, gx, dy - 1, hw - 2);
      break;
    }
    case 'underground': {
      // The Dark Pitch: underground. A hatch and a stair go down; the masts
      // stand above with their floodlights off, as the club insists.
      masts(s, gx, y0 - 2, hw + 2, 18, false);
      for (let i = 0; i < 6; i++) px(ctx, gx - 4 + i, y0 - 2 + i, 6, 1, i % 2 ? C.figureDark : C.figureMid);
      px(ctx, gx - 6, y0 - 7, 12, 5, C.figureMid);
      px(ctx, gx - 3, y0 - 6, 6, 4, C.bg);
      px(ctx, gx - 6, y0 - 8, 12, 1, kit.shirt);
      for (let x = gx - hw; x <= gx + hw; x += 2) px(ctx, x, y0 + 12, 1, 1, kit.outline);
      break;
    }
    case 'forge': {
      // The Forge: a metal stand with glowing chimneys, sparks rising.
      groundUnder(s, gx - hw, gx + hw, y0 - 2);
      px(ctx, gx - hw, y0 - 12, hw * 2, 11, C.figureMid);
      for (let x = gx - hw + 3; x < gx + hw; x += 6) px(ctx, x, y0 - 12, 1, 11, C.figureDark);
      px(ctx, gx - hw, y0 - 9, hw * 2, 3, kit.shirt);
      px(ctx, gx - hw + 4, y0 - 5, hw * 2 - 8, 2, C.text);
      for (let i = 0; i < 3; i++) {
        const cx = gx - Math.round(hw * 0.6) + i * Math.round(hw * 0.6);
        px(ctx, cx - 1, y0 - 20, 3, 8, C.figureDark);
        px(ctx, cx - 1, y0 - 21, 3, 1, kit.shirt);
        const spark = t === 0 ? 2 : Math.floor(t / 110 + i * 3) % 7;
        px(ctx, cx + ((spark + i) % 3) - 1, y0 - 23 - spark * 2, 1, 1, C.figureGlow);
      }
      break;
    }
    case 'temple': {
      // The Temple: a pediment on columns over the steps, twenty-two names
      // over the door, in formation.
      groundUnder(s, gx - hw - 2, gx + hw + 2, y0 - 2);
      for (let i = 0; i < 3; i++) px(ctx, gx - hw - 2 + i * 2, y0 - 2 - i * 2, (hw + 2 - i * 2) * 2, 2, i % 2 ? C.figureLight : C.figureMid);
      const n = Math.max(5, Math.round(hw / 4));
      for (let i = 0; i < n; i++) {
        const x = gx - hw + 3 + Math.round((i * (hw * 2 - 6)) / (n - 1));
        px(ctx, x - 1, y0 - 18, 3, 12, C.figureLight);
        px(ctx, x, y0 - 18, 1, 12, C.text);
      }
      px(ctx, gx - hw, y0 - 21, hw * 2, 3, kit.outline);
      px(ctx, gx - hw + 1, y0 - 20, hw * 2 - 2, 1, kit.shirt);
      for (let i = 0; i < 11; i++) {
        px(ctx, gx - 11 + i * 2, y0 - 20, 1, 1, C.figureDark);
      }
      for (let r = 0; r < 7; r++) {
        const half = Math.round((hw + 1) * (1 - r / 7));
        px(ctx, gx - half, y0 - 22 - r, half * 2, 1, r === 0 ? kit.outline : kit.shirt);
      }
      for (let i = 0; i < 11; i++) px(ctx, gx - 5 + (i % 6) * 2, y0 - 25 + Math.floor(i / 6) * 2, 1, 1, C.figureDark);
      break;
    }
    case 'hub': {
      // The Junction: a bowl with docking gantries reaching out, departure
      // lights blinking at their tips.
      groundUnder(s, gx - hw, gx + hw, y0 - 4);
      for (const side of [-1, 1]) {
        const x0 = gx + side * (hw - 2), x1 = gx + side * (hw + 12);
        pline(ctx, x0, y0 - 8, x1, y0 - 18, C.figureMid, 2);
        pline(ctx, x1, y0 - 18, x1, y0 - 1, C.figureDark);
        px(ctx, x1 - 1, y0 - 20, 3, 2, on(t, 450, side > 0 ? 0.5 : 0) ? kit.shirt : C.figureDark);
      }
      bowl(s, gx, y0 - 4, hw);
      break;
    }
    case 'mine': {
      // The Dig: the stand sunk into an old ore shaft under its headframe,
      // half a roof over it (the roof is under review).
      groundUnder(s, gx - hw, gx + hw, y0);
      bowl(s, gx, y0 + 2, hw);
      for (let x = gx; x <= gx + hw - 4; x += 4) pline(ctx, x, y0 - 6, x + 4, y0 - 6, C.figureMid);
      pline(ctx, gx + hw, y0 - 6, gx + hw, y0, C.figureMid);
      const hx = gx - hw - 8, hy = Math.round(s.surf(hx));
      pline(ctx, hx - 6, hy, hx, hy - 28, C.figureMid, 2);
      pline(ctx, hx + 6, hy, hx, hy - 28, C.figureMid, 2);
      pline(ctx, hx - 4, hy - 10, hx + 4, hy - 10, C.figureDark);
      pixelEllipse(ctx, hx, hy - 29, 3, 3, C.figureLight);
      pixelEllipse(ctx, hx, hy - 29, 1, 1, C.bg);
      px(ctx, hx - 2, hy - 2, 4, 3, C.bg);
      break;
    }
    case 'icebox': {
      // The Deep Freeze: a stand built of ice blocks, frost falling.
      groundUnder(s, gx - hw, gx + hw, y0 - 2);
      for (let r = 0; r < 3; r++) {
        for (let x = gx - hw + (r % 2) * 3; x < gx + hw - 3; x += 6) {
          px(ctx, x, y0 - 6 - r * 5, 6, 5, C.figureLight);
          px(ctx, x + 1, y0 - 5 - r * 5, 4, 3, world.shades[2]);
        }
      }
      px(ctx, gx - hw + 2, y0 - 9, hw * 2 - 4, 1, kit.shirt);
      px(ctx, gx - hw + 2, y0 - 3, hw * 2 - 4, 1, C.text);
      for (let i = 0; i < 6; i++) {
        const fall = t === 0 ? i * 3 : (t / 120 + i * 7) % 26;
        px(ctx, gx - hw + 4 + i * Math.round(hw / 3), y0 - 30 + Math.round(fall), 1, 1, C.text);
      }
      break;
    }
    case 'lagrange':
    case 'cradle': {
      // Binary Lagrange Arena: an open bowl under Pluto (drawn in the sky).
      // Creation Stadium: a small bowl under a single arch.
      groundUnder(s, gx - hw, gx + hw, y0 - 4);
      if (style === 'cradle') arch(s, gx, y0 - 5, hw + 2, hw * 0.9, C.figureLight);
      else masts(s, gx, y0, hw + 3, 18);
      bowl(s, gx, y0 - 4, hw);
      break;
    }
    case 'outpost': {
      // The Outpost: a tiny stand and a tall beacon mast. You have arrived.
      groundUnder(s, gx - hw, gx + hw, y0 - 2);
      const w = Math.round(hw * 1.2);
      box(s, gx - Math.round(w / 2), y0 - 8, w, 7);
      px(ctx, gx - Math.round(w / 2) + 2, y0 - 5, w - 4, 2, C.text);
      const mx = gx + hw + 2;
      px(ctx, mx, y0 - 40, 1, 40, C.figureMid);
      for (let y = y0 - 34; y < y0; y += 8) px(ctx, mx - 2, y, 5, 1, C.figureMid);
      px(ctx, mx - 1, y0 - 42, 3, 2, on(t, 800) ? kit.shirt : C.figureDark);
      break;
    }
    case 'oval': {
      // The Oval: a stretched bowl; the sky wheels round as Haumea spins.
      groundUnder(s, gx - hw - 6, gx + hw + 6, y0 - 4);
      for (let i = 0; i < 3; i++) {
        const r = hw + 12 + i * 7;
        const a0 = (t === 0 ? 0 : t / 900) + i;
        for (let k = 0; k < 6; k++) {
          const a = a0 + k * 0.12;
          const x = Math.round(gx + Math.cos(a) * r), y = Math.round(y0 - 10 - Math.abs(Math.sin(a)) * r * 0.5);
          if (y < s.surf(x) - 2) px(ctx, x, y, 1, 1, C.figureDark);
        }
      }
      bowl(s, gx, y0 - 4, hw + 6, 2, 0.7);
      break;
    }
    case 'pit': {
      // The Pit: sunk into the ground, walkways crossing it. Keep to them.
      pixelEllipse(ctx, gx, y0 + 4, hw + 4, 9, world.shades[0]);
      pixelEllipse(ctx, gx, y0 + 5, hw, 7, kit.outline);
      pixelEllipse(ctx, gx, y0 + 5, hw - 1, 6, kit.shirt);
      pixelEllipse(ctx, gx, y0 + 7, Math.round(hw * 0.55), 3, C.text);
      pline(ctx, gx - hw - 4, y0 - 1, gx + hw + 4, y0 - 1, C.figureLight);
      pline(ctx, gx - hw - 2, y0 + 2, gx + hw + 2, y0 + 2, C.figureMid);
      break;
    }
    case 'park': {
      // Perihelion Park: one small stand and an open pitch, a long way out.
      groundUnder(s, gx - hw - 4, gx + hw + 4, y0 - 2);
      px(ctx, gx - hw, y0 - 5, hw * 2, 4, C.figureLight);
      px(ctx, gx - hw + 1, y0 - 4, hw * 2 - 2, 2, C.text);
      px(ctx, gx, y0 - 5, 1, 4, C.figureMid);
      box(s, gx - Math.round(hw * 0.5), y0 - 12, hw, 6);
      px(ctx, gx - Math.round(hw * 0.5) + 2, y0 - 10, hw - 4, 1, C.text);
      for (let x = gx - hw - 4; x <= gx + hw + 4; x += 3) px(ctx, x, y0 - 3, 1, 2, C.figureMid);
      break;
    }
    case 'scatter': {
      // The Scatter: a small pitch and a few seat modules spread out round
      // it in the dark. Please spread out.
      groundUnder(s, gx - hw, gx + hw, y0 - 2);
      px(ctx, gx - hw, y0 - 4, hw * 2, 3, kit.outline);
      px(ctx, gx - hw + 1, y0 - 3, hw * 2 - 2, 1, C.text);
      const spots: Array<[number, number]> = [[-1.6, -14], [-0.9, -26], [0.2, -34], [1.1, -22], [1.7, -10], [-0.3, -18]];
      spots.forEach(([fx, fy], i) => {
        const drift = t === 0 ? 0 : Math.floor(t / 900 + i) % 2;
        box(s, gx + Math.round(fx * hw) - 2, y0 + fy + drift, 5, 3);
        px(ctx, gx + Math.round(fx * hw) - 2, y0 + fy + drift, 5, 1, C.figureLight);
      });
      break;
    }
    case 'tilted': {
      // The Tilted Field: Uranus has no ground and lies on its side; so does
      // the pitch, floating on its thrusters.
      const dy = y0 - lift;
      thrusters(s, [gx - Math.round(hw * 0.6), gx + Math.round(hw * 0.6)], dy + 6);
      pline(ctx, gx - hw - 4, dy + 8, gx + hw + 4, dy - 4, C.figureMid, 3);
      pline(ctx, gx - hw, dy + 5, gx + hw, dy - 5, C.text, 2);
      pline(ctx, gx - hw - 4, dy + 3, gx - Math.round(hw * 0.4), dy - 0, kit.shirt, 3);
      pline(ctx, gx + Math.round(hw * 0.4), dy - 5, gx + hw + 4, dy - 8, kit.shirt, 3);
      pline(ctx, gx - hw - 4, dy + 2, gx - Math.round(hw * 0.4), dy - 1, kit.outline);
      pline(ctx, gx + Math.round(hw * 0.4), dy - 6, gx + hw + 4, dy - 9, kit.outline);
      break;
    }
    case 'colosseum': {
      // The Halo: Cassini Colosseum on a fragment of the rings, two tiers of
      // arches.
      const dy = y0 - lift;
      for (let r = 0; r < 6; r++) {
        const half = Math.round(hw + 6 - r * 1.5 - ((r * 7) % 3));
        px(ctx, gx - half, dy + r, half * 2, 1, r < 2 ? C.figureMid : C.figureDark);
      }
      for (let tier = 0; tier < 2; tier++) {
        const half = hw - tier * 4, top = dy - 8 - tier * 7;
        box(s, gx - half, top, half * 2, 8);
        for (let x = gx - half + 2; x < gx + half - 2; x += 4) {
          px(ctx, x, top + 3, 2, 4, C.bg);
          px(ctx, x, top + 2, 2, 1, kit.outline);
        }
      }
      px(ctx, gx - hw + 6, dy - 2, hw * 2 - 12, 2, C.text);
      break;
    }
  }
}
