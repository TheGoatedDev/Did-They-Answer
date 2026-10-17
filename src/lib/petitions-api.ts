import { z } from "zod";
import type { petitions } from "@/db/schema";

const BASE = "https://petition.parliament.uk";
const USER_AGENT =
  "did-they-answer (+https://github.com/TheGoatedDev/did-they-answer)";

export const CURRENT_PARLIAMENT = "2024-";

// The archive's `parliament` numbers are not chronological; dates checked 2026-10-17.
export type PetitionSet = { parliament: string; url: string; refresh: boolean };

export const PETITION_SETS: readonly PetitionSet[] = [
  {
    parliament: CURRENT_PARLIAMENT,
    url: `${BASE}/petitions.json?state=with_response`,
    refresh: true,
  },
  {
    parliament: "2019-24",
    url: `${BASE}/archived/petitions.json?parliament=4&state=with_response`,
    refresh: false,
  },
  {
    parliament: "2017-19",
    url: `${BASE}/archived/petitions.json?parliament=3&state=with_response`,
    refresh: false,
  },
  {
    parliament: "2015-17",
    url: `${BASE}/archived/petitions.json?parliament=1&state=with_response`,
    refresh: false,
  },
  {
    parliament: "2010-15",
    url: `${BASE}/archived/petitions.json?parliament=2&state=with_response`,
    refresh: false,
  },
];

const petitionSchema = z.object({
  id: z.number().int(),
  attributes: z.object({
    action: z.string(),
    background: z.string().nullable(),
    additional_details: z.string().nullable(),
    state: z.string(),
    signature_count: z.number().int(),
    created_at: z.string(),
    opened_at: z.string().nullable(),
    closed_at: z.string().nullable(),
    updated_at: z.string(),
    departments: z.array(
      z.object({ acronym: z.string(), name: z.string(), url: z.string() }),
    ),
    topics: z.array(z.string()),
    government_response: z
      .object({
        responded_on: z.string(),
        summary: z.string(),
        details: z.string(),
      })
      .nullable(),
    debate: z
      .object({
        debated_on: z.string().nullable(),
        transcript_url: z.string().nullable(),
        video_url: z.string().nullable(),
        debate_pack_url: z.string().nullable(),
        overview: z.string().nullable(),
      })
      .nullable(),
  }),
});

const pageSchema = z.object({
  links: z.object({ next: z.string().nullable() }),
  data: z.array(z.unknown()),
});

export type ApiPetition = z.infer<typeof petitionSchema>;

export async function fetchPetitionPage(
  url: string,
  { fetch = globalThis.fetch, sleep = defaultSleep, attempts = 4 } = {},
) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (res.ok) {
      const page = pageSchema.parse(await res.json());
      // Keep the untouched record for `raw`; validate a parsed copy.
      return {
        next: page.links.next,
        petitions: page.data.map((raw) => ({
          raw,
          petition: petitionSchema.parse(raw),
        })),
      };
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= attempts) {
      throw new Error(`GET ${url} failed: ${res.status}`);
    }
    await sleep(1000 * 2 ** attempt);
  }
}

export function toRow(
  { raw, petition }: { raw: unknown; petition: ApiPetition },
  parliament: string,
): typeof petitions.$inferInsert {
  const a = petition.attributes;
  return {
    id: petition.id,
    parliament,
    action: a.action,
    background: a.background,
    additionalDetails: a.additional_details || null,
    state: a.state,
    signatureCount: a.signature_count,
    createdAt: new Date(a.created_at),
    openedAt: a.opened_at ? new Date(a.opened_at) : null,
    closedAt: a.closed_at ? new Date(a.closed_at) : null,
    departments: a.departments,
    topics: a.topics,
    responseSummary: a.government_response?.summary ?? null,
    responseDetails: a.government_response?.details ?? null,
    respondedOn: a.government_response?.responded_on ?? null,
    debate: a.debate,
    raw,
    apiUpdatedAt: new Date(a.updated_at),
    fetchedAt: new Date(),
  };
}

export function sourceUrl(id: number, parliament: string) {
  return parliament === CURRENT_PARLIAMENT
    ? `${BASE}/petitions/${id}`
    : `${BASE}/archived/petitions/${id}`;
}

function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
