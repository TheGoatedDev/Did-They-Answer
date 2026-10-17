import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { crawlCursors, petitions } from "@/db/schema";
import { testDb } from "@/test/db";
import currentPage from "./__fixtures__/current-page.json";
import { fetchPetitionPage } from "./petitions-api";
import { runSync } from "./sync";

const SET = {
  parliament: "2024-",
  url: "https://x/p.json?s=1",
  refresh: true,
} as const;
const ARCHIVED = {
  parliament: "2019-24",
  url: "https://x/a.json?s=1",
  refresh: false,
} as const;

// Two pages built from the fixture: ids 1-3 on page 1, ids 4-6 on page 2.
function fakeApi() {
  const page = (n: number, next: string | null) => ({
    links: { next },
    data: currentPage.data.map((p, i) => ({ ...p, id: (n - 1) * 3 + i + 1 })),
  });
  const pages: Record<string, unknown> = {
    "1": page(1, "next"),
    "2": page(2, null),
  };
  return vi.fn((url: string) =>
    fetchPetitionPage(url, {
      fetch: async () =>
        Response.json(pages[new URL(url).searchParams.get("page") ?? ""]),
    }),
  );
}

describe("runSync", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("crawls every page and marks the set done", async () => {
    const fetchPage = fakeApi();
    const result = await runSync(db, {
      deadline: Date.now() + 60_000,
      sets: [SET],
      fetchPage,
      pauseMs: 0,
    });

    expect(result).toEqual({ items: 6, complete: true });
    expect(await db.$count(petitions)).toBe(6);
    const [cursor] = await db.select().from(crawlCursors);
    expect(cursor).toMatchObject({ nextPage: 3, done: true });
  });

  it("upserts: a second run changes values but adds no rows", async () => {
    await runSync(db, {
      deadline: Date.now() + 60_000,
      sets: [SET],
      fetchPage: fakeApi(),
      pauseMs: 0,
    });
    await db.update(petitions).set({ signatureCount: -1 });
    // Force the refresh window so the current set is crawled again.
    await db.update(crawlCursors).set({ updatedAt: new Date(0) });

    await runSync(db, {
      deadline: Date.now() + 60_000,
      sets: [SET],
      fetchPage: fakeApi(),
      pauseMs: 0,
    });

    expect(await db.$count(petitions)).toBe(6);
    expect(await db.$count(petitions, eq(petitions.signatureCount, -1))).toBe(
      0,
    );
  });

  it("stops at the deadline and resumes from the cursor", async () => {
    const fetchPage = fakeApi();
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    fetchPage.mockImplementationOnce(async (url) => {
      now = 2; // the deadline passes during the first page
      return fakeApi()(url);
    });

    const first = await runSync(db, {
      deadline: 1,
      sets: [SET],
      fetchPage,
      pauseMs: 0,
    });
    expect(first).toEqual({ items: 3, complete: false });

    const second = await runSync(db, {
      deadline: 10,
      sets: [SET],
      fetchPage,
      pauseMs: 0,
    });
    expect(second).toEqual({ items: 3, complete: true });
    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      `${SET.url}&page=1`,
      `${SET.url}&page=2`,
    ]);
    vi.restoreAllMocks();
  });

  it("never re-crawls a finished archived set", async () => {
    const opts = {
      deadline: Date.now() + 60_000,
      sets: [ARCHIVED],
      pauseMs: 0,
    };
    await runSync(db, { ...opts, fetchPage: fakeApi() });
    await db.update(crawlCursors).set({ updatedAt: new Date(0) });

    const fetchPage = fakeApi();
    await runSync(db, { ...opts, fetchPage });

    expect(fetchPage).not.toHaveBeenCalled();
  });
});
