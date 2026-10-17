# Prompt iterations

Record of the prompt versions tested against version 1, and why version 1 is still current. Tested 2026-10-17 with `typesafe/jev-1.14-20261014`.

## Method

- **Tuning set:** the original 30 gold responses.
- **Holdout set:** 30 more responses, 6 from each parliament, labelled blind and only used to confirm a candidate.
- **Labels:** each set was labelled independently by two Claude agents, with disagreements settled by a third. When a version changed a definition, the affected field was relabelled under the new wording.
- **Bar, fixed before testing:** verdict agreement at least v1's, stance agreement at least 85%, and fewer petitions flagged as low confidence than v1 on a fixed 200-petition sample. To be adopted, a version also had to beat v1 on the holdout set.
- **Noise:** Jev's answers vary between runs by about one response in 30 (3 points), so smaller differences are not meaningful.

## Results

| Version | Change from v1 | Tuning set | Holdout set | Outcome |
|---|---|---|---|---|
| v2 | Concrete signals for specificity; sharper stance definitions | Verdict 83%, stance 83% | not run | Failed the stance bar: refusals drifted into "deflects" |
| v3 | v2's specificity wording only | Verdict 85% (2 runs), stance 90%, 40% flagged | Verdict 87%, stance 80%, specificity 57% (v1: 88%) | Gains did not carry over |
| v4 | v3 plus "answering specific points counts as specific" | Verdict 80–83%, specificity confidence worse | not run | No better than v3 |
| v5 | Specificity split into two yes/no questions | Specificity 50%, all misses 2 scored as 1 | not run | Worse |
| v6 | Clarified what counts as a commitment or a reasoned refusal | Outcome 80% (v1: 73%) | Outcome 63% (v1: 70%) | Overfitted to the tuning set |

On the holdout set v1 scored verdict 83%, stance 80% and specificity 88%.

## Findings

- Wording changes produced differences of about one response, the same size as run-to-run noise.
- About 27% of petitions are flagged on stance confidence alone. Responses that neither clearly accept nor clearly refuse are genuinely ambiguous, so this is a floor that no criterion wording can lower.
- Outcome is the weakest criterion in every version, at about 70% agreement, with Jev scoring higher than the labels.
- The gold set now holds all 60 labelled responses, which gives a steadier agreement estimate than 30.

## Next steps

Telling apart versions that differ by 5 points needs a gold set of a few hundred responses, or human labels.
