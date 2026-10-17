import { describe, expect, it } from "vitest";
import {
  compareLabellers,
  disagrees,
  type EvalItem,
  type LabellerEntry,
  mergeLabels,
  sampleForGold,
  summarise,
} from "./gold";

const rows = [
  ...Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    parliament: "2019-24",
    departments: [{ acronym: i % 2 ? "DHSC" : "DfE" }],
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: 100 + i,
    parliament: "2010-15",
    departments: [{ acronym: "HO" }],
  })),
];

describe("sampleForGold", () => {
  it("takes from every parliament before doubling up", () => {
    const sample = sampleForGold(rows, 4);
    expect(sample.filter((r) => r.parliament === "2010-15")).toHaveLength(2);
    expect(new Set(sample.map((r) => r.departments[0].acronym)).size).toBe(3);
  });

  it("is deterministic and never repeats a row", () => {
    const a = sampleForGold(rows, 23).map((r) => r.id);
    expect(sampleForGold(rows, 23).map((r) => r.id)).toEqual(a);
    expect(new Set(a).size).toBe(23);
  });
});

const scores = {
  addresses_ask: 2,
  evidence: 1,
  reasoning: 1,
  outcome: 1,
  specificity: 0,
};
const item = (model: Partial<EvalItem["model"]> = {}): EvalItem => ({
  petitionId: 1,
  action: "x",
  label: { scores, stance: "declines", verdict: "some" },
  model: { scores, stance: "declines", verdict: "some", ...model },
});

describe("summarise", () => {
  it("rounds model scores before comparing and reports shares", () => {
    const agreement = summarise([
      item({ scores: { ...scores, evidence: 1.4 } }),
      item({ stance: "deflects", verdict: "low" }),
    ]);
    expect(agreement).toMatchObject({ evidence: 1, stance: 0.5, verdict: 0.5 });
    expect(summarise([])).toBeNull();
  });

  it("flags any mismatch as a disagreement", () => {
    expect(disagrees(item())).toBe(false);
    expect(disagrees(item({ scores: { ...scores, outcome: 1.6 } }))).toBe(true);
  });
});

describe("compareLabellers and mergeLabels", () => {
  const entry = (
    petitionId: number,
    over: Partial<LabellerEntry> = {},
  ): LabellerEntry => ({
    petitionId,
    scores: {
      addresses_ask: 2,
      evidence: 1,
      reasoning: 1,
      outcome: 1,
      specificity: 2,
    },
    stance: "declines",
    ...over,
  });
  const sample = [
    { petitionId: 1, inputHash: "h1" },
    { petitionId: 2, inputHash: "h2" },
  ];
  const a = [entry(1), entry(2)];
  const b = [entry(1, { stance: "deflects" }), entry(2)];

  it("reports agreement per field and lists the disputed cells", () => {
    const { agreement, disagreements } = compareLabellers(a, b);
    expect(agreement.stance).toBe(0.5);
    expect(agreement.evidence).toBe(1);
    expect(disagreements).toHaveLength(1);
    expect(disagreements[0].disagreements).toEqual({
      stance: ["declines", "deflects"],
    });
  });

  it("takes the adjudicator's pick and tags the split", () => {
    const gold = mergeLabels(
      sample,
      a,
      b,
      [{ petitionId: 1, resolved: { stance: "deflects" } }],
      "holdout",
    );
    expect(gold[0]).toMatchObject({
      petitionId: 1,
      inputHash: "h1",
      split: "holdout",
      stance: "deflects",
    });
    expect(gold[1].stance).toBe("declines");
  });

  it("refuses unresolved disputes, picks nobody offered, and invalid labels", () => {
    expect(() => mergeLabels(sample, a, b, [], "tune")).toThrow(
      "not adjudicated",
    );
    expect(() =>
      mergeLabels(
        sample,
        a,
        b,
        [{ petitionId: 1, resolved: { stance: "accepts" } }],
        "tune",
      ),
    ).toThrow("not one of the labellers' values");
    expect(() =>
      compareLabellers([entry(1, { stance: "maybe" as never })], [entry(1)]),
    ).toThrow("unknown stance");
    expect(() =>
      compareLabellers(
        [entry(1, { scores: { ...entry(1).scores, outcome: 3 } })],
        [entry(1)],
      ),
    ).toThrow("must be 0, 1 or 2");
    expect(() => compareLabellers([entry(1)], [entry(2)])).toThrow(
      "different petitions",
    );
  });
});
