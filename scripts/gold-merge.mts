// Compare two labellers, then merge their labels (with adjudications) into eval/gold.json.
// Usage: pnpm gold:merge <dir> <tune|holdout>
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
  type Adjudication,
  compareLabellers,
  type GoldLabel,
  type LabellerEntry,
  mergeLabels,
  type Split,
} from "@/lib/gold";

const [dir, split] = process.argv.slice(2) as [string, Split];
if (!dir || (split !== "tune" && split !== "holdout")) {
  throw new Error("usage: pnpm gold:merge <dir> <tune|holdout>");
}
const read = async <T,>(name: string): Promise<T> =>
  JSON.parse(await readFile(`${dir}/${name}`, "utf8"));

const sample =
  await read<{ petitionId: number; inputHash: string }[]>("sample.json");
const a = await read<LabellerEntry[]>("labeller-a.json");
const b = await read<LabellerEntry[]>("labeller-b.json");
const { agreement, disagreements } = compareLabellers(a, b);
console.log("Labeller agreement:");
console.table(
  Object.fromEntries(
    Object.entries(agreement).map(([k, v]) => [k, `${Math.round(v * 100)}%`]),
  ),
);

if (disagreements.length > 0 && !existsSync(`${dir}/adjudicated.json`)) {
  await writeFile(
    `${dir}/disagreements.json`,
    JSON.stringify(disagreements, null, 2),
  );
  console.log(
    `${disagreements.length} petitions disputed: wrote disagreements.json. Adjudicate with adjudicator-brief.md, then run this again.`,
  );
  process.exit(1);
}

const adjudicated = disagreements.length
  ? await read<Adjudication[]>("adjudicated.json")
  : [];
const added = mergeLabels(sample, a, b, adjudicated, split);
const gold: GoldLabel[] = JSON.parse(await readFile("eval/gold.json", "utf8"));
const existing = new Set(gold.map((g) => g.petitionId));
const clash = added.filter((g) => existing.has(g.petitionId));
if (clash.length)
  throw new Error(
    `already in gold.json: ${clash.map((g) => g.petitionId).join(", ")}`,
  );
await writeFile(
  "eval/gold.json",
  `${JSON.stringify([...gold, ...added], null, 2)}\n`,
);
console.log(
  `Added ${added.length} ${split} labels; gold.json now has ${gold.length + added.length}.`,
);
process.exit(0);
