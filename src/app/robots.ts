import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteUrl } from "@/lib/sitemap";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
