import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { checkCronSecret, JOB_BUDGET_MS, recordJob } from "@/lib/jobs";
import { runSync } from "@/lib/sync";

export async function POST(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) return denied;
  const deadline = Date.now() + JOB_BUDGET_MS;
  const result = await recordJob(db, "sync", () => runSync(db, { deadline }));
  revalidateTag("petitions", { expire: 0 });
  return Response.json(result);
}
