// ── WagerWidget.loading.test.tsx ────────────────────────────────────────────
// The wager widget's loading state must always resolve (#685).
//
// `loaded` used to be set from the fetch effect, including a synchronous
// `setLoaded(true)` on the not-bettable early return. #685 derives it from
// the request key instead. These tests pin every path out of "Tuning in to
// the bookie": a match that is not bettable (closed, or with no id), a fan
// who is not signed in, a failed fetch, a signed-in fan, and the reload
// after a placement.
//
// The data layer is replaced at the feature seams (auth, betting, the
// Supabase provider); the widget itself is the real component.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as AuthModule from '../features/auth';

const seam = vi.hoisted(() => ({
  user: null as { id: string } | null,
  getMatchOdds: vi.fn(),
  getUserWagerForMatch: vi.fn(),
  placeWager: vi.fn(),
  refreshProfile: vi.fn(),
  // One stable client: the widget keys its fetch on the client identity.
  client: {},
}));

vi.mock('../shared/supabase/SupabaseProvider', () => ({
  usePublicReadClient: () => seam.client,
  useSupabase: () => seam.client,
}));
vi.mock('../features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  useAuth: () => ({
    user: seam.user,
    profile: seam.user ? { credits: 200 } : null,
    refreshProfile: seam.refreshProfile,
  }),
}));
vi.mock('../features/betting', () => ({
  getMatchOdds: seam.getMatchOdds,
  getUserWagerForMatch: seam.getUserWagerForMatch,
  placeWager: seam.placeWager,
}));

import WagerWidget from './WagerWidget';

const LOADING = /Tuning in to the bookie/;
const ODDS = { home_odds: 2.1, draw_odds: 3.2, away_odds: 3.6 };

/** A match row with the fields the widget reads. */
function match(over: Partial<{ id: string; status: string }> = {}) {
  return {
    id: 'm1',
    status: 'scheduled',
    home_team: { name: 'Earth United' },
    away_team: { name: 'Mars Athletic' },
    ...over,
  };
}

/** Render the widget and let its fetch promises settle. */
async function renderWidget(m: ReturnType<typeof match>) {
  const view = render(
    <MemoryRouter>
      <WagerWidget match={m} />
    </MemoryRouter>,
  );
  await settle();
  return view;
}

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeEach(() => {
  seam.user = null;
  seam.getMatchOdds.mockReset();
  seam.getUserWagerForMatch.mockReset();
  seam.placeWager.mockReset();
  seam.refreshProfile.mockReset();
  seam.getMatchOdds.mockResolvedValue(ODDS);
  seam.getUserWagerForMatch.mockResolvedValue(null);
  seam.refreshProfile.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('WagerWidget loading state (#685)', () => {
  it('not bettable (match closed): shows the closed note, never the loading line, fetches nothing', async () => {
    await renderWidget(match({ status: 'completed' }));
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.getByText(/Match complete/)).toBeTruthy();
    expect(seam.getMatchOdds).not.toHaveBeenCalled();
  });

  it('not bettable (no match id): resolves straight to the no-odds note without fetching', async () => {
    await renderWidget(match({ id: '' }));
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.getByText(/Odds haven.t been posted/)).toBeTruthy();
    expect(seam.getMatchOdds).not.toHaveBeenCalled();
  });

  it('not signed in: loads the odds only, then offers sign-up', async () => {
    let answer: (odds: typeof ODDS) => void = () => {};
    seam.getMatchOdds.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    await renderWidget(match());
    expect(screen.getByText(LOADING)).toBeTruthy();

    await act(async () => { answer(ODDS); });
    await settle();
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.getByText('Sign up to bet')).toBeTruthy();
    expect(seam.getUserWagerForMatch).not.toHaveBeenCalled();
  });

  it('a failed fetch still resolves the loading state', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seam.getMatchOdds.mockRejectedValue(new Error('offline'));
    await renderWidget(match());
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.getByText(/Odds haven.t been posted/)).toBeTruthy();
    warn.mockRestore();
  });

  it('signed in: loads odds and the existing wager, then shows the picker', async () => {
    seam.user = { id: 'u1' };
    await renderWidget(match());
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(seam.getUserWagerForMatch).toHaveBeenCalledWith(seam.client, 'u1', 'm1');
    expect(screen.getByText('Home Win')).toBeTruthy();
  });

  it('after a placement, reloads (loading line) and settles again', async () => {
    seam.user = { id: 'u1' };
    seam.placeWager.mockResolvedValue({ id: 'w1' });
    await renderWidget(match());
    expect(seam.getMatchOdds).toHaveBeenCalledTimes(1);

    let answer: (odds: typeof ODDS) => void = () => {};
    seam.getMatchOdds.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    seam.getUserWagerForMatch.mockResolvedValue({ team_choice: 'home', stake: 10, odds_snapshot: 2.1 });

    fireEvent.click(screen.getByText('Home Win'));
    const place = screen.getAllByRole('button').find((b) => /^Place/i.test(b.textContent ?? ''));
    if (!place) throw new Error('place button not found');
    await act(async () => { fireEvent.click(place); });
    await settle();
    expect(seam.placeWager).toHaveBeenCalledTimes(1);
    expect(screen.getByText(LOADING)).toBeTruthy();

    await act(async () => { answer(ODDS); });
    await settle();
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(seam.getMatchOdds).toHaveBeenCalledTimes(2);
  });
});
