// ── features/match/ui/journey/GroundGallery.tsx ─────────────────────────────
// Every club's ground as the match-day journey draws it, for the shelf
// (/dev/components): the lore drawing on a strip of the home world, in the
// club's kit, animated like the journey.

import { useEffect, useMemo, useRef } from 'react';
import { TEAMS_BY_LEAGUE, WORLDS } from '../../../../data/leagueData';
import { groundFor } from '../../../../data/stadiums';
import { tone, type } from '../../../../shared/design';
import { Stack } from '../../../../shared/ui';
import { useReducedMotion } from '@features/entities';
import { resolveKits } from '../../logic/viewer';
import { PIXEL_SCALE } from '../viewer/render';
import { drawGroundTile, GROUND_TILE } from './journeyArt';

/** All the clubs' grounds. */
export function GroundGallery() {
  const refs = useRef<Array<HTMLCanvasElement | null>>([]);
  const reducedMotion = useReducedMotion();
  const clubs = useMemo(
    () =>
      Object.values(TEAMS_BY_LEAGUE)
        .flat()
        .map((t) => ({ team: t, ground: groundFor(t.id), kit: resolveKits(t.color, null).home.outfield, world: (WORLDS[t.location] ?? WORLDS['Asteroid Belt Colony']!).look })),
    [],
  );
  useEffect(() => {
    const draw = (t: number) =>
      clubs.forEach((c, i) => {
        const ctx = refs.current[i]?.getContext?.('2d');
        if (ctx) drawGroundTile(ctx, c.ground.look.style, c.kit, c.world, c.ground.capacity, t);
      });
    if (reducedMotion) {
      draw(0);
      return undefined;
    }
    let raf = 0, last = -Infinity;
    const loop = (t: number) => {
      if (t - last >= 120) {
        last = t;
        draw(Math.max(1, t));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clubs, reducedMotion]);
  return (
    <Stack direction="row" gap={12} wrap>
      {clubs.map((c, i) => (
        <Stack key={c.team.id} gap={4} style={{ width: 156 }}>
          <canvas
            ref={(el) => {
              refs.current[i] = el;
            }}
            width={GROUND_TILE.w * PIXEL_SCALE}
            height={GROUND_TILE.h * PIXEL_SCALE}
            role="img"
            aria-label={`${c.ground.name ?? c.team.name}, ${c.team.location}`}
            style={{ width: 156, height: 108, imageRendering: 'pixelated' }}
          />
          <span style={{ ...type.label, ...tone.primary }}>{c.ground.nickname ?? c.ground.name}</span>
          <span style={{ ...type.small, ...tone.secondary }}>{`${c.ground.name ?? ''}, ${c.team.location}`}</span>
        </Stack>
      ))}
    </Stack>
  );
}
