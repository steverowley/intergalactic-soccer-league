// ── Sentry wrapper ────────────────────────────────────────────────────────────
// WHY a thin wrapper instead of importing @sentry/react everywhere:
//   1. Environments without a DSN (unit tests, contributor forks) make every
//      call a no-op, so callers never need to guard `if (sentry) { ... }`.
//   2. The DSN is read from `import.meta.env.VITE_SENTRY_DSN`. Production
//      builds get it from `.env.production` (a Sentry DSN is public by
//      design: it only lets a browser SEND events, and every browser that
//      loads the site sees it anyway). Empty / unset = no-op.
//   3. Swapping provider later stays a one-file change.
//
// WHAT IS CAPTURED (owner's choice, sized for Sentry's free plan):
//   - errors: everything that reaches captureException or goes uncaught
//   - performance tracing: 10% of page loads and navigations in production,
//     every one in local development (so a developer can see a trace)
//   - Session Replay: only for sessions that hit an error (no replays of
//     error-free sessions); text and media are masked by default; loaded
//     from Sentry's CDN after start-up to keep it out of the bundle
//   - logs: Sentry.logger calls (on by default in SDK 10.71 and later)
//
// CONSUMERS (today):
//   - main.tsx              — initSentry() once at app boot; SentryRoutes
//   - ErrorBoundary.tsx     — captureException() in componentDidCatch
//   - RouteErrorBoundary.tsx — captureException() per route
//   - shared/events/bus.ts  — captureException() inside the per-listener catch
//
// EDGE FUNCTIONS: this file is browser-only. The Deno edge functions in
// `supabase/functions/**` would use `@sentry/deno` separately.

import { useEffect } from 'react';
import {
  Routes,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import * as Sentry from '@sentry/react';

/** Whether Sentry has been initialised this session. Guards captureException. */
let initialised = false;

/** The build-time values the Sentry options are derived from. */
export interface SentryEnv {
  /** Project DSN; empty or absent disables Sentry. */
  dsn?: string | undefined;
  /** Explicit environment name (VITE_SENTRY_ENVIRONMENT, set by the Pages workflow). */
  environment?: string | undefined;
  /** Vercel's environment for this build: production, preview or development. */
  vercelEnv?: string | undefined;
  /** Vite mode: 'production' for builds, 'development' for the dev server. */
  mode?: string | undefined;
  /** Release id: the git commit the build came from. */
  release?: string | undefined;
  /** Explicit trace sample rate override (0 to 1). */
  tracesSampleRate?: string | undefined;
}

/** The subset of Sentry.init options this module decides. */
export interface SentryOptions {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  replaysSessionSampleRate: number;
  replaysOnErrorSampleRate: number;
}

/** Header and query-param name fragments never sent to Sentry (who and where the visitor is). */
const PRIVATE_KEYS = ['forwarded', '-ip', 'remote-', 'via', '-user', 'authorization', 'apikey', 'token'];

/** Production trace sample rate: 10% keeps tracing inside the free plan's quota. */
export const PRODUCTION_TRACES_SAMPLE_RATE = 0.1;

/**
 * Decide the Sentry options for a build. Pure, so it is unit-tested.
 *
 * Environment: an explicit VITE_SENTRY_ENVIRONMENT wins, then Vercel's
 * environment, then the Vite mode. Traces: an explicit rate wins; otherwise
 * every trace in development and 10% everywhere else. Replays: never for
 * error-free sessions, always for a session that hits an error.
 *
 * @returns null when there is no DSN (Sentry stays off).
 */
export function sentryOptionsFor(env: SentryEnv): SentryOptions | null {
  const dsn = env.dsn?.trim();
  if (!dsn) return null;
  const environment = env.environment || env.vercelEnv || (env.mode === 'development' ? 'development' : 'production');
  const explicit = env.tracesSampleRate != null && env.tracesSampleRate !== '' ? Number(env.tracesSampleRate) : NaN;
  const tracesSampleRate = Number.isFinite(explicit) && explicit >= 0 && explicit <= 1
    ? explicit
    : environment === 'development' ? 1 : PRODUCTION_TRACES_SAMPLE_RATE;
  return {
    dsn,
    environment,
    ...(env.release ? { release: env.release } : {}),
    tracesSampleRate,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
  };
}

/**
 * Initialise Sentry from the build's environment. Idempotent: safe to call
 * more than once. Call once from main.tsx before React mounts so render
 * errors caught by the outermost ErrorBoundary have a configured client.
 */
export function initSentry(): void {
  if (initialised) return;
  const options = sentryOptionsFor({
    dsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined,
    vercelEnv: import.meta.env.VITE_SENTRY_VERCEL_ENV as string | undefined,
    mode: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    tracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined,
  });
  if (!options) return;

  Sentry.init({
    ...options,
    integrations: [
      // Names each page-load and navigation trace after its route pattern
      // (/matches/:matchId) instead of the raw URL.
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    // Never add trace headers to outgoing requests: the public read cache
    // (/api/db) is keyed and cached by URL on Vercel's CDN and the Supabase
    // gateway does not need them. Browser traces stay browser-side.
    tracePropagationTargets: [],
    // Privacy: SDK v11 collects every data category by default, including
    // request and response BODIES (a sign-in request carries the password)
    // and cookies. Keep the restrictive baseline the site had on v10:
    // no user info or IPs, no cookies, no bodies, identifying headers and
    // query params denied. Sentry's docs give this exact block as the v10
    // equivalent (migration guide, v10 to v11, Data Collection).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: PRIVATE_KEYS },
        response: { deny: PRIVATE_KEYS },
      },
      httpBodies: [],
      urlQueryParams: { deny: PRIVATE_KEYS },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      graphQL: { document: false, variables: false },
    },
  });

  initialised = true;

  // Session Replay (errors only) is about 43 KB gzipped, so it is not in the
  // bundle: it loads from Sentry's CDN after the page is up, then buffers
  // the session in memory and uploads only if an error happens. A blocked
  // or failed CDN load just means no replay; errors still report.
  void Sentry.lazyLoadIntegration('replayIntegration')
    .then((replayIntegration) => Sentry.addIntegration(replayIntegration()))
    .catch(() => undefined);
}

/**
 * The app's <Routes>, wrapped so Sentry can name traces after route
 * patterns. Renders exactly like <Routes> when Sentry is off.
 */
export const SentryRoutes = Sentry.wrapReactRouterRouting(Routes);

/**
 * Report a caught error to Sentry, with optional structured context.
 * No-op if Sentry was never initialised (no DSN configured).
 *
 * @param error    — the error caught by an ErrorBoundary, listener, or async catch
 * @param context  — optional `{ tags?, extra? }` to attach as Sentry tags/extras
 */
export function captureException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  if (!initialised) return;
  Sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context?.extra) {
      for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v);
    }
    Sentry.captureException(error);
  });
}
