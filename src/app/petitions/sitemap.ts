import type { MetadataRoute } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { connection } from "next/server";
import { getSitemapCount, getSitemapPetitions } from "@/lib/queries";

// Served at /petitions/sitemap/{id}.xml; robots.txt lists every file.
export async function generateSitemaps() {
  // The build has no database; real ids resolve per request.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return [{ id: 0 }];
  const n = await getSitemapCount();
  return Array.from({ length: n }, (_, id) => ({ id }));
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  const rows = await getSitemapPetitions(Number(await props.id));
  return rows.map((p) => ({
    url: `${base}/petitions/${p.id}`,
    lastModified: p.updatedAt,
  }));
}
