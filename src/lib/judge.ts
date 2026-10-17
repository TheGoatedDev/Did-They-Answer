import { createHash } from "node:crypto";
import {
  choice,
  type SystemOneResult,
  score,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import { eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import {
  assessments,
  CRITERIA,
  type Criterion,
  petitions,
  type Stance,
  type Verdict,
} from "@/db/schema";

export const MODEL = "typesafe/jev-1.14";
// Bump when any question, criterion or option text changes; old verdicts stay for comparison.
// v2: clarifies what counts as a commitment or a reasoned refusal (outcome 64% to 73% on 200 gold labels).
export const PROMPT_VERSION = 2;

const LOW_CONFIDENCE = 0.6;
// Jev is often unsure on one or two criteria (v1 run: 90% of responses), so only flag
// when the stance is unsure or most criteria are; this flagged ~41% of the v1 run.
const LOW_CRITERIA_TO_FLAG = 3;
// Jev switches to a slower, less accurate long-context mode past ~32KB of input.
const LONG_CONTEXT_BYTES = 32_000;
const MAX_SENTENCES = 254;

export const RUBRIC = {
  addresses_ask: score(
    "Does the government response engage with the specific request the petition makes?",
    [
      "Ignores or sidesteps the request",
      "Touches on the request indirectly",
      "Directly addresses the specific request",
    ],
  ),
  evidence: score(
    "Does the government response support its position with data or evidence?",
    [
      "No data or evidence",
      "Vague appeals to evidence, research or expert advice",
      "Specific figures, studies, reviews or sources",
    ],
  ),
  reasoning: score(
    "Does the government response explain the policy reasoning behind its position?",
    [
      "No rationale given",
      "Restates existing policy without explaining it",
      "Explains the rationale and the trade-offs involved",
    ],
  ),
  outcome: score(
    "Does the government response commit to action, or give a reasoned refusal? Describing existing policy or saying it will keep the matter under review is not a commitment, and a refusal only counts as reasoned if it explains why the request will not be met.",
    [
      "Neither commits to anything nor explains a refusal",
      "Vague commitment, or a refusal with little reason",
      "Concrete action, or a refusal with clear reasons",
    ],
  ),
  specificity: score(
    "Is the government response written for this petition rather than boilerplate?",
    [
      "Generic boilerplate that could answer many petitions",
      "Partly tailored to this petition",
      "Clearly written for this petition",
    ],
  ),
} satisfies Record<Criterion, ReturnType<typeof score>>;

export const STANCE_OPTIONS = {
  accepts: "The government agrees to do what the petition asks",
  partially_accepts: "The government agrees to part of what the petition asks",
  declines: "The government says no to what the petition asks",
  deflects:
    "The response neither agrees nor says no, e.g. it only describes existing policy",
} satisfies Record<Stance, string>;

export type JudgeInput = Pick<
  typeof petitions.$inferSelect,
  | "action"
  | "background"
  | "additionalDetails"
  | "signatureCount"
  | "responseSummary"
  | "responseDetails"
>;

export function splitSentences(text: string) {
  const segmenter = new Intl.Segmenter("en-GB", { granularity: "sentence" });
  return [...segmenter.segment(text)]
    .map((s) => s.segment.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_SENTENCES);
}

export function buildRequest(p: JudgeInput) {
  const sentences = splitSentences(p.responseDetails ?? "");
  const state = {
    petition: {
      action: p.action,
      background: p.background,
      additional_details: p.additionalDetails,
      signatures: p.signatureCount,
    },
    government_response: {
      summary: p.responseSummary,
      details: p.responseDetails,
    },
  };
  const questions = {
    ...RUBRIC,
    stance: choice(
      "What is the government's position on what the petition asks for?",
      STANCE_OPTIONS,
    ),
    evidence_sentence: choice(
      "Which sentence of the government response cites the strongest specific data or evidence?",
      Object.fromEntries([
        ...sentences.map((s, i) => [`s${i}`, s]),
        ["none", "No sentence cites specific data or evidence"],
      ]) as Record<string, string>,
    ),
  };
  const stateJson = JSON.stringify(state);
  return {
    state,
    questions,
    sentences,
    inputHash: createHash("sha256").update(stateJson).digest("hex"),
    longContext: Buffer.byteLength(stateJson) > LONG_CONTEXT_BYTES,
  };
}

type Request = ReturnType<typeof buildRequest>;
export type JudgeResult = SystemOneResult<Request["questions"]>;

export function verdictFor(total: number): Verdict {
  // shortcut: cut-offs are a first guess; tune them against eval/gold.json.
  if (total < 4) return "low";
  if (total < 7) return "some";
  return "thorough";
}

export function mapAnswers(request: Request, result: JudgeResult) {
  const { answers } = result;
  const scores = Object.fromEntries(
    CRITERIA.map((c) => [c, answers[c].score]),
  ) as Record<Criterion, number>;
  const total = CRITERIA.reduce((sum, c) => sum + scores[c], 0);
  // Missing confidence counts as zero. The evidence pick is left out: choosing one
  // sentence among dozens is naturally low-confidence and only drives a highlight.
  const minConfidence = Math.min(
    ...[...CRITERIA.map((c) => answers[c]), answers.stance].map(
      (a) => a.confidence ?? 0,
    ),
  );
  const lowCriteria = CRITERIA.filter(
    (c) => (answers[c].confidence ?? 0) < LOW_CONFIDENCE,
  ).length;
  const stanceConfidence = answers.stance.confidence ?? 0;
  const pick = answers.evidence_sentence;
  const evidenceSentence =
    pick.choice !== "none" && (pick.confidence ?? 0) >= LOW_CONFIDENCE
      ? (request.sentences[Number(pick.choice.slice(1))] ?? null)
      : null;

  return {
    model: result.model,
    promptVersion: PROMPT_VERSION,
    inputHash: request.inputHash,
    stance: answers.stance.choice as Stance,
    stanceConfidence,
    scores,
    total,
    verdict: verdictFor(total),
    minConfidence,
    needsReview:
      stanceConfidence < LOW_CONFIDENCE ||
      lowCriteria >= LOW_CRITERIA_TO_FLAG ||
      request.longContext,
    evidenceSentence,
    inputTokens: result.usage.input_tokens,
    raw: result,
  };
}

export type JevClient = Pick<TypeSafeClient, "systemOne">;

export function createJevClient(): JevClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const serverErrors = Array.from({ length: 100 }, (_, i) => 500 + i);
  return new TypeSafeClient({
    apiKey,
    baseURL: "https://openrouter.ai/api",
    defaultModel: MODEL,
    compression: false,
    timeout: 30_000,
    // SDK defaults plus 402, which OpenRouter returns when the in-flight budget is exhausted.
    retry: { httpStatuses: new Set([402, 408, 429, ...serverErrors]) },
  });
}

export async function judgeOne(client: JevClient, p: JudgeInput) {
  const request = buildRequest(p);
  const result = await client.systemOne({
    state: request.state,
    questions: request.questions,
  });
  return mapAnswers(request, result);
}

export async function runJudge(
  db: Db,
  client: JevClient,
  { deadline, concurrency = 8 }: { deadline: number; concurrency?: number },
) {
  const responded = await db
    .select()
    .from(petitions)
    .where(isNotNull(petitions.responseDetails));
  const judged = new Set(
    (
      await db
        .select({ id: assessments.petitionId, hash: assessments.inputHash })
        .from(assessments)
        .where(eq(assessments.promptVersion, PROMPT_VERSION))
    ).map((a) => `${a.id}:${a.hash}`),
  );
  const queue = responded.filter(
    (p) => !judged.has(`${p.id}:${buildRequest(p).inputHash}`),
  );

  let items = 0;
  let inputTokens = 0;
  const errors: string[] = [];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      if (Date.now() > deadline) return;
      try {
        const row = await judgeOne(client, p);
        await db
          .insert(assessments)
          .values({ petitionId: p.id, ...row })
          .onConflictDoNothing();
        items += 1;
        inputTokens += row.inputTokens ?? 0;
      } catch (error) {
        errors.push(`${p.id}: ${(error as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  return {
    items,
    inputTokens,
    errors,
    complete: queue.length === 0 && errors.length === 0,
  };
}
