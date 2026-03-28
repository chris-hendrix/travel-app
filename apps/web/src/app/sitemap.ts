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
    {
      url: `${siteUrl}/terms`,
      lastModified: new Date("2026-03-28"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date("2026-03-28"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/sms-terms`,
      lastModified: new Date("2026-03-28"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
