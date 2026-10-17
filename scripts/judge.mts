// Judge every unassessed petition in the local database, as the /api/internal/judge route does.
import { db } from "@/db";
import { recordJob } from "@/lib/jobs";
import { createJevClient, runJudge } from "@/lib/judge";

const result = await recordJob(db, "judge", () =>
  runJudge(db, createJevClient(), { deadline: Date.now() + 30 * 60_000 }),
);
console.log({ ...result, errors: result.errors.slice(0, 5) });
process.exit(result.errors.length ? 1 : 0);
