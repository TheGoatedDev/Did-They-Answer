export async function register() {
  // Skipped without a database, e.g. `next build` in CI.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { migrateDb } = await import("./db/migrate");
    await migrateDb();
  }
}
