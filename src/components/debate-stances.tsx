import { type Category, ShareBars } from "@/components/share-bars";
import { LowConfidence } from "@/components/verdict";
import { DEBATE_STANCES, type DebateStance, type Stance } from "@/db/schema";
import type { Share } from "@/lib/filters";
import {
  DEBATE_ROLE_LABELS,
  DEBATE_STANCE_LABELS,
  STANCE_LABELS,
} from "@/lib/labels";
import type { DebateStanceRow } from "@/lib/queries";

const LOW_CONFIDENCE = 0.6;

const SWATCH: Record<DebateStance, string> = {
  for: "bg-stance-accepts",
  neutral: "bg-muted-foreground/40",
  against: "bg-stance-declines",
};

const CATEGORIES: Category<DebateStance>[] = DEBATE_STANCES.map((s) => ({
  key: s,
  label: DEBATE_STANCE_LABELS[s],
  swatch: SWATCH[s],
}));

function tally(rows: DebateStanceRow[], group: string): Share<DebateStance> {
  const counts = { for: 0, neutral: 0, against: 0 };
  for (const r of rows) counts[r.stance] += 1;
  return { group, counts, n: rows.length };
}

export function DebateStances({
  rows,
  governmentStance,
}: {
  rows: DebateStanceRow[];
  governmentStance: Stance | null;
}) {
  // The chair, the minister and the opener speak for a role, not themselves.
  const backbench = rows.filter((r) => r.role === null);
  const total = tally(backbench, "All");
  const parties = [...new Set(backbench.map((r) => r.party))]
    .map((party) => ({
      ...tally(
        backbench.filter((r) => r.party === party),
        party,
      ),
      label: party,
    }))
    .sort((a, b) => b.n - a.n);

  return (
    <div className="grid gap-6">
      <p className="text-lg">
        Of {total.n} MPs who spoke in their own right,{" "}
        <strong>{total.counts.for} were for</strong> the petition,{" "}
        {total.counts.neutral} neutral and{" "}
        <strong>{total.counts.against} against</strong>.
        {governmentStance && (
          <>
            {" "}
            The government&apos;s response:{" "}
            <strong>{STANCE_LABELS[governmentStance].toLowerCase()}</strong>.
          </>
        )}
      </p>

      {parties.length > 0 && (
        <ShareBars
          caption="Where MPs stood, by party"
          categories={CATEGORIES}
          shares={parties}
          unit="MPs"
        />
      )}

      <div className="grid gap-2">
        <h3 className="font-heading text-xl font-semibold">Every speaker</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Each MP who spoke and where they stood on the petition
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-1 pr-4 font-medium">
                  MP
                </th>
                <th scope="col" className="py-1 pr-4 font-medium">
                  Party
                </th>
                <th scope="col" className="py-1 pr-4 font-medium">
                  Stance
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Speeches
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.memberId} className="border-b align-top">
                  <th scope="row" className="py-1.5 pr-4 font-normal">
                    {r.name}
                    {r.role && (
                      <span className="ml-2 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                        {DEBATE_ROLE_LABELS[r.role]}
                      </span>
                    )}
                  </th>
                  <td className="py-1.5 pr-4">{r.party}</td>
                  <td className="py-1.5 pr-4">
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={`size-2.5 rounded-sm ${SWATCH[r.stance]}`}
                        />
                        {DEBATE_STANCE_LABELS[r.stance]}
                      </span>
                      {r.confidence < LOW_CONFIDENCE && <LowConfidence />}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.speeches}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Automated rating by {rows[0]?.model} from each MP&apos;s words in the
        Hansard transcript. Party is the one held on the debate date. The chair,
        the minister and the MP who opened the debate are listed but left out of
        the totals. Neutral includes MPs who did not discuss this petition.
      </p>
    </div>
  );
}
