import { describe, expect, it } from "vitest";
import { sitemapIndex, urlSet } from "./sitemap";

describe("sitemap xml", () => {
  it("escapes locs and formats lastmod", () => {
    const out = urlSet([
      { loc: "https://x.test/?a=1&b=2" },
      { loc: "https://x.test/p/1", lastmod: new Date("2026-01-02T03:04:05Z") },
    ]);
    expect(out).toContain("<loc>https://x.test/?a=1&#38;b=2</loc></url>");
    expect(out).toContain("<lastmod>2026-01-02T03:04:05.000Z</lastmod>");
  });

  it("lists every sitemap in the index", () => {
    const out = sitemapIndex(["https://x.test/sitemap/0.xml"]);
    expect(out).toMatch(/^<sitemapindex /);
    expect(out).toContain(
      "<sitemap><loc>https://x.test/sitemap/0.xml</loc></sitemap>",
    );
  });
});
