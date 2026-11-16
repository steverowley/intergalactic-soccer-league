// ── data/stadiums.ts ────────────────────────────────────────────────────────
//
// Every club's ground as the match-day journey draws it, taken from the lore
// (owner, 2026-11-16: "redesign the stadiums and use the descriptions from
// the lore"). `style` picks the pixel drawing (features/match/ui/journey/
// stadiumArt.ts); `line` is the lore's own words about the ground, quoted
// under the scene; `why` notes which lore the drawing follows.
//
// Capacity (teams.capacity, from leagueData) sets the drawn size.

import { TEAMS_BY_LEAGUE } from './leagueData';

/** The pixel drawing for a ground. */
export type StadiumStyle =
  | 'heatbox' // a sealed box with a sun shield, heat shimmer above
  | 'grand' // a three-tier bowl with flags: a heritage venue
  | 'dome' // a bowl under a pressure dome, steam vents
  | 'greenhouse' // glass arches over a green park
  | 'dustbowl' // a low open bowl, dust devils
  | 'peak' // a bowl on a mountain summit
  | 'trench' // terraces cut down a canyon's walls
  | 'ring' // a ring habitat with the pitch round its floor
  | 'storm' // a floating platform over a storm
  | 'subsurface' // under the ice, a hatch on the surface
  | 'crater' // a bowl inside a crater's rim
  | 'den' // a long low stand with jagged gables and icicles
  | 'haze' // an open park by a methane lake, haze drifting
  | 'geyser' // a bowl with geysers erupting behind it
  | 'carved' // terraces cut into a rock outcrop
  | 'drifter' // a stadium on thruster legs, never in one place
  | 'underground' // a stair and a hatch; the floodlights stay off
  | 'forge' // a metal stand with glowing chimneys and sparks
  | 'temple' // a pediment on columns, names over the door
  | 'hub' // a bowl with docking gantries and departure lights
  | 'mine' // a headframe over the shaft, half a roof
  | 'icebox' // a stand built of ice blocks, frost falling
  | 'lagrange' // an open bowl with Pluto hanging over the north stand
  | 'outpost' // a tiny stand and a tall beacon mast
  | 'oval' // a stretched oval, the sky spinning
  | 'cradle' // a small bowl under a single arch
  | 'pit' // a sunken pit crossed by walkways
  | 'park' // one small stand and an open pitch
  | 'scatter' // a few seat modules scattered round the pitch
  | 'tilted' // a floating pitch on a tilt
  | 'colosseum'; // tiers of arches on a ring-fragment platform

export interface StadiumLook {
  style: StadiumStyle;
  /** The lore's words about the ground, quoted verbatim; empty where the lore has none. */
  line: string;
  /** Which lore the drawing follows (for maintainers). */
  why: string;
}

/** Keyed by team id. */
export const STADIUMS: Record<string, StadiumLook> = {
  'mercury-runners': { style: 'heatbox', line: 'Solar Exposure Party calls again for flare pause at the Heat Box. Runners say they would simply outrun it.', why: '"The Heat Box": intense conditions on the scorching planet' },
  'earth-united': { style: 'grand', line: 'One g, one club, one Blue Marble.', why: 'Iconic Blue Marble Arena, legendary tier, 95,000' },
  'venus-volcanic': { style: 'dome', line: 'Founded 2419 under the domes. Eighteen Crust Cups. Ask Earth United.', why: 'Pressure Cooker Stadium, founded under the domes' },
  'terra-nova': { style: 'greenhouse', line: 'Terra Nova have three teenagers on the pitch and every one of them is running at the full-back.', why: 'The World Park, "The Greenhouse"' },
  'mars-athletic': { style: 'dustbowl', line: '', why: 'Red Planet Arena, "The Dust Bowl"' },
  'olympus-mons': { style: 'peak', line: 'The highest ground in football. Please acclimatise before kick-off.', why: 'Limeil Stadium, "The Mountain": the highest-altitude stadium in the league' },
  'valles-mariners': { style: 'trench', line: '', why: 'Canyon Complex, "The Trench": in the Valles Marineris' },
  'solar-city': { style: 'ring', line: 'The first ground off a planet. Visitors, please allow half a season to adjust.', why: 'Orbital Stadium, "The Ring"' },
  'jupiter-titans': { style: 'storm', line: '', why: 'Storm Arena, "The Red Spot", 110,000: Jupiter has no ground, so it floats' },
  'europa-oceanic': { style: 'subsurface', line: '', why: 'Subsurface Stadium, "The Ice Bowl": under Europa\'s ice' },
  'ganymede-united': { style: 'crater', line: '', why: 'Crater Fields, "The Cradle"' },
  'callisto-wolves': { style: 'den', line: 'Founded 2483 on the Frozen Plains. Eight titles. Still hunting.', why: 'Frozen Plains Stadium, "The Howling Den"' },
  'saturn-rings': { style: 'colosseum', line: '', why: 'Cassini Colosseum, "The Halo": on the rings' },
  'titan-methane': { style: 'haze', line: '', why: 'Hydrocarbon Park, "The Orange Haze"' },
  'enceladus-geysers': { style: 'geyser', line: 'Never relax against the Geysers. The moment you think nothing is happening is the moment everything happens.', why: 'Geyser Stadium, "The Spray"' },
  'uranus-sidewinders': { style: 'tilted', line: 'Sideways, sideways, round and round, the Sidewinders never go straight to ground.', why: 'Polar Tilt Arena, "The Tilted Field": Uranus has no ground, so it floats' },
  'ceres-miners': { style: 'carved', line: 'Dwarf Planet Field. Cut from the rock, 2468. Visitors are reminded that jumping is at their own risk.', why: 'Dwarf Planet Field, "The Rock": cut from the rock' },
  vesta: { style: 'crater', line: "Protoplanet Arena. The ground beneath your seat is older than football, older than Earth's oceans, and has seen Vesta beat Ceres in a final.", why: 'Protoplanet Arena, "The Crater"' },
  'pallas-wanderers': { style: 'drifter', line: 'Nomad Stadium welcomes visiting supporters, and apologises for the journey.', why: 'Nomad Stadium, "The Drifter"' },
  'hygiea-united': { style: 'underground', line: 'Hygiea United announce floodlight upgrade. Club confirms it will not be switched on.', why: 'Subterranean Field, "The Dark Pitch"' },
  'psyche-metallics': { style: 'forge', line: '', why: 'Core Ore Stadium, "The Forge": a metal world' },
  'juno-city': { style: 'temple', line: 'Juno Memorial Stadium. Twenty-two names over the door, in formation.', why: 'Juno Memorial Stadium, "The Temple"' },
  beltway: { style: 'hub', line: 'Transit Hub Arena. Away supporters are reminded to listen for their departure call.', why: 'Transit Hub Arena, "The Junction"' },
  'solar-miners': { style: 'mine', line: 'Extraction Field. The smell is normal. The noise is normal. The roof is under review.', why: 'Extraction Field, "The Dig": partly underground in a decommissioned ore shaft' },
  'pluto-frost': { style: 'icebox', line: "Thane Noor's season ticket seat is empty again today. It always is. Nobody sits in it.", why: 'Nitrogen Icebox, "The Deep Freeze"' },
  'charon-united': { style: 'lagrange', line: "Pluto's over the north stand as always. Charon don't look up. They never look up.", why: 'Binary Lagrange Arena: the best view of Pluto in the system' },
  'eris-wanderers': { style: 'outpost', line: 'Distant Objects Stadium. If you are reading this, you have arrived. Well done.', why: 'Distant Objects Stadium, "The Outpost"' },
  'haumea-spinners': { style: 'oval', line: 'Centrifuge Field. Visitors experiencing dizziness should look at the pitch, not the sky.', why: 'Centrifuge Field, "The Oval": Haumea spins every four hours' },
  makemake: { style: 'cradle', line: 'Creation Stadium. Twelve thousand seats, and every one of them has seen something new.', why: 'Creation Stadium, "The Cradle"' },
  'orcus-athletic': { style: 'pit', line: 'The Underworld Arena. Please keep to the walkways. The free kicks are for the players.', why: 'Underworld Arena, "The Pit"' },
  'sedna-mariners': { style: 'park', line: 'Perihelion Park. Named for our closest approach. We are prepared to wait for the next one.', why: 'Perihelion Park, "The Long Way Round": the most remote ground' },
  'scattered-disc': { style: 'scatter', line: 'Void Stadium. Capacity eight thousand. Please spread out.', why: 'Void Stadium, "The Scatter": sparse attendance, enormous silence' },
};

/** A ground with no entry: a plain bowl. */
export const DEFAULT_STADIUM: StadiumLook = { style: 'cradle', line: '', why: 'fallback' };

/** A club's ground: its look, name, nickname and seats. */
export interface Ground {
  look: StadiumLook;
  name: string | null;
  nickname: string | null;
  capacity: number;
}

/**
 * Look up a club's ground by team id.
 *
 * @returns The lore look (DEFAULT_STADIUM when the club has none), the name
 *          and nickname from `homeGround` ('Name, "Nickname"'), and seats.
 */
export function groundFor(teamId: string | null | undefined): Ground {
  const team = Object.values(TEAMS_BY_LEAGUE).flat().find((t) => t.id === teamId);
  const [name, nick] = (team?.homeGround ?? '').split(/,\s*/);
  return {
    look: (teamId && STADIUMS[teamId]) || DEFAULT_STADIUM,
    name: name?.trim() || null,
    nickname: nick ? nick.replace(/"/g, '').trim() : null,
    capacity: Number((team?.capacity ?? '30000').replace(/[^0-9]/g, '')) || 30_000,
  };
}
