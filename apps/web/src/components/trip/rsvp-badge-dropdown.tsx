"use client";

import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  CircleX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  useUpdateRsvp,
  getUpdateRsvpErrorMessage,
} from "@/hooks/use-invitations";
import type { UpdateRsvpInput } from "@tripful/shared/schemas";

type RsvpStatus = "going" | "maybe" | "not_going" | "no_response";

const labels: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not Going",
  no_response: "No Response",
};

const options: { value: UpdateRsvpInput["status"]; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "not_going", label: "Not Going" },
];

function StatusIcon({
  status,
  className,
}: {
  status: RsvpStatus;
  className?: string;
}) {
  switch (status) {
    case "going":
      return <CircleCheck className={`${className} text-success`} />;
    case "maybe":
      return <CircleHelp className={`${className} text-warning`} />;
    case "not_going":
      return <CircleX className={`${className} text-destructive`} />;
    case "no_response":
      return <CircleHelp className={`${className} text-muted-foreground`} />;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

interface RsvpBadgeDropdownProps {
  tripId: string;
  status: RsvpStatus;
}

export function RsvpBadgeDropdown({ tripId, status }: RsvpBadgeDropdownProps) {
  const { mutate: updateRsvp } = useUpdateRsvp(tripId);

  const handleSelect = (newStatus: UpdateRsvpInput["status"]) => {
    if (newStatus === status) return;
    updateRsvp(
      { status: newStatus },
      {
        onSuccess: () => {
          const label =
            options.find((o) => o.value === newStatus)?.label ?? newStatus;
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors cursor-pointer shadow-sm"
        >
          <StatusIcon status={status} className="w-5 h-5" />
          {labels[status]}
          <ChevronDown className="w-3.5 h-3.5 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleSelect(option.value)}
          >
            <StatusIcon status={option.value} className="w-4 h-4" />
            {option.label}
            {status === option.value && (
              <Check className="ml-auto size-4 text-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
