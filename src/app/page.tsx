import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VerdictLabel } from "@/components/verdict";
import { STANCES, VERDICTS } from "@/db/schema";
import {
  applyFilters,
  type Filters,
  facets,
  hrefWith,
  parseFilters,
} from "@/lib/filters";
import {
  numberFormat,
  parliamentLabel,
  STANCE_LABELS,
  VERDICT_LABELS,
} from "@/lib/labels";
import { getIndex } from "@/lib/queries";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="grid gap-8">
      <section className="max-w-3xl">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          When the government answers a petition, does it engage?
        </h1>
        <p className="mt-4 text-lg text-pretty text-muted-foreground">
          Every petition that reaches 10,000 signatures gets a written
          government response. Each response here is scored on whether it
          addresses the ask, cites evidence, explains its reasoning and commits
          to an outcome.{" "}
          <Link
            href="/methodology"
            className="text-foreground underline underline-offset-4"
          >
            How the scoring works
          </Link>
          .
        </p>
      </section>
      <Suspense
        fallback={<p className="text-muted-foreground">Loading petitions…</p>}
      >
        <PetitionList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PetitionList({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const filters = parseFilters(await searchParams);
  const all = await getIndex();
  const { rows, total, page, pages } = applyFilters(all, filters);

  return (
    <section aria-labelledby="results-heading" className="grid gap-4">
      <h2 id="results-heading" className="sr-only">
        Petitions
      </h2>
      <FilterForm filters={filters} options={facets(all)} />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {numberFormat.format(total)} of {numberFormat.format(all.length)}{" "}
        petitions
      </p>
      {rows.length === 0 ? (
        <p>No petitions match these filters.</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Petitions with a government response, page {page} of {pages}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[45%]">Petition</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Parliament</TableHead>
              <TableHead className="text-right">Signatures</TableHead>
              <TableHead>Stance</TableHead>
              <TableHead>Assessment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-normal">
                  <Link
                    href={`/petitions/${r.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.action}
                  </Link>
                </TableCell>
                <TableCell>
                  {r.departments.map((d) => (
                    <abbr
                      key={d.acronym}
                      title={d.name}
                      className="mr-1 no-underline"
                    >
                      {d.acronym}
                    </abbr>
                  ))}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {parliamentLabel(r.parliament)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {numberFormat.format(r.signatureCount)}
                </TableCell>
                <TableCell>
                  {r.assessment ? STANCE_LABELS[r.assessment.stance] : "—"}
                </TableCell>
                <TableCell>
                  {r.assessment ? (
                    <VerdictLabel {...r.assessment} />
                  ) : (
                    <span className="text-muted-foreground">
                      Not yet assessed
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {pages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between text-sm"
        >
          {page > 1 ? (
            <Link
              href={hrefWith(filters, { page: page - 1 })}
              className="underline underline-offset-4"
            >
              Previous page
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={hrefWith(filters, { page: page + 1 })}
              className="underline underline-offset-4"
            >
              Next page
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

function FilterForm({
  filters,
  options,
}: {
  filters: Filters;
  options: ReturnType<typeof facets>;
}) {
  const select = (
    name: keyof Filters,
    label: string,
    choices: [value: string, label: string][],
    anyLabel = "Any",
  ) => (
    <div className="grid gap-1 text-sm font-medium">
      <label htmlFor={`filter-${name}`}>{label}</label>
      <NativeSelect
        id={`filter-${name}`}
        name={name}
        defaultValue={String(filters[name] ?? "")}
        className="w-full"
      >
        {anyLabel && (
          <NativeSelectOption value="">{anyLabel}</NativeSelectOption>
        )}
        {choices.map(([value, text]) => (
          <NativeSelectOption key={value} value={value}>
            {text}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );

  return (
    <form
      method="get"
      action="/"
      className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-6"
    >
      {select(
        "verdict",
        "Assessment",
        VERDICTS.map((v) => [v, VERDICT_LABELS[v]]),
      )}
      {select(
        "stance",
        "Stance",
        STANCES.map((s) => [s, STANCE_LABELS[s]]),
      )}
      {select("department", "Department", options.departments)}
      {select(
        "parliament",
        "Parliament",
        options.parliaments.map((p) => [p, parliamentLabel(p)]),
      )}
      {options.topics.length > 0 &&
        select(
          "topic",
          "Topic",
          options.topics.map((t) => [t, t]),
        )}
      {select(
        "sort",
        "Sort by",
        [
          ["signatures", "Most signatures"],
          ["newest", "Newest response"],
          ["score", "Lowest score"],
        ],
        "",
      )}
      <div className="flex items-end gap-3">
        <Button type="submit">Apply</Button>
        <Link href="/" className="pb-1.5 text-sm underline underline-offset-4">
          Clear
        </Link>
      </div>
    </form>
  );
}
