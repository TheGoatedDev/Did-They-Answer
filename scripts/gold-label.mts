// Hand-label a stratified sample of responses into eval/gold.json. Resumable.
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { CRITERIA, petitions, STANCES } from "@/db/schema";
import { type GoldLabel, sampleForGold } from "@/lib/gold";
import { buildRequest, RUBRIC, STANCE_OPTIONS } from "@/lib/judge";

const FILE = "eval/gold.json";
const SIZE = 30;

const gold: GoldLabel[] = JSON.parse(await readFile(FILE, "utf8"));
const rows = await db
  .select()
  .from(petitions)
  .where(isNotNull(petitions.responseDetails));
const done = new Set(gold.map((g) => g.petitionId));
const todo = sampleForGold(rows, SIZE).filter((r) => !done.has(r.id));
const rl = createInterface({ input: stdin, output: stdout });

async function ask(question: string, max: number) {
  for (;;) {
    const answer = Number(
      (await rl.question(`${question} [0-${max}] `)).trim(),
    );
    if (Number.isInteger(answer) && answer >= 0 && answer <= max) return answer;
  }
}

for (const [i, p] of todo.entries()) {
  console.log(
    `\n${"=".repeat(72)}\n${gold.length + 1}/${SIZE}  #${p.id}  ${p.parliament}`,
  );
  console.log(
    `\nPETITION: ${p.action}\n${p.background}\n${p.additionalDetails ?? ""}`,
  );
  console.log(
    `\nRESPONSE SUMMARY: ${p.responseSummary}\n\n${p.responseDetails}\n`,
  );

  const scores = {} as GoldLabel["scores"];
  for (const c of CRITERIA) {
    const q = RUBRIC[c];
    console.log(`\n${q.instructions}`);
    console.log(q.criteria.map((level, n) => `  ${n}: ${level}`).join("\n"));
    scores[c] = await ask(c, q.criteria.length - 1);
  }
  console.log("\nStance:");
  console.log(
    STANCES.map((s, n) => `  ${n}: ${s} - ${STANCE_OPTIONS[s]}`).join("\n"),
  );
  const stance = STANCES[await ask("stance", STANCES.length - 1)];

  gold.push({
    petitionId: p.id,
    inputHash: buildRequest(p).inputHash,
    scores,
    stance,
  });
  await writeFile(FILE, `${JSON.stringify(gold, null, 2)}\n`);
  console.log(`Saved (${todo.length - i - 1} left).`);
}

rl.close();
process.exit(0);
