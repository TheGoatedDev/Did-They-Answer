import type { Share } from "@/lib/filters";
import { numberFormat } from "@/lib/labels";

export type Category<K extends string> = {
  key: K;
  label: string;
  swatch: string;
};

const pct = (part: number, n: number) => `${Math.round((part / n) * 100)}%`;

export function Legend<K extends string>({
  categories,
}: {
  categories: readonly Category<K>[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
      {categories.map((c) => (
        <li key={c.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`size-3 rounded-sm ${c.swatch}`} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

/** 100% stacked bars, one per group, with the same numbers as a table underneath. */
export function ShareBars<K extends string>({
  caption,
  categories,
  shares,
  unit = "Responses",
}: {
  caption: string;
  unit?: string;
  categories: readonly Category<K>[];
  shares: (Share<K> & { label: string })[];
}) {
  return (
    <figure className="grid gap-3">
      <figcaption className="font-heading text-xl font-semibold">
        {caption}
      </figcaption>
      <Legend categories={categories} />
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
              {categories
                .filter((c) => s.counts[c.key] > 0)
                .map((c) => (
                  <div
                    key={c.key}
                    className={`h-full first:rounded-l last:rounded-r ${c.swatch}`}
                    style={{ width: pct(s.counts[c.key], s.n) }}
                    title={`${c.label}: ${pct(s.counts[c.key], s.n)} (${s.counts[c.key]} of ${s.n})`}
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
              {categories.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="py-1 pr-4 text-right font-medium"
                >
                  {c.label}
                </th>
              ))}
              <th scope="col" className="py-1 text-right font-medium">
                {unit}
              </th>
            </tr>
          </thead>
          <tbody>
            {shares.map((s) => (
              <tr key={s.group} className="border-b">
                <th scope="row" className="py-1 pr-4 font-normal">
                  {s.label}
                </th>
                {categories.map((c) => (
                  <td key={c.key} className="py-1 pr-4 text-right tabular-nums">
                    {pct(s.counts[c.key], s.n)}
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
