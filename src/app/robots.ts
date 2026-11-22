import type { MetadataRoute } from "next";
import { connection } from "next/server";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // SITE_URL is only set at runtime, not in the Docker build.
  await connection();
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
