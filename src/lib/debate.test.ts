import { describe, expect, it } from "vitest";
import { debateIdFrom, matchDebate, partyOn, speakers } from "./debate";

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

describe("debateIdFrom", () => {
  it("reads new and old style Hansard ids", () => {
    expect(
      debateIdFrom(
        "https://hansard.parliament.uk/commons/2019-04-01/debates/DAEA92D0-DB85-4370-B65C-2BB2FF6B5AE9/LeavingTheEuropeanUnion",
      ),
    ).toBe("DAEA92D0-DB85-4370-B65C-2BB2FF6B5AE9");
    expect(
      debateIdFrom(
        "https://hansard.parliament.uk/commons/2016-04-25/debates/16042524000001/MeningitisBVaccine",
      ),
    ).toBe("16042524000001");
  });

  it("returns null for other links", () => {
    expect(debateIdFrom("https://www.youtube.com/watch?v=x")).toBeNull();
  });
});

describe("matchDebate", () => {
  const r = (
    Title: string,
    DebateSectionExtId: string,
    DebateSection = "Commons Chamber",
  ) => ({
    Title,
    DebateSection,
    DebateSectionExtId,
  });

  it("matches the URL slug against the debate title", () => {
    expect(
      matchDebate(
        [r("Fraud", "A"), r("EU Referendum Rules", "B")],
        "EUReferendumRules",
      ),
    ).toBe("B");
  });

  it("never matches a whole sitting", () => {
    expect(
      matchDebate(
        [r("Westminster Hall", "S", "Westminster Hall")],
        "WestminsterHall",
      ),
    ).toBeNull();
  });
});

describe("speakers", () => {
  const item = (
    MemberId: number | null,
    Value: string,
    AttributedTo: string | null = null,
    ItemType = "Contribution",
  ) => ({ ItemType, MemberId, AttributedTo, Value });

  it("keeps contributions in order and drops timestamps and unattributed items", () => {
    const out = speakers([
      item(null, "16:30:00", null, "Timestamp"),
      item(1, "first"),
      item(null, "Order."),
      item(-1, "Hon. Members: Hear, hear!"),
      item(2, "other"),
      item(1, "second"),
    ]);
    expect(out.get(1)?.speeches).toEqual(["first", "second"]);
    expect(out.get(2)?.speeches).toEqual(["other"]);
    expect(out.size).toBe(2);
  });

  it("tags the chair, the minister and the first non-chair speaker", () => {
    const out = speakers([
      item(9, "Order.", "James Gray (in the Chair)"),
      item(
        1,
        "I beg to move",
        "Catherine McKinnell (Newcastle upon Tyne North) (Lab)",
      ),
      item(
        2,
        "Will she give way?",
        "Neil Coyle (Bermondsey and Old Southwark) (Lab)",
      ),
      item(
        3,
        "The Government's position…",
        "The Parliamentary Under-Secretary of State for Exiting the European Union (Chris Heaton-Harris)",
      ),
      item(3, "Later", "Chris Heaton-Harris"),
    ]);
    expect(out.get(9)?.role).toBe("chair");
    expect(out.get(1)?.role).toBe("opener");
    expect(out.get(2)?.role).toBeNull();
    expect(out.get(3)?.role).toBe("minister");
  });
});
