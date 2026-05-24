import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { AuthGuard } from "@/components/auth-guard";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { GlobalMutationIndicator } from "@/components/global-mutation-indicator";
import { QueryErrorBoundaryWrapper } from "@/components/query-error-boundary-wrapper";

export const dynamic = "force-static";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // In static export mode (NEXT_EXPORT=true), cookies are unavailable.
  // Skip server-side auth — client-side AuthProvider handles it.
  const isExport = process.env.NEXT_EXPORT === "true";

  if (!isExport) {
    const cookieStore = await cookies();
    const authToken = cookieStore.get("auth_token");

    if (!authToken?.value) {
      redirect("/login");
    }
  }

  const content = (
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

  // In static export mode, wrap with client-side AuthGuard since
  // server-side cookie checks are unavailable (no server runtime).
  if (isExport) {
    return <AuthGuard>{content}</AuthGuard>;
  }

  return content;
}
