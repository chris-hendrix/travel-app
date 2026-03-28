import type { ReactNode } from "react";
import Link from "next/link";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background linen-texture">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background linen-texture">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
          <Link
            href="/"
            className="font-display text-2xl font-bold tracking-tight text-foreground"
          >
            Journiful
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-muted-foreground">
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/sms-terms"
            className="hover:text-foreground transition-colors"
          >
            SMS Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
