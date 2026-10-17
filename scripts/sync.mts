// Run the sync locally without the HTTP route, e.g. for development data.
import { db } from "@/db";
import { migrateDb } from "@/db/migrate";
import { recordJob } from "@/lib/jobs";
import { runSync } from "@/lib/sync";

await migrateDb();
const result = await recordJob(db, "sync", () =>
  runSync(db, { deadline: Date.now() + 15 * 60_000 }),
);
console.log(result);
process.exit(0);
