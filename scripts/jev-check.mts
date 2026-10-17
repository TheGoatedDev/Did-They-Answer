// One real Jev call to check the key and the API shape. Writes nothing to the database.
// Usage: pnpm jev:check [petitionId]   (defaults to the most-signed petition with a response)
import { desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { petitions } from "@/db/schema";
import { createJevClient, judgeOne } from "@/lib/judge";

const id = process.argv[2] ? Number(process.argv[2]) : null;
const [p] = await db
  .select()
  .from(petitions)
  .where(id ? eq(petitions.id, id) : isNotNull(petitions.responseDetails))
  .orderBy(desc(petitions.signatureCount))
  .limit(1);
if (!p?.responseDetails) {
  throw new Error(
    "No petition with a response found; run pnpm sync:local first",
  );
}

console.log(`#${p.id}: ${p.action}\n`);
const { raw: _raw, ...row } = await judgeOne(createJevClient(), p);
console.log(row);
process.exit(0);
