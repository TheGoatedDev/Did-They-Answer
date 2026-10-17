import type { Metadata } from "next";
import Link from "next/link";
import { CRITERIA, STANCES, VERDICTS } from "@/db/schema";
import { disagrees, type EvalResults, type GoldLabel } from "@/lib/gold";
import { MODEL, PROMPT_VERSION, RUBRIC, STANCE_OPTIONS } from "@/lib/judge";
import { CRITERION_LABELS, STANCE_LABELS, VERDICT_LABELS } from "@/lib/labels";
import goldJson from "../../../eval/gold.json";
import resultsJson from "../../../eval/results.json";

export const metadata: Metadata = { title: "Methodology" };

const gold = goldJson as GoldLabel[];
const results = resultsJson as EvalResults;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const VERDICT_RANGES = {
  low: "below 4",
  some: "4 to under 7",
  thorough: "7 or more",
};

export default function MethodologyPage() {
  const disagreements = results.items.filter(disagrees);
  return (
    <article className="grid max-w-3xl gap-10 leading-relaxed">
      <header className="grid gap-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">
          Methodology
        </h1>
        <p className="text-lg text-muted-foreground">
          What the scores measure, how they are produced, and how far to trust
          them.
        </p>
      </header>

      <section className="grid gap-3">
        <h2 className="font-heading text-2xl font-semibold">
          What is assessed
        </h2>
        <p>
          The government responds in writing to every petition on the UK
          Parliament petitions site that reaches 10,000 signatures. This site
          covers those responses from the 2010–15 parliament to today. It
          assesses the written response only: not the petition, not any later
          debate, and not whether the government&apos;s position is right.
        </p>
        <p>
          The scores describe how a response engages with a petition. They say
          nothing about the intent of the people who wrote it.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-heading text-2xl font-semibold">The rubric</h2>
        <p>
          Each response is scored from 0 to 2 on five criteria. The five scores
          are added together, with equal weight, for a total out of 10.
        </p>
        <ol className="grid list-decimal gap-4 pl-6">
          {CRITERIA.map((c) => (
            <li key={c}>
              <p className="font-medium">
                {CRITERION_LABELS[c]}: {String(RUBRIC[c].instructions)}
              </p>
              <ul className="mt-1 text-muted-foreground">
                {RUBRIC[c].criteria.map((level, n) => (
                  <li key={String(level)}>
                    {n}: {level}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p>The total maps to one of three labels:</p>
        <ul className="list-disc pl-6">
          {VERDICTS.map((v) => (
            <li key={v}>
              <strong>{VERDICT_LABELS[v]}</strong>: {VERDICT_RANGES[v]}
            </li>
          ))}
        </ul>
        <p>Each response is also given a stance:</p>
        <ul className="list-disc pl-6">
          {STANCES.map((s) => (
            <li key={s}>
              <strong>{STANCE_LABELS[s]}</strong>: {STANCE_OPTIONS[s]}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="font-heading text-2xl font-semibold">
          How the scores are made
        </h2>
        <p>
          The scoring is automated. Each response goes to{" "}
          <a
            href="https://openrouter.ai/typesafe/jev-1.14"
            className="underline underline-offset-4"
          >
            {MODEL}
          </a>
          , a decision model that answers fixed questions by choosing between
          the options it is given. It writes no text of its own, so it cannot
          invent reasons or quotes. The highlighted evidence on each petition
          page is a sentence from the response itself, picked by the model.
        </p>
        <p>
          The model reports its confidence in each answer. If it falls below 60%
          on any criterion or on the stance, the assessment is marked{" "}
          <em>low confidence</em>. These assessments are still shown, because
          hiding them selectively would be worse than showing the uncertainty.
        </p>
        <p>
          This is prompt version {PROMPT_VERSION}. When the questions change,
          every response is assessed again and the old results are kept for
          comparison.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-heading text-2xl font-semibold">
          Checking the model against independent labels
        </h2>
        {results.agreement ? (
          <>
            <p>
              {results.n} responses were labelled with the same rubric, then
              scored by the model. The labels were not written by people. Two
              Claude AI agents labelled every response independently, without
              seeing the model&apos;s scores or each other&apos;s labels, and a
              third agent settled any disagreements. This checks the model
              against a different AI. It is not a human review. Agreement with
              the labels:
            </p>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Agreement between the model and the check-set labels
              </caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-1 font-medium">
                    Measure
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Agreement
                  </th>
                </tr>
              </thead>
              <tbody>
                {CRITERIA.map((c) => (
                  <tr key={c} className="border-b">
                    <th scope="row" className="py-1 font-normal">
                      {CRITERION_LABELS[c]}
                    </th>
                    <td className="py-1 text-right tabular-nums">
                      {pct(results.agreement?.[c] ?? 0)}
                    </td>
                  </tr>
                ))}
                <tr className="border-b">
                  <th scope="row" className="py-1 font-normal">
                    Stance
                  </th>
                  <td className="py-1 text-right tabular-nums">
                    {pct(results.agreement.stance)}
                  </td>
                </tr>
                <tr className="border-b">
                  <th scope="row" className="py-1 font-medium">
                    Overall label
                  </th>
                  <td className="py-1 text-right font-medium tabular-nums">
                    {pct(results.agreement.verdict)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-sm text-muted-foreground">
              Run {results.ranAt?.slice(0, 10)} with {results.model}. A
              criterion agrees when the model&apos;s score, rounded, equals the
              label.
            </p>
            {disagreements.length > 0 && (
              <>
                <h3 className="font-heading text-xl font-semibold">
                  Where they disagreed
                </h3>
                <ul className="grid gap-2">
                  {disagreements.map((d) => (
                    <li key={d.petitionId}>
                      <Link
                        href={`/petitions/${d.petitionId}`}
                        className="underline underline-offset-4"
                      >
                        {d.action}
                      </Link>
                      : label {VERDICT_LABELS[d.label.verdict]} (
                      {STANCE_LABELS[d.label.stance]}), model{" "}
                      {VERDICT_LABELS[d.model.verdict]} (
                      {STANCE_LABELS[d.model.stance]})
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p>
            A labelled check set is being prepared ({gold.length} of 30 labelled
            so far). Until it is published here, treat the scores as
            unvalidated.
          </p>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-heading text-2xl font-semibold">
          Disagree with an assessment?
        </h2>
        <p>
          Every petition page has a <em>Dispute this assessment</em> link. It
          opens a public issue on{" "}
          <a
            href="https://github.com/TheGoatedDev/did-they-answer/issues"
            className="underline underline-offset-4"
          >
            GitHub
          </a>
          , where the code, rubric and check-set labels also live.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-heading text-2xl font-semibold">Data</h2>
        <p>
          Petition and response text comes from the{" "}
          <a
            href="https://petition.parliament.uk"
            className="underline underline-offset-4"
          >
            UK Parliament petitions site
          </a>{" "}
          and is updated daily. Contains Parliamentary information licensed
          under the{" "}
          <a
            href="https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/"
            className="underline underline-offset-4"
          >
            Open Parliament Licence v3.0
          </a>
          .
        </p>
      </section>
    </article>
  );
}
