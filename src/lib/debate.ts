import { choice } from "@typesafe-ai/sdk";
import { z } from "zod";
import type { DebateRole, DebateStance } from "@/db/schema";
import type { JevClient } from "@/lib/judge";

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

export async function fetchDebate(extId: string) {
  const debate = debateSchema.parse(
    await getJson(
      `https://hansard-api.parliament.uk/debates/debate/${extId}.json`,
    ),
  );
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
 * not a personal position. Contributions without a MemberId are dropped.
 */
export function speakers(items: Item[]) {
  const out = new Map<number, Speaker>();
  const contributions = items.filter(
    (i) => i.ItemType === "Contribution" && i.MemberId !== null,
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
