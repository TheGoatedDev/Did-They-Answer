import { eq, getTableColumns, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { crawlCursors, petitions } from "@/db/schema";
import {
  fetchPetitionPage,
  PETITION_SETS,
  type PetitionSet,
  toRow,
} from "./petitions-api";

const REFRESH_AFTER_MS = 20 * 60 * 60 * 1000;

type Options = {
  deadline: number;
  sets?: readonly PetitionSet[];
  fetchPage?: typeof fetchPetitionPage;
  pauseMs?: number;
};

export async function runSync(
  db: Db,
  {
    deadline,
    sets = PETITION_SETS,
    fetchPage = fetchPetitionPage,
    pauseMs = 1000,
  }: Options,
) {
  let items = 0;
  for (const set of sets) {
    const [cursor] = await db
      .select()
      .from(crawlCursors)
      .where(eq(crawlCursors.url, set.url));
    const stale =
      set.refresh &&
      cursor?.done &&
      Date.now() - cursor.updatedAt.getTime() > REFRESH_AFTER_MS;
    let page = !cursor || stale ? 1 : cursor.nextPage;
    let done = !stale && (cursor?.done ?? false);

    while (!done) {
      if (Date.now() > deadline) return { items, complete: false };
      const result = await fetchPage(`${set.url}&page=${page}`);
      await upsertPetitions(
        db,
        result.petitions.map((p) => toRow(p, set.parliament)),
      );
      items += result.petitions.length;
      page += 1;
      done = result.next === null;
      await db
        .insert(crawlCursors)
        .values({ url: set.url, nextPage: page, done })
        .onConflictDoUpdate({
          target: crawlCursors.url,
          set: { nextPage: page, done, updatedAt: new Date() },
        });
      if (!done && pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  return { items, complete: true };
}

async function upsertPetitions(
  db: Db,
  rows: (typeof petitions.$inferInsert)[],
) {
  if (rows.length === 0) return;
  const { id: _id, ...columns } = getTableColumns(petitions);
  await db
    .insert(petitions)
    .values(rows)
    .onConflictDoUpdate({
      target: petitions.id,
      set: Object.fromEntries(
        Object.entries(columns).map(([key, col]) => [
          key,
          sql.raw(`excluded."${col.name}"`),
        ]),
      ),
    });
}
