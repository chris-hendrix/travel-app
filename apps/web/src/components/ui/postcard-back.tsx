import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AirmailStripe } from "./airmail-stripe";
import { PostmarkStamp } from "./postmark-stamp";

interface PostcardBackProps {
  children: ReactNode;
  aside?: ReactNode | undefined;
  stampDate?: string | undefined;
  stampCity?: string | undefined;
  className?: string | undefined;
}

export function PostcardBack({
  children,
  aside,
  stampDate,
  stampCity,
  className,
}: PostcardBackProps) {
  return (
    <div
      className={cn(
        "relative bg-card rounded-md shadow-sm overflow-hidden linen-texture",
        className,
      )}
    >
      {/* Top airmail stripe */}
      <AirmailStripe variant="medium" />

      <div className="relative p-6 sm:p-8">
        {/* Stamp + postmark in top-right corner */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-start gap-0">
          {/* Stamp placeholder */}
          <div className="w-12 h-14 sm:w-14 sm:h-16 border-2 border-dashed border-border rounded-sm bg-card/50" />
          {/* Postmark overlapping stamp */}
          <div className="-ml-6 mt-2">
            <PostmarkStamp date={stampDate} city={stampCity} size="md" />
          </div>
        </div>

        {/* Two-column layout on md+ */}
        <div className="md:grid md:grid-cols-[1fr_220px] md:gap-8">
          {/* Left: main content with writing lines */}
          <div className="writing-lines min-h-[200px] pr-4 md:border-r md:border-border">
            {children}
          </div>

          {/* Right: metadata aside */}
          {aside && <div className="mt-6 md:mt-0 pt-6 md:pt-10">{aside}</div>}
        </div>
      </div>

      {/* Bottom airmail stripe */}
      <AirmailStripe variant="medium" />
    </div>
  );
}
