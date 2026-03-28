import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

// Derive image remote patterns from the API URL so it works in all environments
const apiBase = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"
).replace(/\/api$/, "");
const { protocol, hostname, port } = new URL(apiBase);
const isDev = process.env.NODE_ENV === "development";

const withPWA = withPWAInit({
  dest: "public",
  disable: isDev,
  cacheStartUrl: true,
  dynamicStartUrl: true,
  customWorkerSrc: "worker",
  fallbacks: {
    document: "/~offline",
  },
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /\/api\/trips$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-trips",
          expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
        },
      },
      {
        urlPattern: /\/api\/trips\/[^/]+$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-trip-detail",
          expiration: { maxEntries: 20, maxAgeSeconds: 3600 },
        },
      },
      {
        urlPattern: /\/api\/events/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-events",
          expiration: { maxEntries: 100, maxAgeSeconds: 1800 },
        },
      },
      {
        urlPattern: /\.(png|jpg|jpeg|webp|svg|gif)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "images",
          expiration: { maxEntries: 200, maxAgeSeconds: 2592000 },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com/,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts",
          expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
        },
      },
      {
        urlPattern: /\/_next\/static\/.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: { maxEntries: 100, maxAgeSeconds: 2592000 },
        },
      },
      {
        urlPattern: /\/api\//,
        handler: "NetworkFirst",
        options: {
          cacheName: "api-default",
          expiration: { maxEntries: 50, maxAgeSeconds: 300 },
        },
      },
    ],
  },
});

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

export default withPWA(nextConfig);
