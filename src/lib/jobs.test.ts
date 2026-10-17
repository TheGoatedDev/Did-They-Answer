import { afterEach, describe, expect, it, vi } from "vitest";
import { jobRuns } from "@/db/schema";
import { testDb } from "@/test/db";
import { checkCronSecret, recordJob } from "./jobs";

const req = (authorization?: string) =>
  new Request("http://x/api/internal/sync", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("checkCronSecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses everything when the secret is not configured", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(checkCronSecret(req("Bearer "))?.status).toBe(500);
  });

  it("rejects a missing or wrong token", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(checkCronSecret(req())?.status).toBe(401);
    expect(checkCronSecret(req("Bearer nope!"))?.status).toBe(401);
    expect(checkCronSecret(req("s3cret"))?.status).toBe(401);
  });

  it("accepts the right token", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(checkCronSecret(req("Bearer s3cret"))).toBeNull();
  });
});

describe("recordJob", () => {
  it("records items, tokens and errors", async () => {
    const db = await testDb();
    await recordJob(db, "judge", async () => ({
      items: 2,
      inputTokens: 900,
      errors: ["7: boom"],
    }));
    const [run] = await db.select().from(jobRuns);
    expect(run).toMatchObject({
      job: "judge",
      items: 2,
      inputTokens: 900,
      error: "7: boom",
    });
    expect(run.finishedAt).toBeInstanceOf(Date);
  });

  it("records a crash and rethrows it", async () => {
    const db = await testDb();
    await expect(
      recordJob(db, "sync", async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow("down");
    const [run] = await db.select().from(jobRuns);
    expect(run.error).toContain("down");
  });
});
