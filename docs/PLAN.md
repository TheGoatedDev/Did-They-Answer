# Did They Answer? — implementation plan

Confirmed 2026-10-17.

## Product

A public, read-only site that scores how thoroughly the UK government engages with petitions it answers.

- Scope: petitions with a government response only, about 2,650 in total, from the current parliament plus archived parliaments 1–4. Every petition (about 69k) gets ingested later.
- Each response gets a stance: `accepts`, `partially_accepts`, `declines` or `deflects`. The headline view is engagement on `declines` and `deflects` responses.
- Verdict labels are `Low engagement`, `Some engagement` and `Thorough engagement`, shown with a 0–10 score. Low-confidence verdicts are shown with a marker, not hidden.
- Every verdict carries the disclaimer "Automated assessment".
- `/methodology` publishes the rubric, the model version, `PROMPT_VERSION`, the full gold set, the agreement score and every case where Jev disagreed with the hand labels.
- The footer and `/methodology` carry the Open Parliament Licence v3.0 attribution.
- Each detail page has a "Dispute this assessment" link. It opens a pre-filled GitHub issue from a template.
- Analytics: PostHog on EU Cloud, with no cookies (`persistence: 'memory'`) and pageviews only.
- Accessibility target: WCAG 2.2 AA.
- Domain: `petitions.thegoated.dev`.

## Stack

- Next.js with the App Router and TypeScript, using pnpm and Node 24 (pinned in `.nvmrc` and `engines`).
- shadcn/ui, in a civic, editorial style.
- Postgres 18 with Drizzle. Migrations run at server start in `instrumentation.ts` via `drizzle-orm`'s `migrate()`.
- Zod validates the petitions API responses.
- Vitest in a Node environment, with PGlite for database tests. No end-to-end tests.
- Biome for linting and formatting.
- Husky git hooks:
  - `pre-commit` runs `biome check --staged`.
  - `pre-push` runs `tsc --noEmit && vitest run`.
- Conventional Commits, without commitlint.
- GitHub Actions CI runs `biome ci`, `tsc`, `vitest run` and `next build`. It must pass before a PR merges into `main`.
- Repository: `TheGoatedDev/did-they-answer`, public, MIT licence.

## Petitions API facts

- Current parliament: `https://petition.parliament.uk/petitions.json?state=with_response&page=N`.
- Archived parliaments: `https://petition.parliament.uk/archived/petitions.json?parliament=N&state=with_response&page=N`.
  - Without a parameter, the archive returns parliament 4 only.
  - The record does not include a parliament field, so it comes from the crawl's query parameter.
- Pages hold 25 items. List entries already include the full `government_response` and `debate` objects, so no per-petition requests are needed.
- Pages with a response:

  | Set | Pages |
  |---|---|
  | Current | 17 |
  | `parliament=1` | 20 |
  | `parliament=2` | 9 |
  | `parliament=3` | 19 |
  | `parliament=4` | 41 |

  Total: 106 pages.
- Which years each parliament number covers is not settled. Earliest records seen: 1 → 2016, 2 → 2014, 3 → 2017–19, 4 → 2019–24. Check against each parliament's date range before writing the label constant.

## Data model

### `petitions`

| Column | Notes |
|---|---|
| `id` | Primary key; the API id |
| `source` | `current` or `archived` |
| `parliament` | `null` for current |
| `action`, `background`, `additional_details` | |
| `state`, `signature_count` | |
| `created_at`, `opened_at`, `closed_at` | |
| `departments`, `topics` | jsonb |
| `response_summary`, `response_details`, `responded_on` | |
| `debate` | jsonb |
| `raw` | jsonb |
| `api_updated_at`, `fetched_at` | |

### `assessments`

| Column | Notes |
|---|---|
| `id`, `petition_id` | |
| `model` | The dated version the API returns |
| `prompt_version`, `input_hash` | |
| `stance`, `stance_confidence` | |
| `addresses_ask`, `evidence`, `reasoning`, `outcome`, `specificity` | `real`, 0–2 |
| `total`, `verdict` | |
| `min_confidence`, `needs_review` | |
| `evidence_sentence` | |
| `cost` | |
| `raw` | jsonb |
| `created_at` | |

Unique on `(petition_id, model, prompt_version, input_hash)`.

### `crawl_cursors`

Primary key `(source, parliament, state)`. Columns: `next_page`, `done`, `updated_at`.

### `job_runs`

Columns: `job`, `started_at`, `finished_at`, `items`, `error`, `cost`. The site's "last synced" label reads from this table.

## Jobs

Jobs are Coolify scheduled tasks that `fetch` internal routes. This is the same pattern as Hetzner Cloud Radar.

All internal routes are `POST /api/internal/{sync,judge}` and require `Authorization: Bearer $CRON_SECRET`:

- The secret is compared with `timingSafeEqual`.
- If `CRON_SECRET` is not set, the route returns 500.
- If the token is wrong, the route returns 401.

### Sync (`0 5 * * *`)

- Covers the `with_response` set for the current parliament and for each archived parliament.
- Fetches about 1 page per second. The `User-Agent` header includes a contact address.
- Retries on 429 and 5xx responses.
- Stops after about 250 s and resumes from `crawl_cursors` on the next run.
- Current sets restart from page 1 every day. Archived sets are crawled once and then marked `done`.
- Upserts on `id`, then calls `revalidateTag('petitions')`.
- The later full ingest only needs extra sets added to the config. The cursors spread it across several runs.

### Judge (`30 5 * * *`)

- Picks petitions that have no assessment for the current `PROMPT_VERSION` and `input_hash`.
- Runs 8 requests at once and stops after about 250 s.
- Calls `revalidateTag('petitions')` when it finishes.

## Judge (`typesafe/jev-1.14`)

### Client and failures

- The client is `@typesafe-ai/sdk`, pinned to an exact version (0.7.0 at planning time), with `baseURL: 'https://openrouter.ai/api'` and `OPENROUTER_API_KEY`. It calls the OpenRouter Decisions API.
- Use the SDK's own types. Code still treats `confidence`, `probabilities` and `usage.cost` as optional.
- Use the SDK's retry if it has one. Otherwise add a backoff wrapper for 429, 5xx and 402 responses. Check the SDK docs at the start of PR 3.
- The SDK's `models.list()` does not work through OpenRouter, so do not call it.
- There is no fallback model. A failed run is recorded in `job_runs`, and existing verdicts stay as they are.

### Request

`state` is `{ petition, government_response }`. The questions:

- Five `score` questions with three levels each, equal weights:
  - `addresses_ask`: does the response engage with the specific request?
  - `evidence`: does it support its position with data or evidence?
  - `reasoning`: does it explain the policy reasoning and trade-offs?
  - `outcome`: does it commit to action or give a reasoned no?
  - `specificity`: is it written for this petition, not boilerplate?
- `stance`: a `choice` question.
- `evidence_sentence`: a `choice` over the response's sentences, split with `Intl.Segmenter('en-GB', { granularity: 'sentence' })`. At most 254 sentences, plus a `none` option.

### Scoring

- Verdict cut-offs on the 0–10 total:
  - below 4: `low`
  - 4 up to 7: `some`
  - 7 or more: `thorough`

  Tune these after running the gold set.
- Set `needs_review` when either of these holds:
  - any answer's `confidence` is below 0.6 or missing;
  - `state` is larger than 32KB, where Jev switches to a slower, less accurate long-context mode.
- Cost: about $0.20 for a full run, at $0.042 per 1M input tokens and $0 for output.

### Gold set

- `pnpm gold:label` presents 30 responses for labelling in the terminal and writes `eval/gold.json`.
  - The 30 are spread across parliaments, departments and stances.
  - Labels are the five criterion scores and the stance.
- `pnpm eval` reports agreement per criterion and exact verdict agreement.
- `pnpm eval` costs money, so it is not part of CI.

## Pages

Every page renders on the server and is cached by tag.

- `/`
  - A table with filters for verdict, stance, department, topic and parliament.
  - Filter and sort state lives in the URL search params.
  - Sorting by signatures, date or score, with pagination.
- `/petitions/[id]`
  - The petition, and the government response with the evidence sentence highlighted.
  - The five criteria with their level text.
  - The stance, the confidence and the low-confidence marker.
  - The debate block, a link to the source and the dispute link.
- `/methodology`: the rubric, the model, the gold set and its agreement score, the disclaimer and the licence.
- `/compare`
  - The share of each verdict by parliament and by department.
  - A filter for `declines`/`deflects` responses.
  - Every chart has an equivalent data table.

## Secrets and local development

- Environment variables:
  - `DATABASE_URL`
  - `OPENROUTER_API_KEY`
  - `CRON_SECRET`
  - `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`. These two are set as build-time variables in Coolify.
- `docker-compose.yml` runs Postgres 18 for local development.
- Run locally with `pass-cli run --env-file .env.pass -- pnpm dev`.
  - `.env.pass` holds only `pass://` references, so it is committed.
  - `.env.local` is gitignored.
  - `.env.example` lists every variable.

## Delivery

One PR per phase. Each PR merges once CI passes.

### PR 1: Scaffold

1. Rename the folder to `did-they-answer`, then run `git init`.
2. Run `create-next-app` with Biome, then `shadcn init`.
3. Add Vitest, Husky and the CI workflow.
4. Add `docker-compose.yml`, `.nvmrc`, the licence, the `.env.*` files and this plan.
5. Create the GitHub repo and turn on branch protection.

### PR 2: Ingest

- Build the schema and migrations, the API client with fixtures, the resumable crawler, `/api/internal/sync` and `job_runs`.
- Tests:
  - parsing the fixtures;
  - the crawler against a mocked `fetch`;
  - resuming from a cursor;
  - running the same upsert twice changes nothing.

### PR 3: Judge

- Build the Jev client, the rubric, the stance question, the sentence options, the verdict mapping, `/api/internal/judge`, `gold:label` and `eval`.
- Tests, with the SDK mocked:
  - building the request;
  - mapping the response;
  - the verdict and `needs_review` logic;
  - a changed `input_hash` triggering a re-judge.
- After this PR, the owner labels the 30 gold responses and the verdict cut-offs get tuned.

### PR 4: UI

1. Use `a11y-planner` before writing components, and the `dataviz` skill for `/compare`.
2. Build the four pages, the footer, PostHog and the issue template.
3. Do a design pass with `impeccable`.
4. Run `wcag-audit` and axe before launch.

### PR 5: Deploy

- Coolify project "Did They Answer?":
  - Postgres 18.
  - The app, built from a standalone Dockerfile through the "Public GitHub" GitHub App.
  - The environment variables and both scheduled tasks.
  - The domain `petitions.thegoated.dev`.
- PostHog project in the NearLunar organisation on EU Cloud:
  - authorised URLs: the production domain and `localhost:3000`;
  - IP anonymisation on;
  - replay and heatmaps off.
- Run the first sync and judge by hand.

## Ask the owner before

- Creating the public GitHub repo.
- Turning on branch protection.
- Creating the Coolify resources.
- Setting up DNS and the domain.
- Creating the PostHog project.
- The first production run.
