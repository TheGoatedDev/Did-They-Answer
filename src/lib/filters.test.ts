import { describe, expect, it } from "vitest";
import { STANCES, VERDICTS } from "@/db/schema";
import {
  applyFilters,
  facets,
  hrefWith,
  PAGE_SIZE,
  parseFilters,
  shares,
} from "./filters";
import type { IndexRow } from "./queries";

const row = (id: number, over: Partial<IndexRow> = {}): IndexRow => ({
  id,
  action: `Petition ${id}`,
  parliament: "2019-24",
  signatureCount: id * 1000,
  respondedOn: `2020-01-${String(id).padStart(2, "0")}`,
  departments: [{ acronym: "DfE", name: "Department for Education", url: "" }],
  topics: [],
  assessment: {
    verdict: "some",
    total: 5,
    stance: "declines",
    needsReview: false,
  },
  debate: null,
  ...over,
});

describe("parseFilters", () => {
  it("ignores unknown values and bad page numbers", () => {
    expect(parseFilters({ verdict: "awful", page: "-3", sort: "x" })).toEqual({
      verdict: undefined,
      stance: undefined,
      department: undefined,
      parliament: undefined,
      topic: undefined,
      sort: "signatures",
      page: 1,
    });
    expect(parseFilters({ verdict: ["low", "some"], page: "2" })).toMatchObject(
      {
        verdict: "low",
        page: 2,
      },
    );
  });
});

describe("applyFilters", () => {
  const rows = [
    row(1, {
      assessment: {
        verdict: "low",
        total: 2,
        stance: "deflects",
        needsReview: false,
      },
    }),
    row(2, { parliament: "2024-" }),
    row(3, { assessment: null }),
  ];

  it("filters by verdict, stance and parliament", () => {
    const f = parseFilters({});
    expect(
      applyFilters(rows, { ...f, verdict: "low" }).rows.map((r) => r.id),
    ).toEqual([1]);
    expect(
      applyFilters(rows, { ...f, stance: "declines" }).rows.map((r) => r.id),
    ).toEqual([2]);
    expect(applyFilters(rows, { ...f, parliament: "2024-" }).total).toBe(1);
  });

  it("sorts by signatures by default and puts unjudged last when sorting by score", () => {
    const f = parseFilters({});
    expect(applyFilters(rows, f).rows.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(
      applyFilters(rows, { ...f, sort: "score" }).rows.map((r) => r.id),
    ).toEqual([1, 2, 3]);
  });

  it("paginates and clamps an out-of-range page", () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => row(i + 1));
    const result = applyFilters(many, { ...parseFilters({}), page: 9 });
    expect(result).toMatchObject({ page: 2, pages: 2, total: PAGE_SIZE + 5 });
    expect(result.rows).toHaveLength(5);
  });
});

describe("hrefWith", () => {
  it("drops defaults and resets the page on a filter change", () => {
    const f = { ...parseFilters({}), page: 3 };
    expect(hrefWith(f, {})).toBe("/");
    expect(hrefWith(f, { verdict: "low" })).toBe("/?verdict=low");
    expect(hrefWith(f, { page: 4 })).toBe("/?page=4");
  });
});

describe("facets and shares", () => {
  it("collects departments and counts verdicts per group, skipping unjudged", () => {
    const rows = [row(1), row(2), row(3, { assessment: null })];
    expect(facets(rows).departments).toEqual([
      ["DfE", "Department for Education"],
    ]);
    expect(
      shares(
        rows,
        VERDICTS,
        (r) => r.assessment?.verdict,
        (r) => [r.parliament],
      ),
    ).toEqual([
      { group: "2019-24", counts: { low: 0, some: 2, thorough: 0 }, n: 2 },
    ]);
    expect(
      shares(
        rows,
        STANCES,
        (r) => r.assessment?.stance,
        () => ["all"],
      ),
    ).toEqual([
      {
        group: "all",
        counts: { accepts: 0, partially_accepts: 0, declines: 2, deflects: 0 },
        n: 2,
      },
    ]);
  });
});
