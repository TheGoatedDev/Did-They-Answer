import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSitemapPetitions } from "@/lib/queries";

// shortcut: one sitemap caps at 50,000 URLs; switch to generateSitemaps past that.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The build has no database, so render per request (the query itself is cached).
  await connection();
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  const rows = await getSitemapPetitions();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/compare`, changeFrequency: "daily" },
    { url: `${base}/methodology`, changeFrequency: "monthly" },
    ...rows.map((p) => ({
      url: `${base}/petitions/${p.id}`,
      lastModified: p.updatedAt,
    })),
  ];
}
