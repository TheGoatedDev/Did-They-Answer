import { connection } from "next/server";
import { getSitemapCount, getSitemapPetitions } from "@/lib/queries";
import { siteUrl, urlSet, xml } from "@/lib/sitemap";

const STATIC_PAGES = ["/", "/compare", "/methodology"];

// /sitemap/{id}.xml; file 0 also lists the static pages.
export async function GET(_: Request, ctx: RouteContext<"/sitemap/[file]">) {
  await connection();
  const match = /^(\d+)\.xml$/.exec((await ctx.params).file);
  const id = match ? Number(match[1]) : -1;
  if (id < 0 || id >= (await getSitemapCount())) {
    return new Response("Not Found", { status: 404 });
  }
  const base = siteUrl();
  const rows = await getSitemapPetitions(id);
  return xml(
    urlSet([
      ...(id === 0 ? STATIC_PAGES.map((p) => ({ loc: `${base}${p}` })) : []),
      ...rows.map((p) => ({
        loc: `${base}/petitions/${p.id}`,
        lastmod: p.updatedAt,
      })),
    ]),
  );
}
