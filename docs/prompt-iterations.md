# Prompt iterations

Record of the prompt changes tested, and why the current version won. All runs used `typesafe/jev-1.14-20261014`, on 2026-10-17.

## Current: v2

v2 adds one sentence to the outcome question in v1:

> Describing existing policy or saying it will keep the matter under review is not a commitment, and a refusal only counts as reasoned if it explains why the request will not be met.

Results on the 200-label gold set, averaged over 2 runs:

| Field | v1 | v2 | v2 tune | v2 holdout |
|---|---|---|---|---|
| Addresses the ask | 87% | 88% | 88% | 87% |
| Evidence | 78% | 78% | 79% | 78% |
| Reasoning | 82% | 83% | 83% | 82% |
| Outcome | **64%** | **74%** | 76% | 72% (v1: 67%) |
| Specificity | 72% | 71% | 71% | 72% |
| Stance | 84% | 84% | 86% | 82% |
| Verdict | 83% | 85% | 81% | 90% (v1: 88%) |
| Flagged low confidence | 46% | 50% | | |

- Under v1, Jev rated vague promises as firm commitments: 53 of its 72 outcome misses were a 1 scored as 2. Under v2 that count is 28.
- The gain is larger on the tuning half (+15) than on the holdout (+5). Part of the tuning gain is fit to those labels, or to how those labellers read the outcome levels.
- v2 flags about 4 points more responses as low confidence than v1.

## Method

- **Gold set:** `eval/gold.json`, 200 labelled responses, split 100 `tune` and 100 `holdout`. Changes are developed against `tune` and confirmed once on `holdout`.
- **Labelling:** each batch was labelled blind by two Claude agents, with disagreements settled by a third (`pnpm gold:export` and `pnpm gold:merge`).
- **Runs:** results are averaged over 2 runs, because Jev's answers vary by a few points from run to run.
- **Baseline:** v1 was measured with the same set and the same runs.

## Rejected candidates

These were tested on the earlier 30- and 60-label sets.

| Candidate | Change | Why rejected |
|---|---|---|
| A | Concrete signals for specificity, plus sharper stance definitions | Refusals drifted into "deflects": stance fell from 90% to 77–83% |
| B | Candidate A's specificity wording only | Better on the tuning set; on the holdout, specificity was 57% against v1's 88% |
| C | B plus "answering specific points counts as specific" | No better than B |
| D | Specificity split into two yes/no questions | Worse: 15 of 30 tuning labels scored 2 by the labellers came out as 1 |
| E | Reasoning and evidence clarifications, added on top of v2 (200-label set) | Reasoning overshot from 83% to 69%; evidence unchanged |

The outcome clarification (v2) first looked like overfitting on the 30-label holdout (70% to 63%). The 200-label set showed the gain is real, though smaller on the holdout. Small gold sets can't separate changes of a few points.

## Known limits

- About 27% of responses are flagged on stance confidence alone. Those responses neither clearly accept nor clearly refuse, and no wording change has lowered that floor.
- Specificity is still systematically low: Jev scores a 2 as a 1. Evidence is still slightly high: Jev scores a 0 as a 1.
- The labels come from Claude agents, not people. They check Jev against a different model, which is not the same as human judgement.
