// ── features/match/logic/sky.ts ─────────────────────────────────────────────
//
// The sky over the home ground at a given moment, from real positions
// (orbits.ts): where the Sun, the planets and the away club's world stand,
// how big each looks, and which side of each the Sun lights.
//
// The scene is a panorama along the ecliptic (where the planets travel), so
// the worlds line up across the sky the way they really do:
//   x          ecliptic longitude as seen from the home world, across a 180
//              degree field of view. The view turns to keep the away world
//              in frame, and the Sun too whenever the two are within 150
//              degrees of each other.
//   y          the ecliptic as a gentle arc, each body raised or lowered by
//              its ecliptic latitude (Pluto, Eris and Pallas sit well off it).
//   radius     from the real angular size, on a log scale so that Jupiter
//              over Europa fills the sky and Mars from Earth is a small disc;
//              the away world is never drawn smaller than MIN_AWAY_R.
//   light      the real phase: the angle Sun-body-observer, turned toward
//              the Sun's place on screen (Venus can be a crescent).
//   overhead   every club moon is tidally locked, and its ground is on the
//              side facing its planet: so the planet hangs fixed overhead
//              (Jupiter over Europa, Pluto over Charon's north stand),
//              at its real size and phase.
//
// Pure: the scene layout (art pixels) comes in as options.

import { bodyPosition, KM_PER_AU, MOONS, RADIUS_KM, type Vec3 } from './orbits';

/** The bodies always looked for in the sky (the away world is added). */
const MAJORS = ['Sun', 'Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'] as const;

/** The body whose surface the home ground stands on (not drawn in its own sky). */
export function surfaceBody(location: string): string {
  return location === 'Saturn Rings' ? 'Saturn' : location;
}

/** Planet systems: the planet and its club moons. */
const SYSTEMS: Record<string, readonly string[]> = {
  Earth: ['Earth', 'Moon', 'Largest Orbital Colony'],
  Jupiter: ['Jupiter', 'Europa', 'Ganymede', 'Callisto'],
  Saturn: ['Saturn', 'Titan', 'Enceladus'],
  Pluto: ['Pluto', 'Charon'],
};

/** Which system a world belongs to (itself when it has none). */
function systemOf(world: string): string {
  for (const [planet, members] of Object.entries(SYSTEMS)) if (members.includes(world)) return planet;
  return world;
}

/** Worlds drawn with rings (they take up more sky). */
const RINGED = new Set(['Saturn', 'Saturn Rings', 'Uranus']);

/** Half the field of view, degrees. */
export const FOV_HALF = 90;
/** The away world is the scene's subject: never smaller than this. */
export const MIN_AWAY_R = 7;

export interface SkyBody {
  name: string;
  kind: 'sun' | 'away' | 'world';
  /** Art pixels. */
  x: number;
  y: number;
  r: number;
  /** Unit light direction: screen x, screen y (down), toward the viewer. */
  light: { x: number; y: number; z: number };
  /** Distance from the home world, AU. */
  au: number;
}

export interface SkyOptions {
  /** Scene width, art pixels. */
  width: number;
  /** Home world's surface height at a column. */
  horizon: (x: number) => number;
  /** Space kept from the frame's sides and top. */
  pad: number;
}

const DEG = 180 / Math.PI;
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

/** Apparent radius in art pixels from the real angular size. */
export function apparentRadius(radiusKm: number, au: number): number {
  const arcsec = Math.atan(radiusKm / (au * KM_PER_AU)) * DEG * 3600;
  return Math.min(44, Math.max(1, Math.round(2 + 6 * Math.log10(1 + arcsec / 2))));
}

/**
 * The sky over the home ground.
 *
 * @param home  The home club's location (teams.location).
 * @param away  The away club's location; the same as `home` for a derby.
 * @param ms    When (the away ship's arrival is a good moment).
 * @returns     Bodies in frame, nearest last (so they draw on top), and the
 *              away world (null for a derby or an unknown world).
 */
export function skyScene(home: string, away: string, ms: number, o: SkyOptions): { bodies: SkyBody[]; away: SkyBody | null } {
  const surface = surfaceBody(home);
  const found = bodyPosition(home, ms);
  if (!found) return { bodies: [], away: null };
  const O: Vec3 = found;

  const names = new Set<string>(MAJORS);
  const derby = surfaceBody(away) === surface || away === home;
  if (!derby) names.add(away);
  // The home system's neighbours hang in its sky: Jupiter over its moons,
  // Pluto over Charon, the other club moons nearby.
  for (const n of SYSTEMS[systemOf(surface)] ?? []) names.add(n);
  // The rings club is Saturn in anyone else's sky.
  if (away === 'Saturn Rings') names.delete('Saturn');
  names.delete(surface);
  names.delete(home);

  type Seen = { name: string; p: Vec3; v: Vec3; au: number; lon: number; lat: number };
  const seen: Seen[] = [];
  for (const name of names) {
    const p = bodyPosition(name, ms);
    if (!p) continue;
    const v = sub(p, O);
    const au = len(v);
    if (au < 1e-9) continue;
    seen.push({ name, p, v, au, lon: Math.atan2(v.y, v.x) * DEG, lat: Math.asin(v.z / au) * DEG });
  }
  const sun = seen.find((s) => s.name === 'Sun')!;
  const awaySeen = derby ? undefined : seen.find((s) => s.name === away);

  // Turn the view: both the Sun and the away world in frame when they are
  // within 150 degrees; otherwise the away world 40 degrees off centre.
  let centre = sun.lon;
  if (awaySeen) {
    const gap = wrap(sun.lon - awaySeen.lon);
    centre = Math.abs(gap) <= 150 ? awaySeen.lon + gap / 2 : awaySeen.lon + Math.sign(gap || 1) * 40;
  }

  const half = o.width / 2 - o.pad;
  const xOf = (lon: number) => o.width / 2 - (wrap(lon - centre) / FOV_HALF) * half;
  const arc = (x: number) => 58 + 30 * ((x - o.width / 2) / (o.width / 2)) ** 2;

  const bodies: SkyBody[] = [];
  let awayBody: SkyBody | null = null;
  // The planet a tidally locked home moon faces (Saturn is the rings club
  // when they are the visitors).
  const parentName = MOONS[home]?.parent;
  const locked = parentName === 'Saturn' && away === 'Saturn Rings' ? 'Saturn Rings' : parentName;
  for (const s of seen) {
    if (s.name === locked) continue;
    if (Math.abs(wrap(s.lon - centre)) > FOV_HALF) continue;
    const kind: SkyBody['kind'] = s.name === 'Sun' ? 'sun' : s.name === away ? 'away' : 'world';
    let r = apparentRadius(RADIUS_KM[s.name] ?? 100, s.au);
    if (kind === 'away') r = Math.max(MIN_AWAY_R, r);
    if (kind === 'sun') r = Math.max(4, r);
    const x = xOf(s.lon);
    const y = Math.min(Math.max(arc(x) - s.lat * 1.2, o.pad + r), o.horizon(x) - r - 18);

    const b: SkyBody = { name: s.name, kind, x, y, r, light: phase(s, x, y), au: s.au };
    bodies.push(b);
    if (kind === 'away') awayBody = b;
  }

  // The planet a tidally locked home moon faces, fixed overhead.
  const parent = locked ? seen.find((s) => s.name === locked) : undefined;
  if (parent) {
    const r = apparentRadius(RADIUS_KM[parent.name] ?? 100, parent.au);
    const x = Math.round(o.width * 0.3), y = o.pad + r + 4;
    // Playing the planet itself (Europa v Jupiter): it is the away world.
    const isAway = parent.name === away;
    const b: SkyBody = { name: parent.name, kind: isAway ? 'away' : 'world', x, y, r: isAway ? Math.max(MIN_AWAY_R, r) : r, light: phase(parent, x, y), au: parent.au };
    bodies.push(b);
    if (isAway) awayBody = b;
  }

  /** Phase: the angle at the body between the Sun and the viewer, turned toward the Sun's place on screen. */
  function phase(s: Seen, x: number, y: number) {
    let light = { x: 0, y: 0, z: 1 };
    if (s.name !== 'Sun') {
      const toSun = sub({ x: 0, y: 0, z: 0 }, s.p), toViewer = sub(O, s.p);
      const cos = (toSun.x * toViewer.x + toSun.y * toViewer.y + toSun.z * toViewer.z) / (len(toSun) * len(toViewer));
      const alpha = Math.acos(Math.max(-1, Math.min(1, cos)));
      const sx = o.width / 2 - (wrap(sun.lon - centre) / FOV_HALF) * half;
      const sy = arc(sx) - sun.lat * 1.2;
      let dx = sx - x, dy = sy - y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) {
        dx = -1;
        dy = 0;
      } else {
        dx /= d;
        dy /= d;
      }
      light = { x: dx * Math.sin(alpha), y: dy * Math.sin(alpha), z: Math.cos(alpha) };
    }
    return light;
  }
  // Ringed worlds take up their rings' width.
  const reach = (b: SkyBody) => (RINGED.has(b.name) ? b.r * 1.95 : b.r);
  // Keep the sky legible: the away world always shows; anything else that
  // would sit on top of a body already placed (most of the inner planets,
  // seen from the Kuiper Belt, crowd round the Sun) is left out. An away
  // world lost in the Sun's glare is drawn just clear of it, above.
  const priority = (b: SkyBody) => (b.name === locked ? -1 : b.kind === 'away' ? 0 : b.kind === 'sun' ? 1 : 2);
  bodies.sort((a, b) => priority(a) - priority(b) || b.r - a.r);
  const kept: SkyBody[] = [];
  for (const b of bodies) {
    const hit = kept.find((k) => Math.hypot(k.x - b.x, k.y - b.y) < reach(k) + reach(b) + 3);
    // Behind the overhead planet, the Sun is eclipsed.
    if (b.kind === 'sun' && hit && hit.name === locked) continue;
    if (b.kind === 'sun' && hit && hit.kind === 'away') {
      hit.y = Math.max(o.pad + hit.r, b.y - b.r - reach(hit) - 6);
      kept.push(b);
      continue;
    }
    // The away world always shows: beside the overhead planet if it would
    // sit on it.
    if (b.kind === 'away' && hit) {
      const dir = hit.x < o.width / 2 ? 1 : -1;
      b.x = Math.min(Math.max(hit.x + dir * (reach(hit) + reach(b) + 8), o.pad + reach(b)), o.width - o.pad - reach(b));
      kept.push(b);
      continue;
    }
    if (hit) continue;
    kept.push(b);
  }
  kept.sort((a, b) => b.au - a.au);
  return { bodies: kept, away: awayBody };
}
