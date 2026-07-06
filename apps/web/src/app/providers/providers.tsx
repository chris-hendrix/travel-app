"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/get-query-client";
import { useCapacitorBack } from "@/hooks/use-capacitor-back";
import { AuthProvider } from "./auth-provider";
import { Toaster } from "@/components/ui/sonner";

const ReactQueryDevtools =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DISABLE_DEVTOOLS !== "true"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then(
            (mod) => mod.ReactQueryDevtools,
          ),
        { ssr: false },
      )
    : () => null;

function CapacitorBackHandler() {
  useCapacitorBack();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <CapacitorBackHandler />
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
