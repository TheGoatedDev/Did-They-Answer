import { VERDICTS } from "@/db/schema";
import type { verdictShares } from "@/lib/filters";
import { numberFormat, VERDICT_LABELS } from "@/lib/labels";
import { VERDICT_SWATCH } from "./verdict";

type Share = ReturnType<typeof verdictShares>[number] & { label: string };

const pct = (part: number, n: number) => `${Math.round((part / n) * 100)}%`;

export function VerdictLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
      {VERDICTS.map((v) => (
        <li key={v} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={`size-3 rounded-sm ${VERDICT_SWATCH[v]}`}
          />
          {VERDICT_LABELS[v]}
        </li>
      ))}
    </ul>
  );
}

/** 100% stacked bars, one per group, with the same numbers as a table underneath. */
export function VerdictBars({
  caption,
  shares,
}: {
  caption: string;
  shares: Share[];
}) {
  return (
    <figure className="grid gap-3">
      <figcaption className="font-heading text-xl font-semibold">
        {caption}
      </figcaption>
      <div aria-hidden className="grid gap-2">
        {shares.map((s) => (
          <div
            key={s.group}
            className="grid grid-cols-[minmax(0,18rem)_1fr_4rem] items-center gap-3 text-sm"
          >
            <span className="truncate" title={s.label}>
              {s.label}
            </span>
            <div className="flex h-5 gap-0.5">
              {VERDICTS.filter((v) => s.counts[v] > 0).map((v) => (
                <div
                  key={v}
                  className={`h-full first:rounded-l last:rounded-r ${VERDICT_SWATCH[v]}`}
                  style={{ width: pct(s.counts[v], s.n) }}
                  title={`${VERDICT_LABELS[v]}: ${pct(s.counts[v], s.n)} (${s.counts[v]} of ${s.n})`}
                />
              ))}
            </div>
            <span className="text-right text-muted-foreground tabular-nums">
              n={numberFormat.format(s.n)}
            </span>
          </div>
        ))}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer underline underline-offset-4">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-1 pr-4 font-medium">
                Group
              </th>
              {VERDICTS.map((v) => (
                <th
                  key={v}
                  scope="col"
                  className="py-1 pr-4 text-right font-medium"
                >
                  {VERDICT_LABELS[v]}
                </th>
              ))}
              <th scope="col" className="py-1 text-right font-medium">
                Responses
              </th>
            </tr>
          </thead>
          <tbody>
            {shares.map((s) => (
              <tr key={s.group} className="border-b">
                <th scope="row" className="py-1 pr-4 font-normal">
                  {s.label}
                </th>
                {VERDICTS.map((v) => (
                  <td key={v} className="py-1 pr-4 text-right tabular-nums">
                    {pct(s.counts[v], s.n)}
                  </td>
                ))}
                <td className="py-1 text-right tabular-nums">{s.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
