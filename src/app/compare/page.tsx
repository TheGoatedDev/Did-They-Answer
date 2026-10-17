import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { type Category, ShareBars } from "@/components/share-bars";
import { VERDICT_SWATCH } from "@/components/verdict";
import { STANCES, type Stance, VERDICTS, type Verdict } from "@/db/schema";
import { type Share, shares } from "@/lib/filters";
import { parliamentLabel, STANCE_LABELS, VERDICT_LABELS } from "@/lib/labels";
import { getIndex, type IndexRow } from "@/lib/queries";

export const metadata: Metadata = { title: "Compare" };

// Departments with fewer assessed responses than this are too noisy to compare.
const MIN_RESPONSES = 10;

const VERDICT_CATEGORIES: Category<Verdict>[] = VERDICTS.map((v) => ({
  key: v,
  label: VERDICT_LABELS[v],
  swatch: VERDICT_SWATCH[v],
}));

const STANCE_SWATCH: Record<Stance, string> = {
  accepts: "bg-stance-accepts",
  partially_accepts: "bg-stance-partially-accepts",
  declines: "bg-stance-declines",
  deflects: "bg-stance-deflects",
};
const STANCE_CATEGORIES: Category<Stance>[] = STANCES.map((s) => ({
  key: s,
  label: STANCE_LABELS[s],
  swatch: STANCE_SWATCH[s],
}));

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <div className="grid gap-8">
      <section className="max-w-3xl">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">
          Compare
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          How the government answered petitions, and how thoroughly it engaged,
          by parliament and by department.
        </p>
      </section>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Charts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** One "All parliaments" row, then one row per parliament and per department. */
function breakdowns<K extends string>(
  rows: IndexRow[],
  keys: readonly K[],
  pick: (r: IndexRow) => K | undefined,
) {
  const label = <T extends Share<K>>(
    list: T[],
    name: (group: string) => string,
  ) => list.map((s) => ({ ...s, label: name(s.group) }));
  const names = new Map(
    rows.flatMap((r) => r.departments.map((d) => [d.acronym, d.name])),
  );
  return {
    byParliament: label(
      [
        ...shares(rows, keys, pick, () => ["all"]),
        ...shares(rows, keys, pick, (r) => [r.parliament]).sort((a, b) =>
          a.group.localeCompare(b.group),
        ),
      ],
      (g) => (g === "all" ? "All parliaments" : parliamentLabel(g)),
    ),
    byDepartment: label(
      shares(rows, keys, pick, (r) => r.departments.map((d) => d.acronym))
        .filter((s) => s.n >= MIN_RESPONSES)
        .sort((a, b) => b.n - a.n),
      (g) => names.get(g) ?? g,
    ),
  };
}

async function Charts({
  searchParams,
}: Pick<PageProps<"/compare">, "searchParams">) {
  const refusals = (await searchParams).only === "refusals";
  const all = await getIndex();
  const rows = all.filter(
    (r) =>
      !refusals ||
      r.assessment?.stance === "declines" ||
      r.assessment?.stance === "deflects",
  );
  if (!rows.some((r) => r.assessment)) {
    return <p>No responses have been assessed yet.</p>;
  }
  const verdicts = breakdowns(rows, VERDICTS, (r) => r.assessment?.verdict);
  const stances = breakdowns(all, STANCES, (r) => r.assessment?.stance);

  return (
    <div className="grid gap-12">
      <section aria-labelledby="stance-heading" className="grid gap-8">
        <div className="grid gap-2">
          <h2
            id="stance-heading"
            className="font-heading text-3xl font-semibold"
          >
            What the government said
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            The stance each response takes on what the petition asked for.
            Departments are ordered by how many responses they wrote.
          </p>
        </div>
        <ShareBars
          caption="Stance by parliament"
          categories={STANCE_CATEGORIES}
          shares={stances.byParliament}
        />
        <ShareBars
          caption={`Stance by department (at least ${MIN_RESPONSES} responses)`}
          categories={STANCE_CATEGORIES}
          shares={stances.byDepartment}
        />
      </section>

      <section aria-labelledby="engagement-heading" className="grid gap-8">
        <div className="grid gap-2">
          <h2
            id="engagement-heading"
            className="font-heading text-3xl font-semibold"
          >
            How thoroughly it engaged
          </h2>
          <nav
            aria-label="Which responses"
            className="flex flex-wrap gap-4 text-sm"
          >
            <FilterLink href="/compare" current={!refusals}>
              All responses
            </FilterLink>
            <FilterLink href="/compare?only=refusals" current={refusals}>
              Only when the government declined or deflected
            </FilterLink>
          </nav>
        </div>
        <ShareBars
          caption="Engagement by parliament"
          categories={VERDICT_CATEGORIES}
          shares={verdicts.byParliament}
        />
        <ShareBars
          caption={`Engagement by department (at least ${MIN_RESPONSES} responses)`}
          categories={VERDICT_CATEGORIES}
          shares={verdicts.byDepartment}
        />
      </section>
    </div>
  );
}

function FilterLink({
  href,
  current,
  children,
}: {
  href: "/compare" | "/compare?only=refusals";
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        current
          ? "font-semibold underline underline-offset-4"
          : "underline-offset-4 hover:underline"
      }
    >
      {children}
    </Link>
  );
}
