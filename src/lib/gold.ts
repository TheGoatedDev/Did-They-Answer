import {
  CRITERIA,
  type Criterion,
  STANCES,
  type Stance,
  type Verdict,
} from "@/db/schema";
import { verdictFor } from "./judge";

/** `tune` labels may guide prompt changes; `holdout` labels only confirm them. */
export type Split = "tune" | "holdout";

export type GoldLabel = {
  petitionId: number;
  inputHash: string;
  split: Split;
  scores: Record<Criterion, number>;
  stance: Stance;
};

/** One annotator's label, as written by a labeller following eval/labelling-brief. */
export type LabellerEntry = {
  petitionId: number;
  scores: Record<Criterion, number>;
  stance: Stance;
  note?: string;
};

export type Adjudication = {
  petitionId: number;
  resolved: Partial<Record<Criterion | "stance", number | string>>;
};

const FIELDS = [...CRITERIA, "stance"] as const;
type Field = (typeof FIELDS)[number];

const fieldValue = (e: LabellerEntry, f: Field) =>
  f === "stance" ? e.stance : e.scores[f];

function checkEntry(e: LabellerEntry, who: string) {
  for (const c of CRITERIA) {
    if (![0, 1, 2].includes(e.scores?.[c])) {
      throw new Error(`${who} #${e.petitionId}: ${c} must be 0, 1 or 2`);
    }
  }
  if (!STANCES.includes(e.stance)) {
    throw new Error(`${who} #${e.petitionId}: unknown stance ${e.stance}`);
  }
}

/** Check two labellers covered the same petitions and list where they differ. */
export function compareLabellers(a: LabellerEntry[], b: LabellerEntry[]) {
  const byId = new Map(b.map((e) => [e.petitionId, e]));
  if (a.length !== b.length || a.some((e) => !byId.has(e.petitionId))) {
    throw new Error("labellers A and B labelled different petitions");
  }
  for (const e of a) checkEntry(e, "labeller A");
  for (const e of b) checkEntry(e, "labeller B");

  const agree = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<
    Field,
    number
  >;
  const disagreements = [];
  for (const ea of a) {
    const eb = byId.get(ea.petitionId) as LabellerEntry;
    const diff: Partial<Record<Field, [unknown, unknown]>> = {};
    for (const f of FIELDS) {
      if (fieldValue(ea, f) === fieldValue(eb, f)) agree[f] += 1;
      else diff[f] = [fieldValue(ea, f), fieldValue(eb, f)];
    }
    if (Object.keys(diff).length > 0) {
      disagreements.push({
        petitionId: ea.petitionId,
        disagreements: diff,
        labeller_a: ea,
        labeller_b: eb,
      });
    }
  }
  const agreement = Object.fromEntries(
    FIELDS.map((f) => [f, agree[f] / a.length]),
  ) as Record<Field, number>;
  return { agreement, disagreements };
}

/** Merge two labellers' work into gold labels, taking the adjudicator's pick where they differ. */
export function mergeLabels(
  sample: { petitionId: number; inputHash: string }[],
  a: LabellerEntry[],
  b: LabellerEntry[],
  adjudicated: Adjudication[],
  split: Split,
): GoldLabel[] {
  const { disagreements } = compareLabellers(a, b);
  const rulings = new Map(adjudicated.map((r) => [r.petitionId, r.resolved]));
  const disputes = new Map(
    disagreements.map((d) => [d.petitionId, d.disagreements]),
  );
  const byId = new Map(a.map((e) => [e.petitionId, e]));

  return sample.map(({ petitionId, inputHash }) => {
    const base = byId.get(petitionId);
    if (!base) throw new Error(`#${petitionId} was not labelled`);
    const label: GoldLabel = {
      petitionId,
      inputHash,
      split,
      scores: { ...base.scores },
      stance: base.stance,
    };
    for (const [field, options] of Object.entries(
      disputes.get(petitionId) ?? {},
    )) {
      const pick = rulings.get(petitionId)?.[field as Field];
      if (pick === undefined) {
        throw new Error(
          `#${petitionId}: ${field} is disputed but not adjudicated`,
        );
      }
      if (!(options as unknown[]).includes(pick)) {
        throw new Error(
          `#${petitionId}: ${field} ruling ${pick} was not one of the labellers' values`,
        );
      }
      if (field === "stance") label.stance = pick as Stance;
      else label.scores[field as Criterion] = pick as number;
    }
    return label;
  });
}

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
