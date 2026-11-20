// Tests for setTimeoutAt (#727): a far-off moment must not fire early (the
// 2^31 - 1 ms setTimeout overflow) and must fire at the moment itself.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_TIMEOUT_STEP_MS, setTimeoutAt } from './longTimeout';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2600, 0, 1, 12, 0, 0);

describe('setTimeoutAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('the bug: a plain setTimeout 30 days out fires at once', () => {
    // Guards the premise: the fake clock models the 32-bit overflow the way
    // browsers do, so this proves the test below would catch the old code.
    const fn = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setTimeout(fn, 30 * DAY);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a kick-off 30 days away does not fire early and fires at kick-off', () => {
    const fn = vi.fn();
    const kickoff = START + 30 * DAY;
    setTimeoutAt(kickoff, fn);

    vi.advanceTimersByTime(5_000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30 * DAY - 5_000 - 1);
    expect(Date.now()).toBe(kickoff - 1);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10 * DAY);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('never arms a single timer longer than one step', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    setTimeoutAt(START + 90 * DAY, () => {});
    vi.advanceTimersByTime(90 * DAY);
    const delays = spy.mock.calls.map((c) => Number(c[1]));
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_TIMEOUT_STEP_MS);
    expect(MAX_TIMEOUT_STEP_MS).toBeLessThan(2 ** 31 - 1);
    spy.mockRestore();
  });

  it('a moment already past fires on the next tick, not synchronously', () => {
    const fn = vi.fn();
    setTimeoutAt(START - 1000, fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel stops it, before or between steps', () => {
    const fn = vi.fn();
    const cancel = setTimeoutAt(START + 3 * DAY, fn);
    vi.advanceTimersByTime(DAY + 10);
    cancel();
    cancel();
    vi.advanceTimersByTime(5 * DAY);
    expect(fn).not.toHaveBeenCalled();
  });
});
