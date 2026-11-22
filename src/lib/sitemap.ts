// Sitemap XML for src/app/sitemap.xml and src/app/sitemap/[file]: one index, files of up to SITEMAP_SIZE URLs.

export function siteUrl() {
  // SITE_URL is only set at runtime, not in the Docker build.
  return process.env.SITE_URL ?? "http://localhost:3000";
}

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, {
    headers: { "Content-Type": "application/xml" },
  });
}

export function sitemapIndex(locs: string[]) {
  const items = locs.map(
    (l) => `<sitemap><loc>${escapeXml(l)}</loc></sitemap>`,
  );
  return `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>`;
}

export function urlSet(urls: { loc: string; lastmod?: Date }[]) {
  const items = urls.map(
    (u) =>
      `<url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ""}</url>`,
  );
  return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</urlset>`;
}
