// ── shared/utils/longTimeout.ts ─────────────────────────────────────────────
// WHY (#727): `setTimeout` stores its delay as a signed 32-bit integer, so a
// delay above 2^31 - 1 ms (about 24.8 days) overflows and the timer fires
// AT ONCE. The match page scheduled its pre-kick-off timer as
// `setTimeout(begin, kickoff - now)`, so for a fixture weeks away it fired
// immediately and polled every 5 s for a match that had not started.
//
// `setTimeoutAt` waits for an absolute moment instead, in bounded steps: each
// step sleeps at most MAX_TIMEOUT_STEP_MS, then re-reads the clock and either
// fires or arms the next step. Re-reading the clock also corrects for a laptop
// that slept or a tab whose timers the browser throttled. Use it for any
// timer whose delay is computed from a date (a kick-off, a window closing)
// rather than a small constant.

/**
 * Longest single `setTimeout` this helper arms: one day. Far below the
 * 2^31 - 1 ms ceiling, and a fixture months away costs one wake-up a day.
 */
export const MAX_TIMEOUT_STEP_MS = 24 * 60 * 60 * 1000;

/**
 * Run `fn` once at the wall-clock moment `atMs` (epoch ms), however far away.
 * A moment already past fires on the next macrotask, never synchronously.
 *
 * @param atMs  When to fire, epoch milliseconds (`Date.now()` scale).
 * @param fn    The callback.
 * @returns     A cancel function: after it, `fn` never runs. Safe to call
 *              more than once and after the timer has fired.
 *
 * @example
 *   useEffect(() => setTimeoutAt(kickoffMs, () => setStarted(true)), [kickoffMs]);
 */
export function setTimeoutAt(atMs: number, fn: () => void): () => void {
  let handle: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const arm = (): void => {
    const remaining = atMs - Date.now();
    handle = setTimeout(step, Math.min(Math.max(remaining, 0), MAX_TIMEOUT_STEP_MS));
  };

  // Each wake-up checks the real clock: early (an intermediate step) re-arms,
  // due fires. Firing only when Date.now() >= atMs means a step that woke a
  // little early (timers are not exact) never fires before the moment.
  const step = (): void => {
    handle = null;
    if (cancelled) return;
    if (Date.now() >= atMs) {
      cancelled = true;
      fn();
    } else {
      arm();
    }
  };

  arm();
  return () => {
    cancelled = true;
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };
}
