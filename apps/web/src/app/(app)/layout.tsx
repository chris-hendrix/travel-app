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
  let authToken: { value: string } | undefined;

  try {
    const cookieStore = await cookies();
    authToken = cookieStore.get("auth_token");
  } catch {
    // Static export: cookies() throws; auth handled client-side
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
