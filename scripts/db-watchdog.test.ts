// The database watchdog's decision rules (scripts/db-watchdog.mjs).

import { describe, expect, it } from 'vitest';

import { COOLDOWN_MS, decide, lastRestartFrom, restartMark } from './db-watchdog.mjs';

const NOW = Date.parse('2026-11-28T10:30:00Z');

describe('db watchdog: decide', () => {
  it('does nothing when any probe succeeded', () => {
    expect(decide({ healthy: true, projectStatus: null, lastRestartMs: null, nowMs: NOW })).toBe('healthy');
  });

  it('restarts a frozen database that the control plane still calls healthy', () => {
    expect(decide({ healthy: false, projectStatus: 'ACTIVE_HEALTHY', lastRestartMs: null, nowMs: NOW })).toBe('restart');
  });

  it('never restarts when Supabase is already acting or the project is paused', () => {
    for (const status of ['RESTARTING', 'COMING_UP', 'INACTIVE', 'PAUSING', 'UNKNOWN']) {
      expect(decide({ healthy: false, projectStatus: status, lastRestartMs: null, nowMs: NOW })).toBe('not-healthy-status');
    }
  });

  it('never restarts when the control plane itself is unreachable', () => {
    expect(decide({ healthy: false, projectStatus: null, lastRestartMs: null, nowMs: NOW })).toBe('control-plane-down');
  });

  it('restarts at most once per cooldown window', () => {
    const recent = NOW - COOLDOWN_MS + 60_000;
    const old = NOW - COOLDOWN_MS - 60_000;
    expect(decide({ healthy: false, projectStatus: 'ACTIVE_HEALTHY', lastRestartMs: recent, nowMs: NOW })).toBe('cooldown');
    expect(decide({ healthy: false, projectStatus: 'ACTIVE_HEALTHY', lastRestartMs: old, nowMs: NOW })).toBe('restart');
  });
});

describe('db watchdog: lastRestartFrom', () => {
  it('reads the latest restart marker across the issue body and comments', () => {
    const texts = [
      `frozen ${restartMark('2026-11-28T09:00:00.000Z')}`,
      'a comment with no marker',
      `again ${restartMark('2026-11-28T10:10:00.000Z')}`,
    ];
    expect(lastRestartFrom(texts)).toBe(Date.parse('2026-11-28T10:10:00.000Z'));
  });

  it('is null without a marker, and ignores a malformed one', () => {
    expect(lastRestartFrom(['nothing here', ''])).toBeNull();
    expect(lastRestartFrom(['<!-- db-watchdog-restart: not-a-date -->'])).toBeNull();
  });
});
