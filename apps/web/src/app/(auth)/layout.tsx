import type { ReactNode } from "react";
import { PostmarkStamp } from "@/components/ui/postmark-stamp";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background linen-texture">
      {/* Decorative postmark stamps */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute top-12 right-12 hidden sm:block">
          <PostmarkStamp date="EST. 2026" city="JOURNIFUL" size="lg" />
        </div>
        <div className="absolute bottom-16 left-16 hidden sm:block">
          <PostmarkStamp date="PAR AVION" city="AIR MAIL" size="md" />
        </div>
      </div>

      <main
        id="main-content"
        className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4"
      >
        {/* Journiful wordmark */}
        <p className="mb-8 text-4xl font-bold tracking-tight text-foreground font-playfair">
          Journiful
        </p>

        {children}
      </main>
    </div>
  );
}
