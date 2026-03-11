"use client";

import type { ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";

/**
 * Client wrapper that combines QueryErrorResetBoundary with ErrorBoundary.
 * When TanStack Query throws, the "Try again" button will also reset
 * failed queries so they are refetched automatically.
 */
export function QueryErrorBoundaryWrapper({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => <ErrorBoundary onReset={reset}>{children}</ErrorBoundary>}
    </QueryErrorResetBoundary>
  );
}
