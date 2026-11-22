import { connection } from "next/server";
import { getSitemapCount } from "@/lib/queries";
import { sitemapIndex, siteUrl, xml } from "@/lib/sitemap";

// Sitemap index; the files are served by sitemap/[file]/route.ts.
export async function GET() {
  await connection();
  const base = siteUrl();
  const n = await getSitemapCount();
  return xml(
    sitemapIndex(
      Array.from({ length: n }, (_, id) => `${base}/sitemap/${id}.xml`),
    ),
  );
}
