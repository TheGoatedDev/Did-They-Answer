import { choice } from "@typesafe-ai/sdk";
import { inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  type DebateRole,
  type DebateStance,
  debateStances,
  petitions,
} from "@/db/schema";
import { type JevClient, MODEL } from "@/lib/judge";

export const STANCE_OPTIONS = {
  for: "Supports what the petition asks for",
  neutral:
    "Takes no clear position on what the petition asks for, is mixed, or does not discuss it",
  against: "Opposes what the petition asks for",
} satisfies Record<DebateStance, string>;

const itemSchema = z.object({
  ItemType: z.string(),
  MemberId: z.number().nullable(),
  AttributedTo: z.string().nullable(),
  Value: z.string(),
});
type Item = z.infer<typeof itemSchema>;
type Section = { Items: Item[]; ChildDebates?: Section[] };
const sectionSchema: z.ZodType<Section> = z.lazy(() =>
  z.object({
    Items: z.array(itemSchema),
    ChildDebates: z.array(sectionSchema).optional(),
  }),
);
const debateSchema = z.object({
  Overview: z.object({ Title: z.string(), Date: z.string() }),
  Items: z.array(itemSchema),
  ChildDebates: z.array(sectionSchema).optional(),
});

const flatten = (s: Section): Item[] => [
  ...s.Items,
  ...(s.ChildDebates ?? []).flatMap(flatten),
];

/** The Hansard ExtId in a transcript URL, e.g. .../debates/DAEA92D0-.../LeavingTheEuropeanUnion. */
export function debateIdFrom(transcriptUrl: string) {
  return (
    /hansard\.parliament\.uk\/.+\/debates\/([^/]+)/.exec(transcriptUrl)?.[1] ??
    null
  );
}

const historySchema = z.array(
  z.object({
    value: z.object({
      id: z.number(),
      nameHistory: z.array(z.object({ nameDisplayAs: z.string() })),
      partyHistory: z.array(
        z.object({
          startDate: z.string(),
          endDate: z.string().nullable(),
          party: z.object({ name: z.string() }),
        }),
      ),
    }),
  }),
);

export type PartySpan = z.infer<
  typeof historySchema
>[number]["value"]["partyHistory"][number];

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const searchSchema = z.object({
  Results: z.array(
    z.object({
      DebateSection: z.string(),
      Title: z.string(),
      DebateSectionExtId: z.string(),
    }),
  ),
});

const squash = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * The debate on the sitting whose title matches the URL's slug, e.g. "EUReferendumRules".
 * Sitting headers ("Westminster Hall") are skipped: they hold every debate that day.
 */
export function matchDebate(
  results: z.infer<typeof searchSchema>["Results"],
  slug: string,
) {
  return (
    results.find(
      (r) => r.Title !== r.DebateSection && squash(r.Title) === squash(slug),
    )?.DebateSectionExtId ?? null
  );
}

async function getDebate(extId: string) {
  return debateSchema.safeParse(
    await getJson(
      `https://hansard-api.parliament.uk/debates/debate/${extId}.json`,
    ).catch(() => null),
  );
}

export async function fetchDebate(transcriptUrl: string) {
  let parsed = await getDebate(debateIdFrom(transcriptUrl) ?? "");
  // Some petition links carry ids Hansard no longer resolves; find the debate by date and title.
  const link =
    /\/(commons|lords)\/(\d{4}-\d{2}-\d{2})\/debates\/[^/]+\/([^/?#]+)/i.exec(
      transcriptUrl,
    );
  if (!parsed.success && link) {
    const [, house, date, slug] = link;
    const { Results } = searchSchema.parse(
      await getJson(
        `https://hansard-api.parliament.uk/search/debates.json?queryParameters.house=${house}&queryParameters.startDate=${date}&queryParameters.endDate=${date}&queryParameters.take=100`,
      ),
    );
    const extId = matchDebate(Results, slug);
    if (extId) parsed = await getDebate(extId);
  }
  if (!parsed.success)
    throw new Error(`no Hansard debate for ${transcriptUrl}`);
  const debate = parsed.data;
  // Long debates split into child sections; speakers can appear in any of them.
  return { ...debate, Items: flatten(debate) };
}

/** The party a member sat for on `date` (YYYY-MM-DD), not their current one. */
export function partyOn(history: PartySpan[], date: string) {
  return (
    history.find(
      (p) =>
        p.startDate.slice(0, 10) <= date &&
        (p.endDate === null || p.endDate.slice(0, 10) >= date),
    )?.party.name ?? "Unknown"
  );
}

export async function fetchMembers(ids: number[], date: string) {
  const members = new Map<number, { name: string; party: string }>();
  // The History endpoint rejects more than ~10 ids per call with a 400.
  for (let i = 0; i < ids.length; i += 10) {
    const query = ids
      .slice(i, i + 10)
      .map((id) => `ids=${id}`)
      .join("&");
    const rows = historySchema.parse(
      await getJson(
        `https://members-api.parliament.uk/api/Members/History?${query}`,
      ),
    );
    for (const { value } of rows) {
      members.set(value.id, {
        name: value.nameHistory.at(-1)?.nameDisplayAs ?? `Member ${value.id}`,
        party: partyOn(value.partyHistory, date),
      });
    }
  }
  return members;
}

export type Speaker = { speeches: string[]; role: DebateRole | null };

/**
 * Each member's contributions in speaking order, with any role that makes their words
 * not a personal position. Contributions without a real MemberId are dropped.
 */
export function speakers(items: Item[]) {
  const out = new Map<number, Speaker>();
  const contributions = items.filter(
    // Hansard gives unidentified speakers MemberId -1.
    (i) => i.ItemType === "Contribution" && (i.MemberId ?? 0) > 0,
  );
  for (const item of contributions) {
    const id = item.MemberId as number;
    const s = out.get(id) ?? { speeches: [], role: null };
    s.speeches.push(item.Value);
    const said = item.AttributedTo ?? "";
    if (/in the Chair/i.test(said)) s.role = "chair";
    // Office holders are attributed by title, e.g. "The Minister for Housing (Jane Doe)".
    else if (s.role !== "chair" && /^The /.test(said)) s.role = "minister";
    out.set(id, s);
  }
  // The first non-chair speaker moves the motion: in petition debates, for the Petitions Committee.
  const first = contributions
    .map((i) => out.get(i.MemberId as number))
    .find((s) => s?.role !== "chair");
  if (first && first.role === null) first.role = "opener";
  return out;
}

export type DebatePetition = { id: number; action: string };

export async function rateMember(
  client: JevClient,
  debateTitle: string,
  member: { name: string; party: string },
  speeches: string[],
  petitions: DebatePetition[],
) {
  const questions = Object.fromEntries(
    petitions.map((p) => [
      `p${p.id}`,
      choice(
        `Based only on what ${member.name} said in this debate, what is their position on the petition "${p.action}"?`,
        STANCE_OPTIONS,
      ),
    ]),
  );
  const result = await client.systemOne({
    state: {
      debate: debateTitle,
      speaker: member,
      petitions: petitions.map((p) => ({ id: p.id, asks: p.action })),
      speeches,
    },
    questions,
  });
  return {
    raw: result,
    ratings: petitions.map((p) => {
      const a = result.answers[`p${p.id}`];
      return {
        petitionId: p.id,
        stance: a.choice as DebateStance,
        confidence: a.confidence ?? 0,
      };
    }),
  };
}

/**
 * Rate every speaker in each debated petition's Hansard debate and store the ratings.
 * With `petitionIds`, re-rates those petitions; without, only petitions not yet rated.
 */
export async function runDebateStances(
  db: Db,
  client: JevClient,
  {
    deadline,
    petitionIds = [],
    // Each debate already rates all its speakers at once, so keep this low.
    concurrency = 4,
  }: { deadline: number; petitionIds?: number[]; concurrency?: number },
) {
  const transcriptUrl = sql<
    string | null
  >`${petitions.debate}->>'transcript_url'`;
  const debated = await db
    .select({ id: petitions.id, action: petitions.action, url: transcriptUrl })
    .from(petitions)
    .where(
      petitionIds.length
        ? inArray(petitions.id, petitionIds)
        : isNotNull(transcriptUrl),
    );
  const rated = new Set(
    (
      await db
        .selectDistinct({ id: debateStances.petitionId })
        .from(debateStances)
    ).map((r) => r.id),
  );

  // Several petitions are often debated together; rate each debate once for all of them.
  const debates = new Map<string, { url: string; group: DebatePetition[] }>();
  for (const p of debated) {
    const debateId = p.url && debateIdFrom(p.url);
    if (!p.url || !debateId || (!petitionIds.length && rated.has(p.id)))
      continue;
    const group = debates.get(debateId)?.group ?? [];
    debates.set(debateId, { url: p.url, group: [...group, p] });
  }

  let items = 0;
  let inputTokens = 0;
  const errors: string[] = [];
  const queue = [...debates];
  const worker = async () => {
    // Check the deadline before taking a debate so an untaken one is never lost.
    while (queue.length > 0 && Date.now() <= deadline) {
      const [debateId, { url, group }] =
        queue.shift() as (typeof queue)[number];
      try {
        const debate = await fetchDebate(url);
        const bySpeaker = speakers(debate.Items);
        const members = await fetchMembers(
          [...bySpeaker.keys()],
          debate.Overview.Date.slice(0, 10),
        );
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
            inputTokens += raw.usage.input_tokens ?? 0;
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
        if (rows.length === 0) continue;
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
        items += 1;
      } catch (error) {
        errors.push(`${debateId}: ${(error as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    items,
    inputTokens,
    errors,
    complete: queue.length === 0 && errors.length === 0,
  };
}
