// Export unlabelled responses plus labelling briefs for blind AI or human annotators.
// Usage: pnpm gold:export <dir> <count>
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { CRITERIA, petitions, STANCES } from "@/db/schema";
import { type GoldLabel, sampleForGold } from "@/lib/gold";
import { buildRequest, RUBRIC, STANCE_OPTIONS } from "@/lib/judge";

const [dir, countArg] = process.argv.slice(2);
const count = Number(countArg);
if (!dir || !Number.isInteger(count) || count < 1) {
  throw new Error("usage: pnpm gold:export <dir> <count>");
}

const gold: GoldLabel[] = JSON.parse(await readFile("eval/gold.json", "utf8"));
const labelled = new Set(gold.map((g) => g.petitionId));
const rows = (
  await db.select().from(petitions).where(isNotNull(petitions.responseDetails))
).filter((r) => !labelled.has(r.id));
const sample = sampleForGold(rows, count).map((p) => ({
  petitionId: p.id,
  inputHash: buildRequest(p).inputHash,
  petition: {
    action: p.action,
    background: p.background,
    additional_details: p.additionalDetails,
  },
  government_response: {
    summary: p.responseSummary,
    details: p.responseDetails,
  },
}));

const rubric = [
  "Score each criterion 0, 1 or 2 (integers only):",
  ...CRITERIA.map((c, i) => {
    const q = RUBRIC[c];
    const levels = q.criteria.map((level, n) => `   ${n}: ${level}`).join("\n");
    return `${i + 1}. ${c}: ${q.instructions}\n${levels}`;
  }),
  "",
  "Stance, pick exactly one:",
  ...STANCES.map((s) => `- ${s}: ${STANCE_OPTIONS[s]}`),
].join("\n");

const neutrality = `Neutrality rules:
- Score how the response engages, never whether you agree with the government or the petition.
- Ignore which party was in government, the topic's political lean and the petition's popularity.
- Apply the level descriptions literally. When torn, pick the level whose description fits better; do not default to the middle.
- Judge each item on its own.`;

const brief = (
  who: "a" | "b",
) => `# Labelling brief (labeller ${who.toUpperCase()})

You are an independent, politically neutral annotator. Your labels become a check set for an automated scorer, so accuracy matters more than speed.

Read only \`sample.json\` in this directory (use offset/limit if it is long) and this brief. Do not read any other file here or elsewhere, and do not look anything up online.${who === "b" ? "\n\nWork through the items in reverse order (last first), to avoid order effects." : ""}

${rubric}

${neutrality}

Write \`labeller-${who}.json\` in this directory: a JSON array with one object per item, in input order:
{"petitionId": n, "scores": {${CRITERIA.map((c) => `"${c}": n`).join(", ")}}, "stance": "<stance>", "note": "<one short sentence citing the deciding feature>"}

Validate before finishing: every petitionId once, every score an integer 0 to 2, a valid stance, valid JSON.
`;

const adjudicatorBrief = `# Adjudication brief

You are a politically neutral adjudicator. Two independent annotators labelled each response; settle only the cells where they disagree.

Read only \`sample.json\` (just the disputed items), \`disagreements.json\` and this brief. Do not read any other file or look anything up online.

For each disputed field, re-read the response and choose the value whose description fits best. You may only choose one of the two values the annotators gave.

${rubric}

${neutrality}

Write \`adjudicated.json\`: a JSON array with one object per disputed petition:
{"petitionId": n, "resolved": {"<field>": <value>, ...}, "reason": "<one short sentence>"}
Include every disputed field exactly once, and validate the JSON.
`;

await mkdir(dir, { recursive: true });
await writeFile(`${dir}/sample.json`, JSON.stringify(sample, null, 2));
await writeFile(`${dir}/brief-a.md`, brief("a"));
await writeFile(`${dir}/brief-b.md`, brief("b"));
await writeFile(`${dir}/adjudicator-brief.md`, adjudicatorBrief);
console.log(`Wrote ${sample.length} unlabelled responses and briefs to ${dir}`);
process.exit(0);
