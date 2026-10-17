import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  LowConfidence,
  VERDICT_SWATCH,
  VerdictLabel,
} from "@/components/verdict";
import { CRITERIA } from "@/db/schema";
import { RUBRIC } from "@/lib/judge";
import {
  CRITERION_LABELS,
  dateFormat,
  numberFormat,
  parliamentLabel,
  STANCE_LABELS,
} from "@/lib/labels";
import { sourceUrl } from "@/lib/petitions-api";
import { getPetition } from "@/lib/queries";

const REPO = "https://github.com/TheGoatedDev/did-they-answer";

async function load(params: PageProps<"/petitions/[id]">["params"]) {
  const id = Number((await params).id);
  const data = Number.isSafeInteger(id) ? await getPetition(id) : null;
  if (!data) notFound();
  return data;
}

export async function generateMetadata({
  params,
}: PageProps<"/petitions/[id]">): Promise<Metadata> {
  const { petition } = await load(params);
  return { title: petition.action };
}

export default function Page({ params }: PageProps<"/petitions/[id]">) {
  return (
    <Suspense
      fallback={<p className="text-muted-foreground">Loading petition…</p>}
    >
      <PetitionDetail params={params} />
    </Suspense>
  );
}

async function PetitionDetail({
  params,
}: Pick<PageProps<"/petitions/[id]">, "params">) {
  const { petition: p, assessment: a } = await load(params);
  const disputeUrl = `${REPO}/issues/new?${new URLSearchParams({
    template: "dispute.yml",
    title: `Dispute: petition ${p.id}`,
    petition: String(p.id),
    prompt_version: String(a?.promptVersion ?? ""),
  })}`;

  return (
    <article className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-8">
        <header className="grid gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {p.action}
          </h1>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <Meta label="Parliament" value={parliamentLabel(p.parliament)} />
            <Meta
              label="Signatures"
              value={numberFormat.format(p.signatureCount)}
            />
            {p.respondedOn && (
              <Meta
                label="Responded"
                value={dateFormat.format(new Date(p.respondedOn))}
              />
            )}
            {p.departments.length > 0 && (
              <Meta
                label="Department"
                value={p.departments.map((d) => d.name).join(", ")}
              />
            )}
          </dl>
          <a
            href={sourceUrl(p.id, p.parliament)}
            className="text-sm underline underline-offset-4"
          >
            View on the Parliament petitions site
          </a>
        </header>

        <section aria-labelledby="petition-heading" className="grid gap-3">
          <h2
            id="petition-heading"
            className="font-heading text-2xl font-semibold"
          >
            The petition
          </h2>
          {p.background && <Paragraphs text={p.background} />}
          {p.additionalDetails && <Paragraphs text={p.additionalDetails} />}
        </section>

        <section aria-labelledby="response-heading" className="grid gap-3">
          <h2
            id="response-heading"
            className="font-heading text-2xl font-semibold"
          >
            The government&apos;s response
          </h2>
          {p.responseSummary && (
            <p className="text-lg font-medium">{p.responseSummary}</p>
          )}
          {p.responseDetails && (
            <Paragraphs
              text={p.responseDetails}
              highlight={a?.evidenceSentence ?? null}
            />
          )}
          {a?.evidenceSentence && (
            <p className="text-sm text-muted-foreground">
              <mark className="bg-verdict-low/40 px-0.5">Highlighted</mark>: the
              sentence the model picked as the strongest evidence cited.
            </p>
          )}
        </section>

        {p.debate?.debated_on && (
          <section aria-labelledby="debate-heading" className="grid gap-2">
            <h2
              id="debate-heading"
              className="font-heading text-2xl font-semibold"
            >
              Debate
            </h2>
            <p>
              Debated in Parliament on{" "}
              {dateFormat.format(new Date(p.debate.debated_on))}. This is shown
              for context and is not part of the assessment.
            </p>
            <ul className="flex flex-wrap gap-4 text-sm">
              {p.debate.transcript_url && (
                <li>
                  <a
                    href={p.debate.transcript_url}
                    className="underline underline-offset-4"
                  >
                    Transcript
                  </a>
                </li>
              )}
              {p.debate.video_url && (
                <li>
                  <a
                    href={p.debate.video_url}
                    className="underline underline-offset-4"
                  >
                    Video
                  </a>
                </li>
              )}
            </ul>
          </section>
        )}
      </div>

      <aside
        aria-labelledby="assessment-heading"
        className="grid content-start gap-4 self-start rounded-lg border p-5 lg:sticky lg:top-6"
      >
        <h2
          id="assessment-heading"
          className="font-heading text-xl font-semibold"
        >
          Assessment
        </h2>
        {a ? (
          <>
            <p className="text-lg">
              <VerdictLabel
                verdict={a.verdict}
                total={a.total}
                needsReview={false}
              />
            </p>
            <p className="text-sm">
              Stance: <strong>{STANCE_LABELS[a.stance]}</strong>
            </p>
            {a.needsReview && (
              <p className="text-sm">
                <LowConfidence /> The model was unsure about at least one
                answer, so treat this assessment with care.
              </p>
            )}
            <ul className="grid gap-4">
              {CRITERIA.map((c) => {
                const score = a.scores[c];
                const level = RUBRIC[c].criteria[Math.round(score)];
                return (
                  <li key={c} className="grid gap-1">
                    <div className="flex justify-between text-sm font-medium">
                      <span>{CRITERION_LABELS[c]}</span>
                      <span className="tabular-nums">
                        {score.toFixed(1)} of 2
                      </span>
                    </div>
                    <div aria-hidden className="h-1.5 rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${VERDICT_SWATCH.some}`}
                        style={{ width: `${(score / 2) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">{level}</p>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Automated assessment by {a.model}, prompt version{" "}
              {a.promptVersion}.
            </p>
            <a
              href={disputeUrl}
              className="text-sm underline underline-offset-4"
            >
              Dispute this assessment
            </a>
          </>
        ) : (
          <p className="text-muted-foreground">Not yet assessed.</p>
        )}
      </aside>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt>{label}:</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function Paragraphs({
  text,
  highlight = null,
}: {
  text: string;
  highlight?: string | null;
}) {
  return (
    <div className="grid max-w-prose gap-3 leading-relaxed">
      {text
        .split(/\n\s*\n/)
        .filter((para) => para.trim())
        .map((para) => {
          const at = highlight ? para.indexOf(highlight) : -1;
          if (!highlight || at < 0) return <p key={para}>{para}</p>;
          return (
            <p key={para}>
              {para.slice(0, at)}
              <mark className="bg-verdict-low/40 px-0.5">{highlight}</mark>
              {para.slice(at + highlight.length)}
            </p>
          );
        })}
    </div>
  );
}
