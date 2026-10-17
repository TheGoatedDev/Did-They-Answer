import { choice } from "@typesafe-ai/sdk";
import { z } from "zod";
import type { JevClient } from "@/lib/judge";

export const DEBATE_STANCES = {
  for: "Supports what the petition asks for",
  neutral:
    "Takes no clear position on what the petition asks for, is mixed, or does not discuss it",
  against: "Opposes what the petition asks for",
};
export type DebateStance = keyof typeof DEBATE_STANCES;

const debateSchema = z.object({
  Overview: z.object({ Title: z.string(), Date: z.string() }),
  Items: z.array(
    z.object({
      ItemType: z.string(),
      MemberId: z.number().nullable(),
      AttributedTo: z.string().nullable(),
      Value: z.string(),
    }),
  ),
});

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
  return debateSchema.parse(
    await getJson(
      `https://hansard-api.parliament.uk/debates/debate/${extId}.json`,
    ),
  );
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

/** Each member's contributions in speaking order. Drops the chair, who has no MemberId. */
export function speechesByMember(items: z.infer<typeof debateSchema>["Items"]) {
  const out = new Map<number, string[]>();
  for (const item of items) {
    if (item.ItemType !== "Contribution" || item.MemberId === null) continue;
    out.set(item.MemberId, [...(out.get(item.MemberId) ?? []), item.Value]);
  }
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
        DEBATE_STANCES,
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
  return petitions.map((p) => {
    const a = result.answers[`p${p.id}`];
    return {
      petitionId: p.id,
      stance: a.choice as DebateStance,
      confidence: a.confidence ?? 0,
    };
  });
}
