// Sentry options: environment, sample rates and replay policy per build.

import { describe, expect, it } from 'vitest';

import { PRODUCTION_TRACES_SAMPLE_RATE, sentryOptionsFor } from './sentry';

const DSN = 'https://public@example.ingest.sentry.io/1';

describe('sentryOptionsFor', () => {
  it('stays off without a DSN', () => {
    expect(sentryOptionsFor({})).toBeNull();
    expect(sentryOptionsFor({ dsn: '  ' })).toBeNull();
  });

  it('samples 10% of traces in production and every trace in development', () => {
    expect(sentryOptionsFor({ dsn: DSN, mode: 'production', vercelEnv: 'production' })?.tracesSampleRate).toBe(
      PRODUCTION_TRACES_SAMPLE_RATE,
    );
    expect(sentryOptionsFor({ dsn: DSN, mode: 'production', vercelEnv: 'preview' })?.tracesSampleRate).toBe(
      PRODUCTION_TRACES_SAMPLE_RATE,
    );
    expect(sentryOptionsFor({ dsn: DSN, mode: 'development' })?.tracesSampleRate).toBe(1);
  });

  it('names the environment: explicit, then Vercel, then the Vite mode', () => {
    expect(sentryOptionsFor({ dsn: DSN, environment: 'pr-preview', vercelEnv: 'production' })?.environment).toBe('pr-preview');
    expect(sentryOptionsFor({ dsn: DSN, vercelEnv: 'preview', mode: 'production' })?.environment).toBe('preview');
    expect(sentryOptionsFor({ dsn: DSN, mode: 'production' })?.environment).toBe('production');
    expect(sentryOptionsFor({ dsn: DSN, mode: 'development' })?.environment).toBe('development');
  });

  it('honours a valid explicit trace rate and ignores an invalid one', () => {
    expect(sentryOptionsFor({ dsn: DSN, mode: 'production', tracesSampleRate: '0.25' })?.tracesSampleRate).toBe(0.25);
    expect(sentryOptionsFor({ dsn: DSN, mode: 'production', tracesSampleRate: 'lots' })?.tracesSampleRate).toBe(
      PRODUCTION_TRACES_SAMPLE_RATE,
    );
    expect(sentryOptionsFor({ dsn: DSN, mode: 'production', tracesSampleRate: '3' })?.tracesSampleRate).toBe(
      PRODUCTION_TRACES_SAMPLE_RATE,
    );
  });

  it('replays only sessions that hit an error', () => {
    const o = sentryOptionsFor({ dsn: DSN, mode: 'production' });
    expect(o?.replaysSessionSampleRate).toBe(0);
    expect(o?.replaysOnErrorSampleRate).toBe(1);
  });

  it('carries the release when the build knows its commit', () => {
    expect(sentryOptionsFor({ dsn: DSN, release: 'abc123' })?.release).toBe('abc123');
    expect(sentryOptionsFor({ dsn: DSN })).not.toHaveProperty('release');
  });
});
