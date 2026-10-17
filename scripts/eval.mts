// Run Jev over eval/gold.json and write eval/results.json for /methodology. Costs money.
import { readFile, writeFile } from "node:fs/promises";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { petitions } from "@/db/schema";
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

const gold: GoldLabel[] = JSON.parse(await readFile("eval/gold.json", "utf8"));
if (gold.length === 0)
  throw new Error("eval/gold.json is empty; run pnpm gold:label first");

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
const client = createJevClient();

let model: string | null = null;
const items: EvalItem[] = [];
for (const label of gold) {
  const p = byId.get(label.petitionId);
  if (!p)
    throw new Error(`petition ${label.petitionId} is not in the database`);
  if (buildRequest(p).inputHash !== label.inputHash) {
    console.warn(`#${p.id}: response changed since it was labelled`);
  }
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
    model: { scores: row.scores, stance: row.stance, verdict: row.verdict },
  });
}

const results: EvalResults = {
  model,
  promptVersion: PROMPT_VERSION,
  ranAt: new Date().toISOString(),
  n: items.length,
  agreement: summarise(items),
  items,
};
await writeFile("eval/results.json", `${JSON.stringify(results, null, 2)}\n`);
console.table(results.agreement);
process.exit(0);
