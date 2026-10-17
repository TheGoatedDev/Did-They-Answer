# Did They Answer?

Scores how thoroughly the UK government engages with the petitions it responds to. Petition data comes from the [UK Parliament petitions API](https://petition.parliament.uk). Each government response is assessed against a published rubric by the [Jev](https://openrouter.ai/typesafe/jev-1.14) decision model.

See [`docs/PLAN.md`](docs/PLAN.md) for the design.

## Development

Requires Node 24, pnpm and Docker.

```sh
pnpm install
docker compose up -d db
cp .env.example .env.local   # or: pass-cli run --env-file .env.pass -- pnpm dev
pnpm dev
```

| Script | What it does |
| --- | --- |
| `pnpm lint` | Biome lint and format check |
| `pnpm typecheck` | Next route types and `tsc` |
| `pnpm test` | Vitest |
| `pnpm build` | Production build |

Git hooks: `pre-commit` runs Biome on staged files. `pre-push` runs the typecheck and the tests.

## Licence

Code: [MIT](LICENSE). Petition data: Open Parliament Licence v3.0.
