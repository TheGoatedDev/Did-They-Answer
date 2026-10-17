import {
  CRITERIA,
  type Criterion,
  type Stance,
  type Verdict,
} from "@/db/schema";
import { verdictFor } from "./judge";

export type GoldLabel = {
  petitionId: number;
  inputHash: string;
  scores: Record<Criterion, number>;
  stance: Stance;
};

export type EvalItem = {
  petitionId: number;
  action: string;
  label: {
    scores: Record<Criterion, number>;
    stance: Stance;
    verdict: Verdict;
  };
  model: {
    scores: Record<Criterion, number>;
    stance: Stance;
    verdict: Verdict;
  };
};

export type EvalResults = {
  model: string | null;
  promptVersion: number | null;
  ranAt: string | null;
  n: number;
  agreement: Record<Criterion | "stance" | "verdict", number> | null;
  items: EvalItem[];
};

/** Spread the sample across parliaments, then departments, deterministically. */
export function sampleForGold<
  T extends {
    id: number;
    parliament: string;
    departments: { acronym: string }[];
  },
>(rows: T[], size: number): T[] {
  const groups = new Map<string, T[]>();
  for (const row of [...rows].sort((a, b) => scramble(a.id) - scramble(b.id))) {
    const key = row.parliament;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const seenDepartments = new Set<string>();
  const picked: T[] = [];
  const queues = [...groups.values()];
  while (picked.length < size && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (picked.length >= size || queue.length === 0) continue;
      // Prefer a department this sample has not covered yet.
      const index = queue.findIndex(
        (r) => !seenDepartments.has(r.departments[0]?.acronym ?? "none"),
      );
      const [row] = queue.splice(Math.max(index, 0), 1);
      seenDepartments.add(row.departments[0]?.acronym ?? "none");
      picked.push(row);
    }
  }
  return picked;
}

export function summarise(items: EvalItem[]): EvalResults["agreement"] {
  if (items.length === 0) return null;
  const share = (match: (i: EvalItem) => boolean) =>
    items.filter(match).length / items.length;
  return {
    ...(Object.fromEntries(
      CRITERIA.map((c) => [
        c,
        share((i) => Math.round(i.model.scores[c]) === i.label.scores[c]),
      ]),
    ) as Record<Criterion, number>),
    stance: share((i) => i.model.stance === i.label.stance),
    verdict: share((i) => i.model.verdict === i.label.verdict),
  };
}

export function labelVerdict(scores: Record<Criterion, number>) {
  return verdictFor(CRITERIA.reduce((sum, c) => sum + scores[c], 0));
}

export function disagrees(item: EvalItem) {
  return (
    item.model.verdict !== item.label.verdict ||
    item.model.stance !== item.label.stance ||
    CRITERIA.some(
      (c) => Math.round(item.model.scores[c]) !== item.label.scores[c],
    )
  );
}

// Knuth multiplicative hash: a stable shuffle without randomness.
function scramble(id: number) {
  return (id * 2654435761) % 2 ** 32;
}
