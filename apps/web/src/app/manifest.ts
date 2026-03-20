import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Journiful",
    short_name: "Journiful",
    description: "Plan group trips together",
    start_url: "/",
    display: "standalone",
    background_color: "#1a1814",
    theme_color: "#1a1814",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
