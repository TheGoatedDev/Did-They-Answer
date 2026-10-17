import { TriangleAlertIcon } from "lucide-react";
import type { Verdict } from "@/db/schema";
import { VERDICT_LABELS } from "@/lib/labels";

export const VERDICT_SWATCH: Record<Verdict, string> = {
  low: "bg-verdict-low",
  some: "bg-verdict-some",
  thorough: "bg-verdict-thorough",
};

export function VerdictLabel({
  verdict,
  total,
  needsReview,
}: {
  verdict: Verdict;
  total: number;
  needsReview: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span
          aria-hidden
          className={`size-2.5 rounded-sm ${VERDICT_SWATCH[verdict]}`}
        />
        <span className="font-medium">{VERDICT_LABELS[verdict]}</span>
        <span className="text-muted-foreground tabular-nums">
          {total.toFixed(1)}
          <span className="sr-only"> out of 10</span>
          <span aria-hidden>/10</span>
        </span>
      </span>
      {needsReview && <LowConfidence />}
    </span>
  );
}

export function LowConfidence() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-amber-800">
      <TriangleAlertIcon aria-hidden className="size-3.5" />
      Low confidence
    </span>
  );
}
