CREATE TABLE "debate_stances" (
	"id" serial PRIMARY KEY NOT NULL,
	"petition_id" integer NOT NULL,
	"debate_id" text NOT NULL,
	"member_id" integer NOT NULL,
	"name" text NOT NULL,
	"party" text NOT NULL,
	"role" text,
	"speeches" integer NOT NULL,
	"stance" text NOT NULL,
	"confidence" real NOT NULL,
	"model" text NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debate_stances" ADD CONSTRAINT "debate_stances_petition_id_petitions_id_fk" FOREIGN KEY ("petition_id") REFERENCES "public"."petitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "debate_stances_petition_id_member_id_index" ON "debate_stances" USING btree ("petition_id","member_id");