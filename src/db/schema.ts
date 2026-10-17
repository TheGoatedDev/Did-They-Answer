import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type Department = { acronym: string; name: string; url: string };
export type Debate = {
  debated_on: string | null;
  transcript_url: string | null;
  video_url: string | null;
  debate_pack_url: string | null;
  overview: string | null;
};

export const STANCES = [
  "accepts",
  "partially_accepts",
  "declines",
  "deflects",
] as const;
export const VERDICTS = ["low", "some", "thorough"] as const;
export const CRITERIA = [
  "addresses_ask",
  "evidence",
  "reasoning",
  "outcome",
  "specificity",
] as const;

export type Stance = (typeof STANCES)[number];
export type Verdict = (typeof VERDICTS)[number];
export type Criterion = (typeof CRITERIA)[number];

const tz = { withTimezone: true } as const;

export const petitions = pgTable("petitions", {
  id: integer("id").primaryKey(),
  // "2024-" is the current parliament; the rest are archived, e.g. "2019-24".
  parliament: text("parliament").notNull(),
  action: text("action").notNull(),
  background: text("background"),
  additionalDetails: text("additional_details"),
  state: text("state").notNull(),
  signatureCount: integer("signature_count").notNull(),
  createdAt: timestamp("created_at", tz).notNull(),
  openedAt: timestamp("opened_at", tz),
  closedAt: timestamp("closed_at", tz),
  departments: jsonb("departments").$type<Department[]>().notNull(),
  topics: jsonb("topics").$type<string[]>().notNull(),
  responseSummary: text("response_summary"),
  responseDetails: text("response_details"),
  respondedOn: date("responded_on"),
  debate: jsonb("debate").$type<Debate>(),
  raw: jsonb("raw").notNull(),
  apiUpdatedAt: timestamp("api_updated_at", tz).notNull(),
  fetchedAt: timestamp("fetched_at", tz).notNull().defaultNow(),
});

export const assessments = pgTable(
  "assessments",
  {
    id: serial("id").primaryKey(),
    petitionId: integer("petition_id")
      .notNull()
      .references(() => petitions.id),
    model: text("model").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    stance: text("stance", { enum: STANCES }).notNull(),
    stanceConfidence: real("stance_confidence").notNull(),
    scores: jsonb("scores").$type<Record<Criterion, number>>().notNull(),
    total: real("total").notNull(),
    verdict: text("verdict", { enum: VERDICTS }).notNull(),
    minConfidence: real("min_confidence").notNull(),
    needsReview: boolean("needs_review").notNull(),
    evidenceSentence: text("evidence_sentence"),
    inputTokens: integer("input_tokens"),
    raw: jsonb("raw").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.petitionId, t.model, t.promptVersion, t.inputHash),
  ],
);

export const crawlCursors = pgTable("crawl_cursors", {
  url: text("url").primaryKey(),
  nextPage: integer("next_page").notNull(),
  done: boolean("done").notNull(),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  job: text("job", { enum: ["sync", "judge"] }).notNull(),
  startedAt: timestamp("started_at", tz).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", tz),
  items: integer("items"),
  error: text("error"),
  inputTokens: integer("input_tokens"),
});
