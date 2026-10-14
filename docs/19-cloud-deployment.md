# Cloud Deployment and Operations

English | [简体中文](19-cloud-deployment.zh-CN.md)

Baseline: prod1.0, October 13, 2026, with subsequent usage-summary maintenance. See [release notes](../releases/prod1.0.md) for the historical deployment record.

## Topology

Vercel uses `web/` as the application root, Node.js 24, the Next.js Node runtime, and function region `iad1`. Supabase is in `us-east-1`, providing PostgreSQL persistence only. Do not introduce Supabase Auth, Realtime, or SQL game rules.

`werewolf_preview` and `werewolf_prod` are private schemas. Each contains rooms, receipts, and limits, plus the two usage-summary tables described below. Separate least-privileged service accounts and RLS prevent anonymous and ordinary authenticated users from direct reads. Migrations live in `supabase/migrations/` and contain no passwords.

## Server Environment

| Variable | Local | Cloud |
| --- | --- | --- |
| WEREWOLF_STORAGE | Unset or sqlite | Must be postgres |
| WEREWOLF_DB_PATH | Default .data/rooms.sqlite | Unused |
| WEREWOLF_SCHEMA | Unused | werewolf_preview for Preview, werewolf_prod for Production |
| WEREWOLF_DATABASE_URL | Only for local PostgreSQL debugging | Transaction pooler URL for the corresponding application account |
| WEREWOLF_DATABASE_CA | As above | Official root certificate PEM for server TLS verification |
| WEREWOLF_ORIGIN | Usually unnecessary on localhost | Exact production Origin, without a trailing slash |
| WEREWOLF_MAINTENANCE | Optional 1 | 1 closes entry/API; health returns 503 maintenance |
| WEREWOLF_ENROLLMENT_CLOSED | Optional 1 | 1 closes only new-room creation, leaving existing rooms available |

Database URLs must use the Supabase pooler on port 6543, the application account matching the schema, and no query parameters. URL-encode passwords; do not use an administrator account. Each instance has at most one pooled connection and no named prepared statements. A transaction uses the same borrowed connection throughout. Missing certificates/configuration fail explicitly: never disable TLS verification or fall back to SQLite.

Keep secrets only in restricted platform environment settings, never `NEXT_PUBLIC_` variables. Local example files contain only nonsensitive defaults.

## Deployment and Promotion

1. Install locked dependencies; run repository checks, check, build, local HTTP tests, and relevant browser acceptance.
2. Push verified work and wait for the candidate. Keep automatic production-domain assignment disabled.
3. Preview connects only to the preview schema. A Git main candidate in the Production environment connects to the production schema even before domain promotion; it is not a database sandbox.
4. Verify database health, independent sessions, recovery, permissions, audio, and page resources. Store protected-candidate authentication only in local private files with mode 0600; never publish bypass tokens.
5. After acceptance, manually promote the explicit deployment ID and recheck the public URL.
6. Clean up only exact room IDs from that QA report that also match Cloud QA names. Record versions and unverified scope.

A new project's first deployment is Production. Publish an entry-closed maintenance build first; do not assume the first deployment is a safe preview. Never create paid resources or upgrade plans without authorization. The separately authorized five-day database probe does not consume enrollment budget and cannot guarantee avoidance of free-project pauses.

## Retention and Recovery

Rooms expire 24 hours after actual business-state changes; ordinary polling and heartbeats do not renew them. Archived games expire 24 hours after ending. Access checks strictly enforce these limits.

Every five minutes, pg_cron removes expired rooms, cascading receipts, expired limits, and embedded archives. Archive pruning increments the CAS version to avoid overwriting concurrent changes. Do not rerun applied migrations. The room-creation budget reused the existing table without a migration; the separate summary feature has its own migrations.

Free backends can still pause when idle. Before a gathering, confirm project availability in the console and check `/api/health`, which returns 503 when unavailable rather than false health. The five-day read/write probe touches only a short-lived maintenance key and reports failures, not routine success. It depends on its scheduler runtime and tool authorization, not an always-on guarantee. A separate biweekly Chinese usage report reads private aggregates and available platform usage, explicitly marking missing data.

## Long-Term Usage Summaries

`room_usage` and `game_usage` are isolated from details and represent actual rooms and games, not rate-limit attempts. Room code serves as the name; custom room names do not currently exist. Room summaries contain creation time, current/peak player counts, capacity, and last business activity. Game summaries contain dealing time, ending time, player count, and active/completed/aborted/expired status. Store no player nicknames, roles, actions, or sessions, and add no browser statistics API.

Write only when the statistical projection changes, in the same transaction as room state and receipts. Ordinary polling/heartbeats do not update summaries; duplicate requests and rolled-back transactions do not create extra records. Rematches retain one room summary and create a new summary for each game ID.

Summaries live for 365 days; details still expire after 24 hours. Hourly `*_usage_retention` jobs are independent of the existing five-minute detail cleanup. Mark unfinished expired games as expired without fabricating ending times. Backfill only surviving details; leave unknown creation/starting times null and never reconstruct deleted history. Mark Cloud QA records as tests and exclude them from reports. Cleanup scripts remove only report-listed test rooms and their test summaries.

Summary tables also use RLS, environment-account isolation, bound parameters, and least privilege. Apply backward-compatible migrations before deploying writers. Previous application versions remain usable; roll back the app if needed without deleting summary tables. Each environment has five private tables.

On failure, return to maintenance or a compatible deployment. Do not delete the new database, restore the former site, or alter private backups. For an audio-version mismatch, refresh the original page and enable sound again.

## Safety and References

### Usage Protection (October 13, 2026)

New-room reservation budgets are global: 6 attempts/hour, 20/24 hours, and 100/30 days. SQLite and PostgreSQL atomically persist counters in the existing private `limits` table, shared across instances. Windows begin at the first attempt. Rejected counters saturate at the limit plus one rather than growing indefinitely. A retry of a successful request returns its receipt before spending budget again; failed or concurrent duplicate attempts can conservatively reserve capacity. This budget addition required no database migration.

Exhaustion returns 503 `ENROLLMENT_UNAVAILABLE` only for room creation. Joining, readiness, heartbeats, game commands, and recovery retain their existing limits. Do not delete production counters or stress-test production to verify caps. For abnormal growth, set `WEREWOLF_ENROLLMENT_CLOSED=1` and redeploy; use full maintenance only if existing games are threatened.

Console APIs confirmed Vercel Hobby and Supabase Free at the recorded review. No additional usage, upgrade, or trial was purchased. Free-plan overages may restrict or pause service; the application does not purchase extra capacity. Application budgets do not replace platform billing controls: polling, static assets, and invalid malicious requests can still consume quotas. Free hosting does not guarantee availability. Recheck spending caps, alerts, and suspension policies before any paid migration.

References: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase cost control](https://supabase.com/docs/guides/platform/cost-control).

See the [security policy](../SECURITY.md), [historical audit](security-prod1.0.md), and [API contract](13-room-service-contract.md).

Official documentation: [Postgres connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Cron](https://supabase.com/docs/guides/cron), and [deployment environments](https://vercel.com/docs/deployments/environments). Recheck current pricing and quotas before creating resources; do not reuse historical billing conclusions.
