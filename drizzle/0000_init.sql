CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"petition_id" integer NOT NULL,
	"model" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"input_hash" text NOT NULL,
	"stance" text NOT NULL,
	"stance_confidence" real NOT NULL,
	"scores" jsonb NOT NULL,
	"total" real NOT NULL,
	"verdict" text NOT NULL,
	"min_confidence" real NOT NULL,
	"needs_review" boolean NOT NULL,
	"evidence_sentence" text,
	"input_tokens" integer,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_cursors" (
	"url" text PRIMARY KEY NOT NULL,
	"next_page" integer NOT NULL,
	"done" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items" integer,
	"error" text,
	"input_tokens" integer
);
--> statement-breakpoint
CREATE TABLE "petitions" (
	"id" integer PRIMARY KEY NOT NULL,
	"parliament" text NOT NULL,
	"action" text NOT NULL,
	"background" text,
	"additional_details" text,
	"state" text NOT NULL,
	"signature_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"departments" jsonb NOT NULL,
	"topics" jsonb NOT NULL,
	"response_summary" text,
	"response_details" text,
	"responded_on" date,
	"debate" jsonb,
	"raw" jsonb NOT NULL,
	"api_updated_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_petition_id_petitions_id_fk" FOREIGN KEY ("petition_id") REFERENCES "public"."petitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_petition_id_model_prompt_version_input_hash_index" ON "assessments" USING btree ("petition_id","model","prompt_version","input_hash");