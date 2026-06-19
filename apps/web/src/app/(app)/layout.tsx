import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { GlobalMutationIndicator } from "@/components/global-mutation-indicator";
import { QueryErrorBoundaryWrapper } from "@/components/query-error-boundary-wrapper";

export const dynamic = "force-static";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Static export: skip server-side auth redirect entirely;
  // auth is enforced client-side by the AuthProvider.
  const isExport = process.env.NEXT_EXPORT === "true";
  if (isExport) {
    // Still check cookies() to get the layout variable populated,
    // but never redirect — the shell must render for all routes.
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get("auth_token");
      if (token) {
        // Has a token — render the protected shell
      }
    } catch {
      // cookies() unavailable, expected during export
    }
    // Always render the shell; AuthProvider handles auth client-side
    return (
      <>
        <ImpersonationBanner />
        <GlobalMutationIndicator />
        <AppHeader />
        <main
          id="main-content"
          className="bg-gradient-to-b from-background via-background to-secondary/30 min-h-[calc(100dvh-3.5rem)]"
        >
          <QueryErrorBoundaryWrapper>{children}</QueryErrorBoundaryWrapper>
        </main>
      </>
    );
  }

  let authToken: { value: string } | undefined;

  try {
    const cookieStore = await cookies();
    authToken = cookieStore.get("auth_token");
  } catch {
    // cookies unavailable — redirect
  }

  if (!authToken?.value) {
    redirect("/login");
  }

  return (
    <>
      <ImpersonationBanner />
      <GlobalMutationIndicator />
      <AppHeader />
      <main
        id="main-content"
        className="bg-gradient-to-b from-background via-background to-secondary/30 min-h-[calc(100dvh-3.5rem)]"
      >
        <QueryErrorBoundaryWrapper>{children}</QueryErrorBoundaryWrapper>
      </main>
    </>
  );
}
