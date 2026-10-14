# prod1.0 Security Review

English | [简体中文](security-prod1.0.zh-CN.md)

Historical review date: October 13, 2026. Scope: the repository, reachable Git history, dependencies, deployment package, and application/database permissions at that release. This is not a professional penetration test, a current re-audit, or an absolute security guarantee. Later summary tables are documented in the [operations guide](19-cloud-deployment.md).

## Checks Performed

- Verified the official Gitleaks 8.30.1 ARM64 binary against its official SHA-256 checksum. Scanned 55 commits across reachable refs with no detected credentials. No exemptions or silent ignores were added to default rules.
- npm audit reported zero known vulnerabilities in locked production and development dependencies, reflecting advisories available at query time only.
- Existing GitHub secret scanning and push protection were enabled, with zero open secret-scanning alerts. No paid service was enabled for this review.
- Supabase security advisor reported no warnings. At that point, all six tables across the two private schemas had RLS; anon/authenticated had no SELECT. Both application accounts were nonsuperusers without database/role creation or BYPASSRLS.
- Manually checked session-room binding, role/phase permissions, participant-only recaps, Origin, the 16 KiB JSON limit, parameterized SQL, schema allowlisting, TLS, and transactional receipts.
- Public views project announced events rather than exposing internally resolved night deaths. Private responses disable caching. Service logs contain no targets, roles, cookies, passwords, or snapshots.

## Release Safeguards

Git ignores common databases, private keys, logs, and authentication files. A `.vercelignore` in the web application root prevents relying solely on repository-root exclusions. Nonsensitive `.env.example` files are allowed; real environment files are excluded.

Repository checks inspect candidate paths, documentation links, active audio fingerprints, and client runtime dependencies to prevent server code entering the browser. They supplement, not replace, credential scanning.

Materialized 297 candidate files into a private directory and scanned them with Gitleaks, finding no secrets. A roughly 860 KiB client static build also scanned clean. Exact matching of three existing application-password/preview-authentication values found no hits in 315 candidate/client files. Git remote URLs contained no embedded credentials.

Read-only cloud queries additionally confirmed that anon, authenticated, and service_role lacked USAGE on both schemas, while each application account could access only its environment. No production RLS, passwords, or schema structure changed.

A final scan of all 297 candidates found no secrets or tracked symlinks. All 144 V7 files were byte-identical to their pre-cleanup versions. No known credentials or private paths appeared in 247 server build files or nine tracing manifests. Audio-tool version-directory restrictions blocked path traversal, and Python syntax checks passed.

The staged cleanup for `f7fa4ed` scanned clean. After commit, Gitleaks rescanned 56 commits across all reachable refs without findings. The Git source tree contained 297 files and zero private configuration/database/cache paths, with no unreachable commits or object-integrity errors. The final tag added accepted documentation only; repository, staged/history, and tagged-source checks were repeated before release.

Raw scan, QA, authentication, and database files stayed in private ignored directories, not Release attachments. GitHub's generated source archive uses the tagged tree, without local private files. Historical archive tags remained reachable and were included in history scanning.

## Live Release Checks

Deployment `dpl_BdJEbpcAUmTnZ3Ny43KSuvoFLMyf` for application commit `f7fa4ed3f1ffadb07e10b36ea5a2d495c147715f` passed a three-session candidate API check and an eight-session partial browser check lasting 1.2 minutes, then was manually promoted. Automatic domain assignment remained disabled. This is the historical prod1.0 promotion, not a claim about today's deployment.

The public URL was rechecked for database health, independent sessions, creation/joining, persistence, rejection of nonhost/foreign sessions, wrong-Origin rejection, SQL-shaped path rejection, receipt deduplication, Secure/HttpOnly/SameSite cookies, no-store, and fingerprints for all 144 audio files. Environment files, Git configuration, and removed banks returned 404 on candidate and production URLs.

Only three explicitly named Cloud QA rooms were created and removed by exact report IDs; a read-only check found zero remaining. No real rooms were deleted, migrations rerun, online passwords changed, or user-verification steps added.

## Issues Encountered During Acceptance

The first default local browser entry included cloud cases, causing environment-specific assertions to fail. Cloud/production configurations were separated. Older cases expected manual system recovery, original-speed audio interception, no first-night election, or wolf confirmation after closing the preselection draft. They were aligned with existing behavior, without changing gameplay to satisfy old assertions.

One retry test incorrectly rejected valid retries before the client observed a new window. It was corrected to retain the original envelope, bound retries, and stop stale receipts for at least 3.5 seconds after observing the new window. Deduplication and stale-context checks remained intact.

WebKit emitted local same-origin room-read cancellation diagnostics during explicit document replacement, consistent with the [confirmed upstream issue](https://github.com/microsoft/playwright/issues/43120). Only diagnostics matching browser, navigation stage, same-origin host, and this test room's path were recorded separately. Errors during gameplay or at other addresses still failed; CORS and Origin protection were not relaxed. Artificial lifecycle tests used the existing keepalive fallback, not a claim of native Safari Beacon or real-phone background acceptance.

One run passed 301 assertions but then emitted an asynchronous PGlite protocol error; it was not counted as a pass. Thirteen isolated persistence contracts and a subsequent full 301-test rerun passed. The intermittent root cause was not claimed to be diagnosed.

Complete browser attempts included failures and interruptions and were not reported as fully passing batches. Affected cases were rerun in batches after correction. The final six WebKit cases, including four complete UI games, passed in 7.3 minutes; three final Chromium cases passed in 1.7 minutes. Earlier targeted automatic recovery, identity flow, text games, and a 12-player voice game also passed. Reports stayed in ignored storage.

## Risks and Boundaries

Rate limiting is not distributed DDoS protection, and hostile traffic can still consume free quotas. No login or CAPTCHA was added, preserving ordinary play. Pattern scanners can miss unusual secrets; dependency audits cannot prove the absence of undisclosed vulnerabilities.

Historical tags retain old code and assets. Removing current files does not erase history. No leaked credentials requiring rotation were found; online accounts were not blindly replaced, and history was neither force-pushed nor rewritten.

Real phones, browser/OS limits, large-scale load, and independent penetration testing were not validated by this review.
