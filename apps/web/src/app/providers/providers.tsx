"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/get-query-client";
import { AuthProvider } from "./auth-provider";
import { Toaster } from "@/components/ui/sonner";

const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then(
            (mod) => mod.ReactQueryDevtools,
          ),
        { ssr: false },
      )
    : () => null;

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
