import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden paper-bg">
      {/* Scattered faded postmark decorations */}
      <div className="absolute inset-0" aria-hidden="true">
        <div
          className="postmark absolute top-12 right-12 w-20 h-20 hidden sm:flex"
          style={{ opacity: 0.1 }}
        />
        <div
          className="postmark absolute bottom-16 left-16 w-16 h-16 hidden sm:flex"
          style={{ opacity: 0.08, transform: "rotate(25deg)" }}
        />
        <div
          className="postmark absolute top-1/3 left-8 w-14 h-14 hidden sm:flex"
          style={{ opacity: 0.06, transform: "rotate(-30deg)" }}
        />
      </div>

      <main
        id="main-content"
        className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4"
      >
        {/* Tripful wordmark */}
        <p className="mb-2 text-4xl font-bold tracking-tight text-foreground font-[family-name:var(--font-righteous)]">
          Tripful
        </p>
        {/* Vintage tagline */}
        <p className="mb-8 text-lg text-muted-foreground font-[family-name:var(--font-caveat)]">
          Wish you were here...
        </p>

        {children}
      </main>
    </div>
  );
}
