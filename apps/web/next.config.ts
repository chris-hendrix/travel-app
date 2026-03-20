import type { NextConfig } from "next";

// Derive image remote patterns from the API URL so it works in all environments
const apiBase = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"
).replace(/\/api$/, "");
const { protocol, hostname, port } = new URL(apiBase);
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@journiful/shared"],
  reactStrictMode: true,
  experimental: {
    viewTransition: true,
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  images: {
    remotePatterns: [
      {
        protocol: protocol.replace(":", "") as "http" | "https",
        hostname,
        ...(port ? { port } : {}),
        pathname: "/uploads/**",
      },
    ],
    // Allow localhost/private IPs in dev (Next.js blocks them by default)
    dangerouslyAllowLocalIP: isDev,
  },
};

export default nextConfig;
