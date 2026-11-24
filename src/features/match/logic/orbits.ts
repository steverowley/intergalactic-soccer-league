// ── features/match/logic/orbits.ts ──────────────────────────────────────────
//
// Where every club world really is, at any moment (owner, 2026-11-16: "real
// positional planets"). Osculating Keplerian elements from NASA JPL Horizons
// (https://ssd.jpl.nasa.gov/horizons), ecliptic J2000, at epoch 2026-11-16
// 00:00 TDB (JD 2461360.5): heliocentric for the planets, dwarf planets and
// asteroids; planet-centred for the moons. Propagated with Kepler's equation,
// which holds the planets to a fraction of a degree for years either side of
// the epoch: far finer than the scene can show.
//
// Three club locations are not real bodies, so they get honest stand-ins:
//   Largest Orbital Colony  at the Earth-Moon L5 point (the Moon's orbit,
//                           60 degrees behind the Moon)
//   Asteroid Belt Colony    on Ceres' orbit, 20 degrees ahead of Ceres
//   Outer Kuiper Belt       a circular orbit at 50 AU, ecliptic longitude 200
//   Saturn Rings            a point in the B ring (125,000 km, Saturn's ring plane)
//
// Positions are in AU, ecliptic coordinates (x toward the vernal equinox).

/** Osculating elements: AU, degrees, degrees per day. */
export interface Elements {
  a: number;
  e: number;
  i: number;
  node: number;
  peri: number;
  /** Mean anomaly at the epoch. */
  M: number;
  /** Mean motion. */
  n: number;
}

/** The elements' epoch, ms since 1970 (2026-11-16 00:00 TDB). */
export const EPOCH_MS = Date.UTC(2026, 10, 16, 0, 0, 0) - 69_184;

/** Heliocentric elements (JPL Horizons). */
export const HELIO: Record<string, Elements> = {
  Mercury: { a: 0.38709764, e: 0.20563746, i: 7.0033691, node: 48.29719221, peri: 29.20056154, M: 23.10702896, n: 4.09235529 },
  Venus: { a: 0.72333686, e: 0.00674324, i: 3.39445348, node: 76.60305935, peri: 54.98781439, M: 296.09761524, n: 1.6021151 },
  Earth: { a: 1.00022472, e: 0.01708228, i: 0.00484254, node: 195.00954255, peri: 268.31517941, M: 311.42886602, n: 0.98527701 },
  Mars: { a: 1.5237474, e: 0.0933939, i: 1.84743047, node: 49.48006655, peri: 286.66991344, M: 122.95067411, n: 0.52400409 },
  Jupiter: { a: 5.20157586, e: 0.04839836, i: 1.30391604, node: 100.52747102, peri: 273.37279177, M: 116.04637366, n: 0.08312064 },
  Saturn: { a: 9.53471385, e: 0.05514014, i: 2.48725427, node: 113.55567784, peri: 339.40794131, M: 285.61201977, n: 0.03348148 },
  Uranus: { a: 19.26163364, e: 0.04763976, i: 0.77097001, node: 74.0415623, peri: 92.56630566, M: 261.92298544, n: 0.01165934 },
  Neptune: { a: 30.06282925, e: 0.00982075, i: 1.76695292, node: 131.65416652, peri: 282.70678131, M: 309.45494626, n: 0.00597958 },
  Pluto: { a: 39.49973839, e: 0.24706766, i: 16.97599535, node: 110.15655482, peri: 114.33277892, M: 53.71369911, n: 0.0039702 },
  Ceres: { a: 2.76634293, e: 0.07983186, i: 10.58678202, node: 80.24843948, peri: 73.12204168, M: 308.88024973, n: 0.21421262 },
  Pallas: { a: 2.76925042, e: 0.23072152, i: 34.93449316, node: 172.88759012, peri: 310.99780545, M: 288.4372133, n: 0.21387535 },
  Juno: { a: 2.67091379, e: 0.25563948, i: 12.98727948, node: 169.80909114, peri: 247.90122731, M: 298.84774403, n: 0.22579497 },
  Vesta: { a: 2.36113829, e: 0.09024424, i: 7.14388451, node: 103.69943518, peri: 151.40915864, M: 124.71295353, n: 0.27165765 },
  Hygiea: { a: 3.1501911, e: 0.10585876, i: 3.82452859, node: 283.08182696, peri: 312.63515754, M: 279.95604947, n: 0.17627825 },
  Psyche: { a: 2.92593025, e: 0.13562147, i: 3.10174781, node: 149.95545817, peri: 230.11173697, M: 111.13758844, n: 0.1969283 },
  Haumea: { a: 43.09858068, e: 0.19358409, i: 28.20848734, node: 121.78512389, peri: 240.52326708, M: 223.93177825, n: 0.00348345 },
  Makemake: { a: 45.60853802, e: 0.15791538, i: 29.02395144, node: 79.31711699, peri: 297.06145457, M: 170.48357989, n: 0.00319989 },
  Eris: { a: 67.89174059, e: 0.43903299, i: 43.96508062, node: 35.9894936, peri: 150.85013407, M: 212.00640846, n: 0.00176189 },
  Sedna: { a: 538.87102326, e: 0.85866519, i: 11.92494461, node: 144.51966571, peri: 311.16111922, M: 358.5860751, n: 7.879e-05 },
  Orcus: { a: 39.40097589, e: 0.21983891, i: 20.55804612, node: 268.4247411, peri: 73.44290798, M: 189.88648886, n: 0.00398514 },
};

/** Moons, relative to their planet (JPL Horizons). */
export const MOONS: Record<string, Elements & { parent: string }> = {
  Moon: { parent: 'Earth', ...{ a: 0.00254179, e: 0.06684317, i: 5.03560696, node: 324.75748657, peri: 135.97236191, M: 209.54768296, n: 13.41099464 } },
  Europa: { parent: 'Jupiter', ...{ a: 0.00448678, e: 0.00942454, i: 2.06747185, node: 326.22856116, peri: 202.99274637, M: 47.07090723, n: 101.32502202 } },
  Ganymede: { parent: 'Jupiter', ...{ a: 0.00715661, e: 0.00255197, i: 2.34402094, node: 339.04893104, peri: 5.31046168, M: 208.11407873, n: 50.30017274 } },
  Callisto: { parent: 'Jupiter', ...{ a: 0.0125923, e: 0.00686371, i: 1.95243924, node: 336.75723832, peri: 36.92645402, M: 116.36472544, n: 21.55104227 } },
  Io: { parent: 'Jupiter', ...{ a: 0.00282107, e: 0.00419886, i: 2.23035478, node: 338.3779505, peri: 18.78306519, M: 86.88691727, n: 203.23680831 } },
  Titan: { parent: 'Saturn', ...{ a: 0.00816817, e: 0.02879604, i: 27.70503187, node: 169.0810371, peri: 178.47045701, M: 353.83350593, n: 22.57412848 } },
  Enceladus: { parent: 'Saturn', ...{ a: 0.00159371, e: 0.00467689, i: 28.04410555, node: 169.53502857, peri: 227.76802449, M: 79.08969363, n: 261.89863303 } },
  Mimas: { parent: 'Saturn', ...{ a: 0.00124352, e: 0.02076724, i: 29.2268863, node: 171.71075458, peri: 200.85347072, M: 302.30791056, n: 379.98775792 } },
  Charon: { parent: 'Pluto', ...{ a: 0.00013099, e: 0.00016074, i: 112.88776781, node: 227.39308377, peri: 172.68267807, M: 54.98723583, n: 56.36252339 } },
  Miranda: { parent: 'Uranus', ...{ a: 0.00086814, e: 0.00151078, i: 97.8467535, node: 163.18132406, peri: 69.31649053, M: 330.16066267, n: 254.59369246 } },
  Phobos: { parent: 'Mars', ...{ a: 6.27e-05, e: 0.01541455, i: 25.64674442, node: 83.23552485, peri: 295.46692113, M: 335.17240861, n: 1127.85936818 } },
};

/** Mean radius in km, for apparent size in the sky. */
export const RADIUS_KM: Record<string, number> = {
  Sun: 696_000, Mercury: 2_440, Venus: 6_052, Earth: 6_371, Mars: 3_390, Jupiter: 69_911, Saturn: 58_232,
  Uranus: 25_362, Neptune: 24_622, Pluto: 1_188, Moon: 1_737, Europa: 1_561, Ganymede: 2_634, Callisto: 2_410,
  Titan: 2_575, Enceladus: 252, Charon: 606, Ceres: 470, Pallas: 256, Juno: 127, Vesta: 263, Hygiea: 217,
  Psyche: 113, Haumea: 800, Makemake: 715, Eris: 1_163, Sedna: 500, Orcus: 455,
  'Largest Orbital Colony': 20, 'Asteroid Belt Colony': 20, 'Outer Kuiper Belt': 100, 'Saturn Rings': 58_232,
};

/** Kilometres per astronomical unit. */
export const KM_PER_AU = 149_597_871;

const RAD = Math.PI / 180;

/** A position in AU. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Position on an orbit at `ms`, relative to the body it orbits. */
export function orbitPosition(el: Elements, ms: number): Vec3 {
  const days = (ms - EPOCH_MS) / 86_400_000;
  const M = ((el.M + el.n * days) % 360) * RAD;
  // Kepler's equation, Newton's method.
  let E = el.e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 30; k++) {
    const dE = (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  const xv = el.a * (Math.cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const O = el.node * RAD, w = el.peri * RAD, i = el.i * RAD;
  const u = v + w;
  return {
    x: r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i)),
    y: r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i)),
    z: r * (Math.sin(u) * Math.sin(i)),
  };
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

/** Stand-in orbits for the locations that are not real bodies. */
const STAND_INS: Record<string, (ms: number) => Vec3> = {
  'Largest Orbital Colony': (ms) => add(bodyPosition('Earth', ms)!, orbitPosition({ ...MOONS.Moon!, M: MOONS.Moon!.M - 60 }, ms)),
  'Asteroid Belt Colony': (ms) => orbitPosition({ ...HELIO.Ceres!, M: HELIO.Ceres!.M + 20 }, ms),
  'Outer Kuiper Belt': (ms) => orbitPosition({ a: 50, e: 0, i: 0, node: 0, peri: 0, M: 200, n: 0.9856076686 / Math.pow(50, 1.5) }, ms),
  'Saturn Rings': (ms) =>
    add(bodyPosition('Saturn', ms)!, orbitPosition({ ...MOONS.Mimas!, a: 125_000 / KM_PER_AU, e: 0, n: 360 / 0.475, M: 0 }, ms)),
};

/**
 * Heliocentric position of a body or club location at `ms`.
 *
 * @returns AU, or null for a name the solar system does not know.
 */
export function bodyPosition(name: string, ms: number): Vec3 | null {
  if (name === 'Sun') return { x: 0, y: 0, z: 0 };
  const h = HELIO[name];
  if (h) return orbitPosition(h, ms);
  const m = MOONS[name];
  if (m) {
    const p = bodyPosition(m.parent, ms);
    return p ? add(p, orbitPosition(m, ms)) : null;
  }
  const s = STAND_INS[name];
  return s ? s(ms) : null;
}

/** Distance between two bodies at `ms`, AU (null if either is unknown). */
export function distanceAu(a: string, b: string, ms: number): number | null {
  const p = bodyPosition(a, ms), q = bodyPosition(b, ms);
  if (!p || !q) return null;
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}
