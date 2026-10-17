import { describe, expect, it } from "vitest";
import { disagrees, type EvalItem, sampleForGold, summarise } from "./gold";

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
