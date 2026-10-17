# Did They Answer?

Scores how thoroughly the UK government engages with the petitions it responds to. Petition data comes from the [UK Parliament petitions API](https://petition.parliament.uk). Each government response is assessed against a published rubric by the [Jev](https://openrouter.ai/typesafe/jev-1.14) decision model.

See [`docs/PLAN.md`](docs/PLAN.md) for the design.

## Development

Requires Node 24, pnpm and Docker.

```sh
pnpm install
docker compose up -d db
cp .env.example .env.local
pnpm dev
```

| Script | What it does |
| --- | --- |
| `pnpm lint` | Biome lint and format check |
| `pnpm typecheck` | Next route types and `tsc` |
| `pnpm test` | Vitest, with PGlite for database tests |
| `pnpm build` | Production build (standalone output) |
| `pnpm db:generate` | Generate a Drizzle migration after editing `src/db/schema.ts` |
| `pnpm sync:local` | Crawl the petitions API into the local database |
| `pnpm jev:check [id]` | One real Jev call on one petition; prints the result and writes nothing |
| `pnpm judge:local` | Judge every unassessed petition in the local database |
| `pnpm gold:label [count] [split]` | Hand-label new responses into `eval/gold.json` |
| `pnpm gold:export <dir> <count>` | Export unlabelled responses and labelling briefs |
| `pnpm gold:merge <dir> <split>` | Check two labellers' files and merge them into `eval/gold.json` |
| `pnpm eval` | Score the gold set with Jev and write `eval/results.json` (costs money) |

Migrations run automatically when the server starts.

Git hooks: `pre-commit` runs Biome on staged files. `pre-push` runs the typecheck and the tests.

## Connecting Jev

The judge calls `typesafe/jev-1.14` through OpenRouter and needs an OpenRouter API key in `OPENROUTER_API_KEY`.

1. Add the key to `.env.local`, which is gitignored.
2. Run `pnpm sync:local` if the local database is empty.
3. Run `pnpm jev:check` to make one call and check the result. It costs a fraction of a cent.
4. Run `pnpm judge:local` to judge every response, about 2,600 calls, roughly $0.20 in total.

## Eval loop

`eval/gold.json` holds labelled responses, each tagged `tune` or `holdout`. Use `tune` labels to guide prompt changes. Use `holdout` labels only to confirm a change, so the prompt isn't fitted to the labels it's judged on.

**Adding labels**

1. Run `pnpm gold:export /tmp/batch 35`. This writes `sample.json`, two labeller briefs and an adjudicator brief, all generated from the rubric in `src/lib/judge.ts`.
2. Have two annotators (people, or separate AI agents) each follow their brief without seeing each other's work. They write `labeller-a.json` and `labeller-b.json`.
3. Run `pnpm gold:merge /tmp/batch tune`. It reports how often the labellers agree. If they disagree anywhere, it writes `disagreements.json` and stops.
4. Have a third annotator follow `adjudicator-brief.md` and write `adjudicated.json`.
5. Run `pnpm gold:merge /tmp/batch tune` again to add the labels.

**Testing a prompt change**

1. Save the current results: `cp eval/results.json /tmp/before.json`.
2. Edit the rubric in `src/lib/judge.ts` and bump `PROMPT_VERSION`.
3. Run `pnpm eval --runs 3 --split tune --baseline /tmp/before.json`. Jev's answers vary by a few points between runs, so average several runs.
4. If the change still looks better, confirm it once with `--split holdout`.

If a change alters what a level means, rather than just clarifying it, relabel the affected field first.

## Deployment

The `Dockerfile` builds a standalone Next.js server. It needs `DATABASE_URL`, `OPENROUTER_API_KEY` and `CRON_SECRET` at runtime, and `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` at build time.

Three scheduled tasks keep the data fresh. Each POSTs to an internal route with the cron secret:

```sh
# Sync, daily at 05:00
node -e "fetch('http://localhost:3000/api/internal/sync',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"
# Judge, daily at 05:30: the same command with /api/internal/judge
# Debate stances, daily at 06:00: the same command with /api/internal/debate-stance
```

Each run stops after about 250 seconds and resumes where it left off on the next run.

## Licence

Code: [MIT](LICENSE). Petition data: Open Parliament Licence v3.0.
