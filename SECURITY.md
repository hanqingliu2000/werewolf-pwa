# Security Policy

English | [简体中文](SECURITY.zh-CN.md)

Applies to prod1.0 and current main. This is an assistant for small in-person friend groups, not a professionally penetration-tested or attack-proof service.

## Reporting Issues

Do not publish cookies, database passwords, protection-bypass tokens, real identities, or full room snapshots in public issues, screenshots, or logs. Use an existing private contact with the maintainer and provide a sanitized reproduction, version, and impact. Use GitHub private vulnerability reporting if enabled. Never attack other people's real rooms.

## Existing Boundaries

- Browsers do not connect directly to the private database. Environment-specific application accounts use private schemas, RLS, and least privilege.
- SQL values are bound parameters; schema names come from a fixed allowlist. HTTP checks fields, roles, sessions, phases, and origins.
- Writes require same-origin JSON with a 16 KiB body limit, pre-database request filtering, and atomic database rate counts. This is not distributed DDoS protection.
- HTTPS cookies use Secure, HttpOnly, and SameSite=Strict. Private responses use no-store and Vary: Cookie.
- Room state and request receipts commit in one transaction, with stale-context and duplicate-request checks.
- Private scalar usage summaries are separate from details and retained for 365 days. They contain no player nicknames, roles, targets, sessions, or full snapshots. RLS and environment-specific accounts prohibit direct browser access.
- Logs record only error category, duration, and deployment version, never targets, identities, cookies, passwords, or snapshots.

## Preventing Accidental Disclosure

Private configuration, model caches, databases, backups, authentication files, and raw QA reports must not be committed. Git and deployment exclusions cover common sensitive paths. Only nonsensitive defaults belong in environment examples. Never put database configuration in `NEXT_PUBLIC_`.

Run at the repository root:

```sh
npm --prefix web run repo:check
gitleaks git . --log-opts=--all --redact=100 --no-banner
gitleaks git . --staged --redact=100 --no-banner
npm --prefix web audit
```

Repository checks validate links, current assets, client runtime dependencies, and forbidden paths; they do not replace Gitleaks. Keep scanners and raw reports in ignored, restricted local directories. Do not publish private configuration through a broad scan report. Releases include sanitized findings, not databases, logs, backups, or raw reports.

Tool: [Gitleaks](https://github.com/gitleaks/gitleaks). Historical release findings: [security report](docs/security-prod1.0.md). A clean scan does not prove no secrets or vulnerabilities; manual inspection and permission tests remain necessary.

## Responding to a Leak

Revoke or rotate the affected credential first, then verify dependent services. Deleting a current file does not remove Git history. Coordinate history rewrites, force pushes, or rotations affecting live configuration explicitly. Never paste leaked values into public fixes.

Safeguards do not add registration, CAPTCHAs, or disruptive verification. Free quotas and browser background restrictions remain known limits. The maintainer's five-day lightweight read/write check does not guarantee prevention of pausing and never upgrades or purchases resources automatically.
