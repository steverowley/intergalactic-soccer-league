// ── features/match/ui/journey/labelPlacement.ts ─────────────────────────────
//
// Where to put a scene label so it has room to breathe (owner, 2026-11-16:
// labels need space around them, never over a planet, never close to the
// edge). Pure: the panel measures each label and the frame, then tries the
// spots round the label's target in order and takes the first that is
//   - inside the frame with a margin all round,
//   - clear of every obstacle (worlds, the ground, parked ships, labels
//     already placed) by a gap,
//   - entirely in the sky, above the home world's horizon.
// If none fits, it takes the spot that overlaps least, clamped into the
// frame, so a label is never lost.

/** A box in frame pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlaceOptions {
  /** The label's measured size. */
  size: { w: number; h: number };
  /** What it labels. */
  target: Box;
  /** Spots to try, in order. */
  order: ReadonlyArray<'above' | 'below' | 'left' | 'right'>;
  frame: { w: number; h: number };
  /** Space kept from the frame's edges. */
  margin: number;
  /** Space kept from the target and every obstacle. */
  gap: number;
  obstacles: readonly Box[];
  /** The home world's surface height at a frame x (pixels). */
  horizon: (x: number) => number;
}

/** Overlap area of two boxes. */
function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** A box grown by `g` on every side. */
function grow(b: Box, g: number): Box {
  return { x: b.x - g, y: b.y - g, w: b.w + g * 2, h: b.h + g * 2 };
}

/**
 * Place one label.
 *
 * @returns Its top-left corner in frame pixels, and the spot's cost (0 when
 *          it has all the room it should).
 */
export function placeLabel(o: PlaceOptions): { x: number; y: number; cost: number } {
  const { size, target: t, frame, margin, gap } = o;
  const clampX = (x: number) => Math.min(Math.max(x, margin), frame.w - margin - size.w);
  const clampY = (y: number) => Math.min(Math.max(y, margin), frame.h - margin - size.h);
  const spot = (side: 'above' | 'below' | 'left' | 'right') => {
    const cx = t.x + t.w / 2 - size.w / 2;
    const cy = t.y + t.h / 2 - size.h / 2;
    if (side === 'above') return { x: clampX(cx), y: t.y - gap - size.h };
    if (side === 'below') return { x: clampX(cx), y: t.y + t.h + gap };
    if (side === 'left') return { x: t.x - gap - size.w, y: clampY(cy) };
    return { x: t.x + t.w + gap, y: clampY(cy) };
  };
  const cost = (p: { x: number; y: number }) => {
    const box = { x: p.x, y: p.y, w: size.w, h: size.h };
    let c = 0;
    // Outside the frame's margin.
    const inner = { x: margin, y: margin, w: frame.w - margin * 2, h: frame.h - margin * 2 };
    c += size.w * size.h - overlap(box, inner);
    // Into the target or an obstacle (with the gap).
    c += overlap(box, grow(t, gap - 1));
    for (const ob of o.obstacles) c += overlap(box, grow(ob, gap));
    // Below the horizon (over the home world), sampled across the label.
    for (let i = 0; i <= 8; i++) {
      const x = box.x + (box.w * i) / 8;
      const under = box.y + box.h + gap - o.horizon(x);
      if (under > 0) c += under * (box.w / 8);
    }
    return c;
  };
  let best = spot(o.order[0]!);
  let bestCost = Infinity;
  for (const side of o.order) {
    const p = spot(side);
    const c = cost(p);
    if (c === 0) return { ...p, cost: 0 };
    if (c < bestCost) {
      best = p;
      bestCost = c;
    }
  }
  return { x: clampX(best.x), y: clampY(best.y), cost: bestCost };
}
