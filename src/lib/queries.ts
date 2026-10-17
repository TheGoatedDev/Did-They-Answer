import { and, desc, eq, isNotNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { assessments, jobRuns, petitions } from "@/db/schema";
import { PROMPT_VERSION } from "./judge";

// Every cached read shares one tag; the internal job routes expire it after writing.
const TAG = "petitions";

function latestAssessments() {
  return db
    .selectDistinctOn([assessments.petitionId], {
      petitionId: assessments.petitionId,
      verdict: assessments.verdict,
      total: assessments.total,
      stance: assessments.stance,
      needsReview: assessments.needsReview,
    })
    .from(assessments)
    .where(eq(assessments.promptVersion, PROMPT_VERSION))
    .orderBy(assessments.petitionId, desc(assessments.createdAt))
    .as("latest");
}

export type IndexRow = Awaited<ReturnType<typeof getIndex>>[number];

export async function getIndex() {
  "use cache";
  cacheTag(TAG);
  cacheLife("max");
  const latest = latestAssessments();
  const rows = await db
    .select({
      id: petitions.id,
      action: petitions.action,
      parliament: petitions.parliament,
      signatureCount: petitions.signatureCount,
      respondedOn: petitions.respondedOn,
      departments: petitions.departments,
      topics: petitions.topics,
      verdict: latest.verdict,
      total: latest.total,
      stance: latest.stance,
      needsReview: latest.needsReview,
    })
    .from(petitions)
    .leftJoin(latest, eq(latest.petitionId, petitions.id))
    .where(isNotNull(petitions.responseDetails));
  return rows.map(({ verdict, total, stance, needsReview, ...r }) => ({
    ...r,
    assessment:
      verdict && total !== null && stance && needsReview !== null
        ? { verdict, total, stance, needsReview }
        : null,
  }));
}

export async function getPetition(id: number) {
  "use cache";
  cacheTag(TAG);
  cacheLife("max");
  const [petition] = await db
    .select()
    .from(petitions)
    .where(eq(petitions.id, id));
  if (!petition) return null;
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.petitionId, id),
        eq(assessments.promptVersion, PROMPT_VERSION),
      ),
    )
    .orderBy(desc(assessments.createdAt))
    .limit(1);
  const { raw: _p, ...rest } = petition;
  if (!assessment) return { petition: rest, assessment: null };
  const { raw: _a, ...judged } = assessment;
  return { petition: rest, assessment: judged };
}

export async function getLastSync() {
  "use cache";
  cacheTag(TAG);
  cacheLife("max");
  const [run] = await db
    .select({ finishedAt: jobRuns.finishedAt })
    .from(jobRuns)
    .where(isNotNull(jobRuns.finishedAt))
    .orderBy(desc(jobRuns.finishedAt))
    .limit(1);
  return run?.finishedAt ?? null;
}
