import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { runDebateStances } from "@/lib/debate";
import { checkCronSecret, JOB_BUDGET_MS, recordJob } from "@/lib/jobs";
import { createJevClient } from "@/lib/judge";

export async function POST(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) return denied;
  const deadline = Date.now() + JOB_BUDGET_MS;
  const result = await recordJob(db, "debate_stance", () =>
    runDebateStances(db, createJevClient(), { deadline }),
  );
  revalidateTag("petitions", { expire: 0 });
  return Response.json(result);
}
