# Werewolf PWA

Werewolf PWA is a mobile-friendly web host for offline Werewolf games. It replaces the manual moderator role for night phases, private actions, death resolution, and win-condition checks while leaving daytime discussion to the players.

The app is intended for small in-person groups: a host creates a room, players join from their phones, roles are assigned privately, and the system guides the table through each phase.

## What It Does

- Creates game rooms with player and role configuration.
- Lets players join by room code and nickname.
- Privately reveals each player's role.
- Guides the night sequence for guard, werewolves, seer, and witch.
- Collects private night actions through player sessions.
- Resolves guard, kill, save, poison, and hunter interactions.
- Lets the host record daytime eliminations or no-elimination outcomes.
- Computes win conditions for villagers and werewolves.
- Supports memory-mode development and Supabase-backed persistence.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Vitest
- Supabase client support
- PWA manifest and service worker shell

## Repository Structure

```text
web/                 Next.js application, API routes, UI, tests, and assets
db/migrations/       Supabase schema and transactional RPC migrations
scripts/             Smoke checks and asset utilities
assets/              Shared copywriting data
tts/                 Host narration materials and generation helpers
frontend-handoff/    UI redesign handoff notes
*.md                 Product, rules, API, security, testing, and deployment docs
```

## Local Development

Install dependencies from the repository root:

```bash
npm --prefix web install
```

Run the web app:

```bash
npm run dev:werewolf
```

Run checks:

```bash
npm run typecheck:werewolf
npm run test:werewolf
npm run smoke:werewolf
```

Build:

```bash
npm run build:werewolf
```

## Persistence Modes

When Supabase environment variables are absent, the app uses an in-memory store for local development. With Supabase configured, API routes use database-backed room lifecycle RPCs.

Environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Documentation

The root Markdown files describe the rules, API shape, data model, deployment, risks, and testing strategy. The most useful entry points are:

- `01-brief.md`
- `02-requirements.md`
- `03-rules-config.md`
- `04-state-machine.md`
- `06-api-contract.md`
- `08-security-privacy.md`
- `21-testing-plan.md`

## Privacy Notes

Player session tokens are private runtime values. Do not commit live room data, deployment URLs, or Supabase credentials. The repository includes only code, migrations, test fixtures, and public documentation.
