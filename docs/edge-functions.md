# Edge Functions (7)

> Moved out of `CLAUDE.md`. Schedules verified against the LIVE database (`select jobname, schedule,
> active from cron.job`) on 2026-11-24. Cron schedules live in migrations and the scheduler governor
> switches jobs on and off at run time, so re-verify against `cron.job` (not this file) before relying on it.

| Function | Purpose | Cron | Model | Writes match data? |
|---|---|---|---|---|
| `match-worker` | Claim due matches, run the spatial sim, persist events, stats, lineups and the replay, generate odds, seed cups | `trigger-match-worker`, every 2 minutes (`*/2 * * * *`, migration 0093). Switched on and off by `scheduler-governor` (0100): on while a match is live or an unparked kickoff is within 73 h, off otherwise, so "inactive" between seasons is normal | none by default; the in-match Architect calls `claude-sonnet-4-6` only when `ISL_NARRATIVE_MODE=llm` and `ANTHROPIC_API_KEY` are set, otherwise deterministic templates | **yes** (service-role) |
| `shadow-match-worker` | Cheap Poisson alternate-timeline outcomes per upcoming match | not scheduled (no `cron.schedule` references it); deploy-on-change workflow only | none | yes (`shadow_match_results`) |
| `match-notify-worker` | Web-push "match starting" notifications; idempotent | `trigger-match-notify-worker`, every minute (0039/0043/0044), switched on by the governor only from 20 minutes before a kickoff to 5 minutes after | none | no |
| `architect-galaxy-tick` | Out-of-match Architect heartbeat, Galaxy Dispatch narratives | `trigger-architect-galaxy-tick`, every 2 h (`0 */2 * * *`, 0052) | none by default (local corpus); model only in `ISL_NARRATIVE_MODE=llm` | no |
| `drama-tick` | Drains the matured drama-consequence queue; new drama only in llm mode | `trigger-drama-tick`, daily 07:00 UTC (`0 7 * * *`, 0052) | none by default; hardcoded `claude-sonnet-4-6` in llm mode | no |
| `corpus-enricher` | Grow entity voice library (`entity_snippets`) | **unscheduled** by 0093 (its only work is a model call). To bring it back, opt in to llm mode and re-run its block of 0052 | `CLAUDE_MODEL` from `src/constants.ts`, llm mode only | no |
| `account-delete` | GDPR Article 17 erasure (user-JWT phase 1, service-role phase 2) | HTTP POST (on demand). Separately, `purge-account-deletions` runs daily 03:15 UTC (0060) to delete erasure audit rows older than 30 days | none | no |

Database-only cron jobs (no edge function):

| Job | Schedule | What |
|---|---|---|
| `scheduler-governor` | every 5 minutes (0100) | turns `trigger-match-worker` and `trigger-match-notify-worker` on or off from the fixture list (`scheduler_job_wanted`) |
| `trim-cron-and-net-history` | daily 03:17 UTC (0094) | trims `cron.job_run_details` and pg_net history so bookkeeping does not grow the database |
| `purge-account-deletions` | daily 03:15 UTC (0060) | see `account-delete` above. Found missing from production on 2026-11-24 (0060 had never been applied) and applied then |

The edge functions are deployed by their own workflows (`deploy-match-worker.yml`, `deploy-narrative-functions.yml`, `deploy-shadow-match-worker.yml`), not by the site deploy. The cron-invoked workers are gated by a shared secret bridging pg_cron and the function (migration `0052`); `match-notify-worker` uses its own secret and `--no-verify-jwt`.
