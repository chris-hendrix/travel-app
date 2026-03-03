import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RsvpStatus = "going" | "maybe" | "not_going" | "no_response";

interface RsvpBadgeProps {
  status: RsvpStatus;
  variant?: "default" | "overlay" | "postmark";
}

const defaultStyles: Record<RsvpStatus, string> = {
  going: "bg-success/15 text-success border-success/30",
  maybe: "bg-warning/15 text-warning border-warning/30",
  not_going: "bg-destructive/15 text-destructive border-destructive/30",
  no_response: "bg-muted text-muted-foreground border-border",
};

const overlayStyles: Record<RsvpStatus, string> = {
  going:
    "bg-black/50 backdrop-blur-md text-overlay-success border-white/20 shadow-sm",
  maybe:
    "bg-black/50 backdrop-blur-md text-overlay-warning border-white/20 shadow-sm",
  not_going:
    "bg-black/50 backdrop-blur-md text-overlay-muted border-white/20 shadow-sm",
  no_response: "",
};

const postmarkStyles: Record<RsvpStatus, string> = {
  going: "text-green-700 border-green-700",
  maybe: "text-amber-700 border-amber-700",
  not_going: "text-red-800 border-red-800",
  no_response: "",
};

const labels: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not Going",
  no_response: "No Response",
};

const postmarkLabels: Record<RsvpStatus, string> = {
  going: "GOING",
  maybe: "MAYBE",
  not_going: "NOT GOING",
  no_response: "No Response",
};

export function RsvpBadge({ status, variant = "default" }: RsvpBadgeProps) {
  if (
    (variant === "overlay" || variant === "postmark") &&
    status === "no_response"
  ) {
    return null;
  }

  if (variant === "postmark") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full border-2 border-double px-2.5 py-1 text-[10px] font-accent font-bold uppercase tracking-wider -rotate-[15deg] opacity-70",
          postmarkStyles[status],
        )}
      >
        {postmarkLabels[status]}
      </span>
    );
  }

  const className =
    variant === "overlay" ? overlayStyles[status] : defaultStyles[status];

  return <Badge className={className}>{labels[status]}</Badge>;
}
