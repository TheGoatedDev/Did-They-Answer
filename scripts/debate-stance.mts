// Rate every MP in each petition's Hansard debate as for, neutral or against the petition,
// as the /api/internal/debate-stance route does.
// Usage: pnpm debate:stance [petitionId...]   (no ids: every debated petition not yet rated)
import { db } from "@/db";
import { runDebateStances } from "@/lib/debate";
import { recordJob } from "@/lib/jobs";
import { createJevClient } from "@/lib/judge";

const petitionIds = process.argv.slice(2).map(Number);
const result = await recordJob(db, "debate_stance", () =>
  runDebateStances(db, createJevClient(), {
    deadline: Date.now() + 30 * 60_000,
    petitionIds,
  }),
);
console.log({ ...result, errors: result.errors.slice(0, 5) });
process.exit(result.errors.length ? 1 : 0);
