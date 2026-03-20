import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://journiful.app";
  return [
    {
      url: siteUrl,
      lastModified: new Date("2026-02-20"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/login`,
      lastModified: new Date("2026-02-20"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
