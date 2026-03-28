import type { ReactNode } from "react";
import Link from "next/link";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background linen-texture">
      <header className="w-full border-b border-border bg-background linen-texture">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link
            href="/"
            className="font-display text-2xl font-bold tracking-tight text-foreground"
          >
            Journiful
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">{children}</main>

      <footer className="border-t border-border bg-background linen-texture">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-4 px-4 py-6 text-xs text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/sms-terms" className="hover:text-foreground">
            SMS Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
