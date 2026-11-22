import type { MetadataRoute } from "next";
import { connection } from "next/server";

// Petition pages live in /petitions/sitemap/{id}.xml.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // SITE_URL is only set at runtime, not in the Docker build.
  await connection();
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/compare`, changeFrequency: "daily" },
    { url: `${base}/methodology`, changeFrequency: "monthly" },
  ];
}
