// Score the gold set with Jev and compare against the labels. Costs money (~$0.0001 per item per run).
// Usage: pnpm eval [--runs N] [--split tune|holdout|all] [--baseline file] [--out file]
//   --runs      repeat to average out Jev's run-to-run noise (default 1)
//   --split     which labels to score (default all)
//   --baseline  an earlier results file to show the change against
//   --out       where to write results (default eval/results.json, which /methodology shows)
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { CRITERIA, petitions } from "@/db/schema";
import {
  type EvalItem,
  type EvalResults,
  type GoldLabel,
  labelVerdict,
  summarise,
} from "@/lib/gold";
import {
  buildRequest,
  createJevClient,
  judgeOne,
  PROMPT_VERSION,
} from "@/lib/judge";

const { values: opts } = parseArgs({
  options: {
    runs: { type: "string", default: "1" },
    split: { type: "string", default: "all" },
    baseline: { type: "string" },
    out: { type: "string", default: "eval/results.json" },
  },
});
const runs = Number(opts.runs);

const allGold: GoldLabel[] = JSON.parse(
  await readFile("eval/gold.json", "utf8"),
);
const gold = allGold.filter(
  (g) => opts.split === "all" || g.split === opts.split,
);
if (gold.length === 0)
  throw new Error(`no gold labels for split ${opts.split}`);
const splitOf = new Map(allGold.map((g) => [g.petitionId, g.split]));

const rows = await db
  .select()
  .from(petitions)
  .where(
    inArray(
      petitions.id,
      gold.map((g) => g.petitionId),
    ),
  );
const byId = new Map(rows.map((r) => [r.id, r]));
for (const label of gold) {
  const p = byId.get(label.petitionId);
  if (!p)
    throw new Error(`petition ${label.petitionId} is not in the database`);
  if (buildRequest(p).inputHash !== label.inputHash) {
    console.warn(`#${p.id}: response changed since it was labelled`);
  }
}

const client = createJevClient();
let model: string | null = null;
async function runOnce() {
  const queue = [...gold];
  const items: EvalItem[] = [];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let label = queue.shift(); label; label = queue.shift()) {
        // Checked above: every gold petition is in the database.
        const p = byId.get(label.petitionId) as (typeof rows)[number];
        const row = await judgeOne(client, p);
        model = row.model;
        items.push({
          petitionId: p.id,
          action: p.action,
          label: {
            scores: label.scores,
            stance: label.stance,
            verdict: labelVerdict(label.scores),
          },
          model: {
            scores: row.scores,
            stance: row.stance,
            verdict: row.verdict,
          },
        });
      }
    }),
  );
  const order = new Map(gold.map((g, i) => [g.petitionId, i]));
  return items.sort(
    (a, b) => (order.get(a.petitionId) ?? 0) - (order.get(b.petitionId) ?? 0),
  );
}

const allRuns: EvalItem[][] = [];
for (let r = 0; r < runs; r++) allRuns.push(await runOnce());

type Agreement = NonNullable<EvalResults["agreement"]>;
const mean = (list: Agreement[]) =>
  Object.fromEntries(
    Object.keys(list[0]).map((k) => [
      k,
      list.reduce((s, a) => s + a[k as keyof Agreement], 0) / list.length,
    ]),
  ) as Agreement;
const agreementFor = (itemsPerRun: EvalItem[][], split?: string) => {
  const per = itemsPerRun
    .map((items) =>
      summarise(
        items.filter((i) => !split || splitOf.get(i.petitionId) === split),
      ),
    )
    .filter((a): a is Agreement => a !== null);
  return per.length ? mean(per) : null;
};

const splits = ["tune", "holdout"].filter((s) =>
  gold.some((g) => g.split === s),
);
const baseline: EvalResults | null = opts.baseline
  ? JSON.parse(await readFile(opts.baseline, "utf8"))
  : null;
const pct = (v: number | undefined) =>
  v === undefined ? "" : `${Math.round(v * 100)}%`;
const table: Record<string, Record<string, string>> = {};
const overall = agreementFor(allRuns) as Agreement;
const baseOverall = baseline
  ? agreementFor([
      baseline.items.filter((i) =>
        gold.some((g) => g.petitionId === i.petitionId),
      ),
    ])
  : null;
for (const key of Object.keys(overall) as (keyof Agreement)[]) {
  table[key] = { all: pct(overall[key]) };
  for (const s of splits) table[key][s] = pct(agreementFor(allRuns, s)?.[key]);
  if (baseOverall) {
    const delta = Math.round((overall[key] - baseOverall[key]) * 100);
    table[key]["vs baseline"] = `${delta > 0 ? "+" : ""}${delta}`;
  }
}
console.log(
  `Prompt v${PROMPT_VERSION}, ${model}, ${gold.length} labels, ${runs} run(s)`,
);
console.table(table);

// Which way the misses lean, from the first run: "label->model": count.
const first = allRuns[0];
const lean: Record<string, Record<string, number>> = {};
for (const field of [...CRITERIA, "stance"] as const) {
  for (const i of first) {
    const l = field === "stance" ? i.label.stance : i.label.scores[field];
    const m =
      field === "stance" ? i.model.stance : Math.round(i.model.scores[field]);
    if (l !== m) {
      lean[field] ??= {};
      lean[field][`${l}->${m}`] = (lean[field][`${l}->${m}`] ?? 0) + 1;
    }
  }
}
console.log("Misses (label->model), first run:", lean);

const results: EvalResults = {
  model,
  promptVersion: PROMPT_VERSION,
  ranAt: new Date().toISOString(),
  n: gold.length,
  agreement: overall,
  items: first,
};
await writeFile(opts.out, `${JSON.stringify(results, null, 2)}\n`);
console.log(`Wrote ${opts.out}`);
process.exit(0);
