// ── features/match/ui/journey/WorldGallery.tsx ──────────────────────────────
// Every club world as the match-day journey draws it, for the shelf
// (/dev/components): one pixel tile per world with its name.

import { useEffect, useRef } from 'react';
import { WORLDS, type WorldLook } from '../../../../data/leagueData';
import { tone, type } from '../../../../shared/design';
import { Stack } from '../../../../shared/ui';
import { PIXEL_SCALE } from '../viewer/render';
import { drawWorldTile, TILE } from './journeyArt';

/** One world tile. */
function Tile({ name, look, seed }: { name: string; look: WorldLook; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext?.('2d');
    if (ctx) drawWorldTile(ctx, look, seed);
  }, [look, seed]);
  return (
    <Stack gap={4} align="center" style={{ width: 96 }}>
      <canvas
        ref={ref}
        width={TILE * PIXEL_SCALE}
        height={TILE * PIXEL_SCALE}
        role="img"
        aria-label={name}
        style={{ width: 96, height: 96, imageRendering: 'pixelated' }}
      />
      <span style={{ ...type.label, ...tone.secondary, textAlign: 'center' }}>{name}</span>
    </Stack>
  );
}

/**
 * All the club worlds.
 *
 * @returns A wrapping grid of tiles.
 */
export function WorldGallery() {
  return (
    <Stack direction="row" gap={8} wrap>
      {Object.entries(WORLDS).map(([name, w], i) => (
        <Tile key={name} name={name} look={w.look} seed={i + 3} />
      ))}
    </Stack>
  );
}
