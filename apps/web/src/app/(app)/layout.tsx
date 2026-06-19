import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { GlobalMutationIndicator } from "@/components/global-mutation-indicator";
import { QueryErrorBoundaryWrapper } from "@/components/query-error-boundary-wrapper";
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
    // Static export: cookies() unavailable — skip server auth,
    // client-side AuthProvider handles authentication
  }

  // During static export (force-static), authToken is undefined.
  // The redirect() call below uses NEXT_REDIRECT which Next.js handles
  // internally. At build time with no cookies, authToken stays undefined,
  // redirect fires, and Next.js renders an error page.
  // We prevent this by checking: only redirect if cookies() actually returned
  // something meaningful (real server request), not an empty export build.
  const isExport = process.env.NEXT_EXPORT === "true";
  if (!isExport && !authToken?.value) {
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
