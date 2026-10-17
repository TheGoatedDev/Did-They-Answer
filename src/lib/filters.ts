import { STANCES, type Stance, VERDICTS, type Verdict } from "@/db/schema";
import type { IndexRow } from "./queries";

export const PAGE_SIZE = 50;
const SORTS = ["signatures", "newest", "score"] as const;
const DEBATE_FILTERS = ["debated", "for", "against", "none"] as const;
type DebateFilter = (typeof DEBATE_FILTERS)[number];

export type Filters = {
  verdict?: Verdict;
  stance?: Stance;
  department?: string;
  parliament?: string;
  topic?: string;
  debate?: DebateFilter;
  sort: (typeof SORTS)[number];
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const oneOf = <T extends string>(list: readonly T[], v: string | undefined) =>
  list.includes(v as T) ? (v as T) : undefined;

export function parseFilters(sp: SearchParams): Filters {
  const page = Number.parseInt(one(sp.page) ?? "1", 10);
  return {
    verdict: oneOf(VERDICTS, one(sp.verdict)),
    stance: oneOf(STANCES, one(sp.stance)),
    department: one(sp.department),
    parliament: one(sp.parliament),
    topic: one(sp.topic),
    debate: oneOf(DEBATE_FILTERS, one(sp.debate)),
    sort: oneOf(SORTS, one(sp.sort)) ?? "signatures",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

// shortcut: filters run in memory over the ~2.6k responded petitions; move to SQL if that set grows past ~20k.
export function applyFilters(rows: IndexRow[], f: Filters) {
  const matched = rows.filter(
    (r) =>
      (!f.verdict || r.assessment?.verdict === f.verdict) &&
      (!f.stance || r.assessment?.stance === f.stance) &&
      (!f.department ||
        r.departments.some((d) => d.acronym === f.department)) &&
      (!f.parliament || r.parliament === f.parliament) &&
      (!f.topic || r.topics.includes(f.topic)) &&
      (!f.debate || matchesDebate(r, f.debate)),
  );
  const sorted = matched.toSorted((a, b) => {
    if (f.sort === "newest")
      return (b.respondedOn ?? "").localeCompare(a.respondedOn ?? "");
    if (f.sort === "score")
      return (a.assessment?.total ?? 99) - (b.assessment?.total ?? 99);
    return b.signatureCount - a.signatureCount;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  return {
    rows: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: sorted.length,
    page,
    pages,
  };
}

// "for"/"against" mean more rated MPs on that side than the other.
function matchesDebate({ debate }: IndexRow, f: DebateFilter) {
  if (f === "none") return !debate;
  if (f === "debated") return !!debate;
  const c = debate?.counts;
  if (!c) return false;
  return f === "for" ? c.for > c.against : c.against > c.for;
}

export function facets(rows: IndexRow[]) {
  const departments = new Map<string, string>();
  const topics = new Set<string>();
  const parliaments = new Set<string>();
  for (const r of rows) {
    for (const d of r.departments) departments.set(d.acronym, d.name);
    for (const t of r.topics) topics.add(t);
    parliaments.add(r.parliament);
  }
  return {
    departments: [...departments].sort((a, b) => a[1].localeCompare(b[1])),
    topics: [...topics].sort(),
    parliaments: [...parliaments].sort().reverse(),
  };
}

/** Query string for a filter change; resets to page 1 unless a page is given. */
export function hrefWith(f: Filters, change: Partial<Filters>) {
  const next = { ...f, page: 1, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || (key === "page" && value === 1)) continue;
    if (key === "sort" && value === "signatures") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export type Share<K extends string> = {
  group: string;
  counts: Record<K, number>;
  n: number;
};

/** Count each row's value per group; rows without a value (not yet assessed) are skipped. */
export function shares<K extends string>(
  rows: IndexRow[],
  keys: readonly K[],
  pick: (r: IndexRow) => K | undefined,
  groupBy: (r: IndexRow) => string[],
): Share<K>[] {
  const groups = new Map<string, Share<K>>();
  for (const r of rows) {
    const value = pick(r);
    if (!value) continue;
    for (const group of groupBy(r)) {
      const share = groups.get(group) ?? {
        group,
        counts: Object.fromEntries(keys.map((k) => [k, 0])) as Record<
          K,
          number
        >,
        n: 0,
      };
      share.counts[value] += 1;
      share.n += 1;
      groups.set(group, share);
    }
  }
  return [...groups.values()];
}
