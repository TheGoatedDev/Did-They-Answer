// Rate every MP in each petition's Hansard debate as for, neutral or against the petition,
// and store the ratings in debate_stances.
// Usage: pnpm debate:stance [petitionId...]   (no ids: every debated petition not yet rated)
import { inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { debateStances, petitions } from "@/db/schema";
import {
  debateIdFrom,
  fetchDebate,
  fetchMembers,
  rateMember,
  speakers,
} from "@/lib/debate";
import { createJevClient, MODEL } from "@/lib/judge";

const ids = process.argv.slice(2).map(Number);
const debated = await db
  .select({
    id: petitions.id,
    action: petitions.action,
    url: sql<string>`${petitions.debate}->>'transcript_url'`,
  })
  .from(petitions)
  .where(
    ids.length
      ? inArray(petitions.id, ids)
      : isNotNull(sql`${petitions.debate}->>'transcript_url'`),
  );
const rated = new Set(
  (
    await db
      .selectDistinct({ id: debateStances.petitionId })
      .from(debateStances)
  ).map((r) => r.id),
);

// Several petitions are often debated together; rate each debate once for all of them.
const debates = new Map<string, typeof debated>();
for (const p of debated) {
  const debateId = p.url && debateIdFrom(p.url);
  if (!debateId || (!ids.length && rated.has(p.id))) continue;
  debates.set(debateId, [...(debates.get(debateId) ?? []), p]);
}

const client = createJevClient();
let done = 0;
for (const [debateId, group] of debates) {
  try {
    const debate = await fetchDebate(debateId);
    const date = debate.Overview.Date.slice(0, 10);
    const bySpeaker = speakers(debate.Items);
    const members = await fetchMembers([...bySpeaker.keys()], date);
    const rows = await Promise.all(
      [...bySpeaker].map(async ([memberId, s]) => {
        const member = members.get(memberId) ?? {
          name: `Member ${memberId}`,
          party: "Unknown",
        };
        const { raw, ratings } = await rateMember(
          client,
          debate.Overview.Title,
          member,
          s.speeches,
          group,
        );
        return ratings.map((r) => ({
          ...r,
          ...member,
          debateId,
          memberId,
          role: s.role,
          speeches: s.speeches.length,
          model: MODEL,
          raw,
        }));
      }),
    );
    await db
      .insert(debateStances)
      .values(rows.flat())
      .onConflictDoUpdate({
        target: [debateStances.petitionId, debateStances.memberId],
        set: {
          stance: sql`excluded.stance`,
          confidence: sql`excluded.confidence`,
          party: sql`excluded.party`,
          role: sql`excluded.role`,
          speeches: sql`excluded.speeches`,
          raw: sql`excluded.raw`,
          createdAt: sql`now()`,
        },
      });
    done += 1;
    console.log(
      `${debateId} ${debate.Overview.Title}: ${bySpeaker.size} speakers, petitions ${group.map((p) => p.id).join(", ")}`,
    );
  } catch (error) {
    console.error(`${debateId}: ${(error as Error).message}`);
  }
}
console.log(`Rated ${done} of ${debates.size} debates`);
process.exit(done === debates.size ? 0 : 1);
