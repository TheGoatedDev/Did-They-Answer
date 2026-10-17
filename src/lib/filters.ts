import { STANCES, type Stance, VERDICTS, type Verdict } from "@/db/schema";
import type { IndexRow } from "./queries";

export const PAGE_SIZE = 50;
const SORTS = ["signatures", "newest", "score"] as const;

export type Filters = {
  verdict?: Verdict;
  stance?: Stance;
  department?: string;
  parliament?: string;
  topic?: string;
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
      (!f.topic || r.topics.includes(f.topic)),
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

export function verdictShares(
  rows: IndexRow[],
  groupBy: (r: IndexRow) => string[],
) {
  const groups = new Map<string, Record<Verdict, number>>();
  for (const r of rows) {
    const verdict = r.assessment?.verdict;
    if (!verdict) continue;
    for (const key of groupBy(r)) {
      const counts = groups.get(key) ?? { low: 0, some: 0, thorough: 0 };
      counts[verdict] += 1;
      groups.set(key, counts);
    }
  }
  return [...groups].map(([group, counts]) => ({
    group,
    counts,
    n: counts.low + counts.some + counts.thorough,
  }));
}
