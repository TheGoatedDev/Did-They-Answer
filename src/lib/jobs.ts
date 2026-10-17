import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { jobRuns } from "@/db/schema";

// Leaves headroom under Coolify's 300s scheduled-task timeout.
export const JOB_BUDGET_MS = 250_000;

export function checkCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET is not set", { status: 500 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

type JobResult = { items: number; inputTokens?: number; errors?: string[] };

export async function recordJob<T extends JobResult>(
  db: Db,
  job: (typeof jobRuns.$inferInsert)["job"],
  run: () => Promise<T>,
) {
  const [{ id }] = await db
    .insert(jobRuns)
    .values({ job })
    .returning({ id: jobRuns.id });
  try {
    const result = await run();
    await db
      .update(jobRuns)
      .set({
        finishedAt: new Date(),
        items: result.items,
        inputTokens: result.inputTokens,
        error: result.errors?.length ? result.errors.join("\n") : null,
      })
      .where(eq(jobRuns.id, id));
    return result;
  } catch (error) {
    await db
      .update(jobRuns)
      .set({ finishedAt: new Date(), error: String(error) })
      .where(eq(jobRuns.id, id));
    throw error;
  }
}
