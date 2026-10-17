import { isNotNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { assessments, petitions } from "@/db/schema";
import { testDb } from "@/test/db";
import {
  buildRequest,
  type JevClient,
  type JudgeInput,
  type JudgeResult,
  mapAnswers,
  PROMPT_VERSION,
  runJudge,
  splitSentences,
  verdictFor,
} from "./judge";

const input: JudgeInput = {
  action: "Fund more school buses",
  background: "Rural children walk miles.",
  additionalDetails: null,
  signatureCount: 12_000,
  responseSummary: "We fund councils to provide transport.",
  responseDetails:
    "Councils received £1.2bn in 2025. Eligibility is set by law. We have no plans to change it.",
};

function fakeResult(
  scores: number[],
  { confidence = 0.9, pick = "s0", pickConfidence = 0.9 } = {},
): JudgeResult {
  const s = (score: number) => ({ type: "score", score, confidence }) as never;
  const [a, b, c, d, e] = scores;
  return {
    model: "typesafe/jev-1.14-20261014",
    usage: { input_tokens: 500, output_tokens: 0 },
    answers: {
      addresses_ask: s(a),
      evidence: s(b),
      reasoning: s(c),
      outcome: s(d),
      specificity: s(e),
      stance: { type: "choice", choice: "declines", confidence } as never,
      evidence_sentence: {
        type: "choice",
        choice: pick,
        confidence: pickConfidence,
      } as never,
    },
  } as JudgeResult;
}

describe("buildRequest", () => {
  it("offers each response sentence as an evidence option, plus none", () => {
    const req = buildRequest(input);
    expect(req.sentences).toEqual([
      "Councils received £1.2bn in 2025.",
      "Eligibility is set by law.",
      "We have no plans to change it.",
    ]);
    expect(Object.keys(req.questions.evidence_sentence.criteria)).toEqual([
      "s0",
      "s1",
      "s2",
      "none",
    ]);
  });

  it("hashes the input so an edited response is judged again", () => {
    const a = buildRequest(input).inputHash;
    const b = buildRequest({ ...input, responseDetails: "Edited." }).inputHash;
    expect(a).not.toBe(b);
    expect(buildRequest(input).inputHash).toBe(a);
  });

  it("caps the sentence options under the 255-option limit", () => {
    expect(splitSentences("Yes. ".repeat(400))).toHaveLength(254);
  });

  it("flags inputs over the long-context threshold", () => {
    const long = { ...input, responseDetails: "x".repeat(40_000) };
    expect(buildRequest(long).longContext).toBe(true);
    expect(buildRequest(input).longContext).toBe(false);
  });
});

describe("verdictFor", () => {
  it.each([
    [0, "low"],
    [3.99, "low"],
    [4, "some"],
    [6.99, "some"],
    [7, "thorough"],
    [10, "thorough"],
  ])("total %d is %s", (total, verdict) => {
    expect(verdictFor(total)).toBe(verdict);
  });
});

describe("mapAnswers", () => {
  const req = buildRequest(input);

  it("sums the criteria and computes the verdict in code", () => {
    const row = mapAnswers(req, fakeResult([2, 2, 1.5, 1, 0.5]));
    expect(row.total).toBe(7);
    expect(row.verdict).toBe("thorough");
    expect(row.stance).toBe("declines");
    expect(row.evidenceSentence).toBe("Councils received £1.2bn in 2025.");
    expect(row.needsReview).toBe(false);
    expect(row.promptVersion).toBe(PROMPT_VERSION);
  });

  it("flags low or missing confidence for review", () => {
    expect(
      mapAnswers(req, fakeResult([1, 1, 1, 1, 1], { confidence: 0.5 }))
        .needsReview,
    ).toBe(true);
    const missing = fakeResult([1, 1, 1, 1, 1]);
    // biome-ignore lint/suspicious/noExplicitAny: simulating an omitted optional field
    delete (missing.answers.reasoning as any).confidence;
    expect(mapAnswers(req, missing).needsReview).toBe(true);
  });

  it("drops the highlight for none or an unsure pick, without flagging review", () => {
    expect(
      mapAnswers(req, fakeResult([1, 1, 1, 1, 1], { pick: "none" }))
        .evidenceSentence,
    ).toBeNull();
    const unsure = mapAnswers(
      req,
      fakeResult([1, 1, 1, 1, 1], { pickConfidence: 0.2 }),
    );
    expect(unsure.evidenceSentence).toBeNull();
    expect(unsure.needsReview).toBe(false);
  });
});

describe("runJudge", () => {
  let db: Db;
  const row = (id: number, responseDetails: string | null) => ({
    id,
    parliament: "2024-",
    action: input.action,
    background: input.background,
    state: "closed",
    signatureCount: 10_000,
    createdAt: new Date(),
    departments: [],
    topics: [],
    responseSummary: input.responseSummary,
    responseDetails,
    raw: {},
    apiUpdatedAt: new Date(),
  });
  const client = () =>
    ({
      systemOne: vi.fn(async () => fakeResult([1, 1, 1, 1, 1])),
    }) as unknown as JevClient & { systemOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    db = await testDb();
    await db
      .insert(petitions)
      .values([
        row(1, input.responseDetails),
        row(2, "Another response."),
        row(3, null),
      ]);
  });

  it("judges each responded petition once", async () => {
    const jev = client();
    const first = await runJudge(db, jev, { deadline: Date.now() + 60_000 });
    expect(first).toMatchObject({
      items: 2,
      inputTokens: 1000,
      complete: true,
    });

    const second = await runJudge(db, jev, { deadline: Date.now() + 60_000 });
    expect(second.items).toBe(0);
    expect(jev.systemOne).toHaveBeenCalledTimes(2);
  });

  it("judges again when the response text changes", async () => {
    await runJudge(db, client(), { deadline: Date.now() + 60_000 });
    await db
      .update(petitions)
      .set({ responseDetails: "Rewritten." })
      .where(isNotNull(petitions.responseDetails));

    const again = await runJudge(db, client(), {
      deadline: Date.now() + 60_000,
    });
    expect(again.items).toBe(2);
    expect(await db.$count(assessments)).toBe(4);
  });

  it("records failures and keeps going", async () => {
    const jev = client();
    jev.systemOne.mockRejectedValueOnce(new Error("boom"));
    const result = await runJudge(db, jev, {
      deadline: Date.now() + 60_000,
      concurrency: 1,
    });
    expect(result.items).toBe(1);
    expect(result.errors).toEqual(["1: boom"]);
    expect(result.complete).toBe(false);
  });
});
