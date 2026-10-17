import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VerdictBars, VerdictLegend } from "@/components/verdict-bars";
import { verdictShares } from "@/lib/filters";
import { parliamentLabel } from "@/lib/labels";
import { getIndex } from "@/lib/queries";

export const metadata: Metadata = { title: "Compare" };

// Departments with fewer assessed responses than this are too noisy to compare.
const MIN_RESPONSES = 10;

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <div className="grid gap-8">
      <section className="max-w-3xl">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">
          Compare
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          The share of government responses at each level of engagement, by
          parliament and by department.
        </p>
      </section>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Charts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Charts({
  searchParams,
}: Pick<PageProps<"/compare">, "searchParams">) {
  const refusals = (await searchParams).only === "refusals";
  const rows = (await getIndex()).filter(
    (r) =>
      !refusals ||
      r.assessment?.stance === "declines" ||
      r.assessment?.stance === "deflects",
  );
  const byParliament = verdictShares(rows, (r) => [r.parliament])
    .sort((a, b) => a.group.localeCompare(b.group))
    .map((s) => ({ ...s, label: parliamentLabel(s.group) }));
  const names = new Map(
    rows.flatMap((r) => r.departments.map((d) => [d.acronym, d.name])),
  );
  const byDepartment = verdictShares(rows, (r) =>
    r.departments.map((d) => d.acronym),
  )
    .filter((s) => s.n >= MIN_RESPONSES)
    .sort((a, b) => b.counts.low / b.n - a.counts.low / a.n)
    .map((s) => ({ ...s, label: names.get(s.group) ?? s.group }));

  if (byParliament.length === 0) {
    return <p>No responses have been assessed yet.</p>;
  }

  return (
    <div className="grid gap-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Which responses" className="flex gap-4 text-sm">
          <FilterLink href="/compare" current={!refusals}>
            All responses
          </FilterLink>
          <FilterLink href="/compare?only=refusals" current={refusals}>
            Only when the government declined or deflected
          </FilterLink>
        </nav>
        <VerdictLegend />
      </div>
      <VerdictBars caption="By parliament" shares={byParliament} />
      <VerdictBars
        caption={`By department (at least ${MIN_RESPONSES} responses), most low engagement first`}
        shares={byDepartment}
      />
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
