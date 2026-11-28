// ── db-watchdog.mjs ───────────────────────────────────────────────────────────
// Restart the Supabase database when it is FROZEN, and tell the owner.
//
// WHY: the free Nano instance has hung twice (2026-11-11, 2026-11-28): the
// control plane kept reporting ACTIVE_HEALTHY while every query timed out and
// Postgres stopped logging altogether. Waiting does not fix a hung instance;
// a restart does (about two minutes). Until now that needed the owner at the
// dashboard. This runs every 10 minutes from .github/workflows/db-watchdog.yml.
//
// WHAT IT DOES, each run:
//   1. Probe: `select 1` through the Management API, up to PROBE_ATTEMPTS
//      times PROBE_GAP_MS apart. Any success ends the run: healthy.
//   2. If every probe failed, read the project's status from the control
//      plane. Restart only when it still says ACTIVE_HEALTHY (a frozen
//      database behind a "healthy" badge). Any other status (restarting,
//      coming up, paused) or an unreachable control plane: do not restart,
//      just raise the alert.
//   3. Never restart twice within COOLDOWN_MS: an open `db-watchdog` issue
//      records the last restart; a second failure inside the window only
//      comments that a human is needed.
//   4. After a restart, wait for the database to answer again, then comment
//      and close the issue (or leave it open saying it did not recover).
//
// The owner hears about every restart: opening the issue emails him.
//
// Plain Node 22 (global fetch), no dependencies, so the job needs no npm ci.
// The decision rules are pure functions exported for scripts/db-watchdog.test.ts.

export const PROBE_ATTEMPTS = 3;
export const PROBE_GAP_MS = 60_000;
export const PROBE_TIMEOUT_MS = 25_000;
export const COOLDOWN_MS = 45 * 60_000;
export const RECOVERY_WAIT_MS = 8 * 60_000;
export const ISSUE_LABEL = 'db-watchdog';
/** Hidden marker in the issue body and comments: the time of the last restart. */
const RESTART_MARK = /<!-- db-watchdog-restart: (\S+) -->/g;

/**
 * Decide what to do after the probes.
 *
 * @param {object} s
 * @param {boolean} s.healthy          any probe succeeded
 * @param {string|null} s.projectStatus control-plane status, null if unreachable
 * @param {number|null} s.lastRestartMs time of the last watchdog restart, if any
 * @param {number} s.nowMs
 * @returns {'healthy'|'restart'|'cooldown'|'not-healthy-status'|'control-plane-down'}
 */
export function decide({ healthy, projectStatus, lastRestartMs, nowMs }) {
  if (healthy) return 'healthy';
  if (projectStatus === null) return 'control-plane-down';
  if (projectStatus !== 'ACTIVE_HEALTHY') return 'not-healthy-status';
  if (lastRestartMs !== null && nowMs - lastRestartMs < COOLDOWN_MS) return 'cooldown';
  return 'restart';
}

/**
 * The latest restart time recorded in an issue's body and comments.
 *
 * @param {string[]} texts issue body then comment bodies
 * @returns {number|null}
 */
export function lastRestartFrom(texts) {
  let latest = null;
  for (const t of texts) {
    for (const m of (t ?? '').matchAll(RESTART_MARK)) {
      const ms = Date.parse(m[1]);
      if (!Number.isNaN(ms) && (latest === null || ms > latest)) latest = ms;
    }
  }
  return latest;
}

/** Marker text recording a restart at `iso`. */
export function restartMark(iso) {
  return `<!-- db-watchdog-restart: ${iso} -->`;
}

// ── I/O (only runs as a script) ──────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const REF = process.env.SUPABASE_PROJECT_REF || 'ddtpbipkqamuxnvupddc';
  const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
  const GH_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPOSITORY;
  const DRY_RUN = process.env.DRY_RUN === 'true';
  const SIMULATE_HANG = process.env.SIMULATE_HANG === 'true';
  if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  const mgmt = `https://api.supabase.com/v1/projects/${REF}`;
  const auth = { Authorization: `Bearer ${TOKEN}` };

  /** One `select 1`; resolves to null on success or an error string. */
  async function probe() {
    if (SIMULATE_HANG) return 'simulated hang (dry-run test)';
    try {
      const res = await fetch(`${mgmt}/database/query`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'select 1 as ok' }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const body = await res.text();
      if (res.ok && body.includes('"ok"')) return null;
      return `HTTP ${res.status}: ${body.slice(0, 200)}`;
    } catch (err) {
      return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
  }

  async function probeUntilHealthy(attempts, gapMs) {
    const errors = [];
    for (let i = 0; i < attempts; i++) {
      const err = await probe();
      if (err === null) return { healthy: true, errors };
      errors.push(`${new Date().toISOString()} ${err}`);
      if (i < attempts - 1) await sleep(gapMs);
    }
    return { healthy: false, errors };
  }

  async function gh(path, init = {}) {
    if (!GH_TOKEN || !REPO) throw new Error('GITHUB_TOKEN / GITHUB_REPOSITORY not set');
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub ${init.method || 'GET'} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  }

  if (process.env.TEST_ALERT === 'true') {
    // Prove the alert path (issue opens, owner is emailed, issue closes)
    // without probing or restarting anything.
    const t = await gh('/issues', { method: 'POST', body: JSON.stringify({ title: 'Database watchdog: test alert (no action taken)', body: 'A manual test of the watchdog alert. Nothing was restarted. This issue closes itself.', labels: [ISSUE_LABEL] }) });
    await gh(`/issues/${t.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
    console.log(`[db-watchdog] test alert: opened and closed issue #${t.number}`);
    return;
  }

  const { healthy, errors } = await probeUntilHealthy(PROBE_ATTEMPTS, PROBE_GAP_MS);
  if (healthy) {
    console.log(`[db-watchdog] healthy${errors.length ? ` after ${errors.length} failed probe(s)` : ''}`);
    return;
  }
  console.log(`[db-watchdog] ${errors.length} probes failed:\n  ${errors.join('\n  ')}`);

  let projectStatus = null;
  try {
    const res = await fetch(mgmt, { headers: auth, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (res.ok) projectStatus = (await res.json()).status ?? null;
  } catch {
    projectStatus = null;
  }

  // Open watchdog issue, if any: carries the last restart time.
  let issue = null;
  let lastRestartMs = null;
  if (!DRY_RUN) {
    const open = await gh(`/issues?state=open&labels=${ISSUE_LABEL}&per_page=5`);
    issue = open[0] ?? null;
    if (issue) {
      const comments = await gh(`/issues/${issue.number}/comments?per_page=100`);
      lastRestartMs = lastRestartFrom([issue.body, ...comments.map((c) => c.body)]);
    }
  }

  const nowIso = new Date().toISOString();
  const action = decide({ healthy, projectStatus, lastRestartMs, nowMs: Date.now() });
  console.log(`[db-watchdog] control plane status ${projectStatus ?? 'unreachable'}; action: ${action}`);
  const evidence = '```\n' + errors.join('\n') + '\n```';

  if (DRY_RUN) {
    console.log('[db-watchdog] dry run: no restart, no issue');
    return;
  }

  if (action !== 'restart') {
    const why = {
      cooldown: 'The database is still not answering after the watchdog restarted it less than 45 minutes ago. It will not restart again on its own: a human should look (Supabase dashboard, Settings, General, Restart project, or a support ticket if it keeps happening).',
      'not-healthy-status': `The database is not answering and Supabase reports the project as ${projectStatus}, so the watchdog is not restarting it (Supabase is already acting, or the project is paused).`,
      'control-plane-down': 'The database is not answering and the Supabase control plane did not answer either, so the watchdog cannot restart it. This is likely a Supabase-side incident: https://status.supabase.com',
    }[action];
    const text = `${why}\n\nFailed probes (${nowIso}):\n${evidence}`;
    if (issue) await gh(`/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: text }) });
    else await gh('/issues', { method: 'POST', body: JSON.stringify({ title: `Database watchdog: database not answering (${nowIso.slice(0, 16)}Z)`, body: text, labels: [ISSUE_LABEL] }) });
    process.exitCode = 1;
    return;
  }

  const restartRes = await fetch(`${mgmt}/restart`, { method: 'POST', headers: auth });
  const restarted = restartRes.ok;
  const restartNote = restarted
    ? `The watchdog restarted the database at ${nowIso}. ${restartMark(nowIso)}`
    : `The watchdog tried to restart the database at ${nowIso} but the Management API answered ${restartRes.status}: ${(await restartRes.text()).slice(0, 200)}. Restart it from the dashboard (Settings, General, Restart project).`;
  const text = `The database stopped answering (every probe timed out) while Supabase still reported it as healthy: the same freeze as 2026-11-11 and 2026-11-28.\n\n${restartNote}\n\nFailed probes:\n${evidence}`;
  if (issue) await gh(`/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: text }) });
  else issue = await gh('/issues', { method: 'POST', body: JSON.stringify({ title: `Database watchdog: database was frozen, restarted (${nowIso.slice(0, 16)}Z)`, body: text, labels: [ISSUE_LABEL] }) });
  console.log(`[db-watchdog] restart ${restarted ? 'requested' : 'FAILED'}; issue #${issue.number}`);
  if (!restarted) { process.exitCode = 1; return; }

  // Wait for it to come back: about two minutes is normal.
  await sleep(90_000);
  const back = await probeUntilHealthy(Math.ceil((RECOVERY_WAIT_MS - 90_000) / 30_000), 30_000);
  if (back.healthy) {
    await gh(`/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Recovered: the database answered again at ${new Date().toISOString()}. Closing. Check that the match worker is ticking (cron.job_run_details) if a matchday was running.` }) });
    await gh(`/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
    console.log('[db-watchdog] recovered, issue closed');
  } else {
    await gh(`/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Not recovered ${Math.round(RECOVERY_WAIT_MS / 60_000)} minutes after the restart. A human should look; the watchdog will not restart again for 45 minutes.` }) });
    console.log('[db-watchdog] NOT recovered after restart');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('db-watchdog.mjs')) {
  main().catch((err) => {
    console.error('[db-watchdog] fatal:', err);
    process.exitCode = 1;
  });
}
