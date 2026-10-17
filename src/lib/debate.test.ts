import { describe, expect, it } from "vitest";
import { partyOn, speechesByMember } from "./debate";

const span = (startDate: string, endDate: string | null, name: string) => ({
  startDate,
  endDate,
  party: { name },
});

describe("partyOn", () => {
  // Chuka Umunna: Labour until 18 Feb 2019, then the Independent Group.
  const history = [
    span("2017-06-08T00:00:00", "2019-02-18T00:00:00", "Labour"),
    span("2019-02-18T00:00:00", "2019-06-14T00:00:00", "Independent"),
    span("2019-06-14T00:00:00", null, "Liberal Democrat"),
  ];

  it("picks the party held on the debate date, not the latest", () => {
    expect(partyOn(history, "2019-04-01")).toBe("Independent");
  });

  it("treats an open-ended span as current", () => {
    expect(partyOn(history, "2026-01-01")).toBe("Liberal Democrat");
  });

  it("returns Unknown when no span covers the date", () => {
    expect(partyOn(history, "2000-01-01")).toBe("Unknown");
  });
});

describe("speechesByMember", () => {
  it("keeps contributions in order and drops timestamps and the chair", () => {
    const item = (
      ItemType: string,
      MemberId: number | null,
      Value: string,
    ) => ({
      ItemType,
      MemberId,
      AttributedTo: null,
      Value,
    });
    const out = speechesByMember([
      item("Timestamp", null, "16:30:00"),
      item("Contribution", 1, "first"),
      item("Contribution", null, "Order."),
      item("Contribution", 2, "other"),
      item("Contribution", 1, "second"),
    ]);
    expect([...out]).toEqual([
      [1, ["first", "second"]],
      [2, ["other"]],
    ]);
  });
});
