import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background gradient-mesh">
      {/* Decorative compass rose pattern */}
      <div className="absolute inset-0 opacity-[0.08]" aria-hidden="true">
        <svg
          className="absolute top-12 right-12 w-64 h-64 text-primary hidden sm:block"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="100"
            cy="100"
            r="90"
            stroke="currentColor"
            strokeWidth="1"
          />
          <circle
            cx="100"
            cy="100"
            r="60"
            stroke="currentColor"
            strokeWidth="0.5"
          />
          <path d="M100 10L105 100L100 190L95 100Z" fill="currentColor" />
          <path d="M10 100L100 95L190 100L100 105Z" fill="currentColor" />
          <path
            d="M30 30L103 97L170 30L97 103Z"
            fill="currentColor"
            opacity="0.5"
          />
          <path
            d="M30 170L103 103L170 170L97 97Z"
            fill="currentColor"
            opacity="0.5"
          />
        </svg>
        <svg
          className="absolute bottom-16 left-16 w-48 h-48 text-accent hidden sm:block"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="100"
            cy="100"
            r="90"
            stroke="currentColor"
            strokeWidth="1"
          />
          <path d="M100 10L105 100L100 190L95 100Z" fill="currentColor" />
          <path d="M10 100L100 95L190 100L100 105Z" fill="currentColor" />
        </svg>
      </div>

      <main
        id="main-content"
        className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4"
      >
        {/* Tripful wordmark */}
        <p className="mb-8 text-4xl font-bold tracking-tight text-foreground font-[family-name:var(--font-righteous)]">
          Tripful
        </p>

        {children}
      </main>
    </div>
  );
}
