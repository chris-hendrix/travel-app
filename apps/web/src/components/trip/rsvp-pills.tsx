"use client";

import { toast } from "sonner";
import { CircleCheck, CircleDashed, CircleHelp, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useUpdateRsvp,
  getUpdateRsvpErrorMessage,
} from "@/hooks/use-invitations";
import type { UpdateRsvpInput } from "@journiful/shared/schemas";
import { cn } from "@/lib/utils";

type RsvpStatus = "going" | "maybe" | "not_going" | "no_response";

const pills: {
  value: RsvpStatus;
  label: string;
  icon: typeof CircleCheck;
  activeClass: string;
  hoverClass: string;
}[] = [
  {
    value: "going",
    label: "Going",
    icon: CircleCheck,
    activeClass: "bg-success text-success-foreground hover:bg-success/90",
    hoverClass: "hover:bg-success/10 hover:text-success hover:border-success/30",
  },
  {
    value: "maybe",
    label: "Maybe",
    icon: CircleHelp,
    activeClass: "bg-warning text-warning-foreground hover:bg-warning/90",
    hoverClass: "hover:bg-warning/10 hover:text-warning hover:border-warning/30",
  },
  {
    value: "not_going",
    label: "Not Going",
    icon: CircleX,
    activeClass:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    hoverClass: "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30",
  },
];

const noResponsePill: (typeof pills)[number] = {
  value: "no_response",
  label: "No response",
  icon: CircleDashed,
  activeClass: "bg-muted text-foreground",
  hoverClass: "hover:bg-muted/60",
};

interface RsvpPillsProps {
  tripId?: string;
  status: RsvpStatus;
  onSelect?: (status: RsvpStatus) => void;
  pending?: string | null;
  includeNoResponse?: boolean;
}

function PillsView({
  status,
  busy,
  pendingValue,
  visiblePills,
  onPick,
}: {
  status: RsvpStatus;
  busy: boolean;
  pendingValue: string | null;
  visiblePills: typeof pills;
  onPick: (s: RsvpStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {visiblePills.map((pill) => {
        const isActive = status === pill.value;
        const Icon = pill.icon;

        return (
          <Button
            key={pill.value}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onPick(pill.value)}
            className={cn(
              "h-10",
              isActive
                ? cn(pill.activeClass, "border-transparent")
                : pill.hoverClass,
              pendingValue === pill.value && "opacity-60",
            )}
          >
            <Icon className="size-4" />
            {pill.label}
          </Button>
        );
      })}
    </div>
  );
}

function UncontrolledPills({
  tripId,
  status,
  visiblePills,
}: {
  tripId: string;
  status: RsvpStatus;
  visiblePills: typeof pills;
}) {
  const { mutate: updateRsvp, isPending } = useUpdateRsvp(tripId);

  const handleClick = (newStatus: RsvpStatus) => {
    if (newStatus === status || isPending) return;
    updateRsvp(
      { status: newStatus as UpdateRsvpInput["status"] },
      {
        onSuccess: () => {
          const label =
            visiblePills.find((p) => p.value === newStatus)?.label ?? newStatus;
          toast.success(`RSVP updated to "${label}"`);
        },
        onError: (error) => {
          const message = getUpdateRsvpErrorMessage(error);
          toast.error(message ?? "Failed to update RSVP");
        },
      },
    );
  };

  return (
    <PillsView
      status={status}
      busy={isPending}
      pendingValue={null}
      visiblePills={visiblePills}
      onPick={handleClick}
    />
  );
}

export function RsvpPills({
  tripId,
  status,
  onSelect,
  pending = null,
  includeNoResponse = false,
}: RsvpPillsProps) {
  const visiblePills = includeNoResponse ? [...pills, noResponsePill] : pills;

  if (typeof onSelect === "function") {
    return (
      <PillsView
        status={status}
        busy={pending != null}
        pendingValue={pending}
        visiblePills={visiblePills}
        onPick={(next) => {
          if (next === status || pending != null) return;
          onSelect(next);
        }}
      />
    );
  }

  return (
    <UncontrolledPills
      tripId={tripId ?? ""}
      status={status}
      visiblePills={visiblePills}
    />
  );
}
