"use client";

import { useEffect, useState, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        await apiRequest("/auth/me");
        if (!cancelled) setStatus("authenticated");
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center"
      >
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    redirect("/login");
  }

  return <>{children}</>;
}
