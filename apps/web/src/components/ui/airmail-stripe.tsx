import { cn } from "@/lib/utils";

interface AirmailStripeProps {
  variant?: "thin" | "medium";
  className?: string;
}

export function AirmailStripe({
  variant = "thin",
  className,
}: AirmailStripeProps) {
  return (
    <div
      className={cn(
        "airmail-stripe w-full",
        variant === "thin" ? "h-1.5" : "h-3",
        className,
      )}
      aria-hidden="true"
    />
  );
}
