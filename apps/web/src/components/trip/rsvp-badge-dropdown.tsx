"use client";

import { toast } from "sonner";
import { Check, ChevronDown, CircleCheck, CircleHelp, CircleX } from "lucide-react";
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

const options: { value: UpdateRsvpInput["status"]; label: string; dot: string }[] = [
  { value: "going", label: "Going", dot: "bg-success" },
  { value: "maybe", label: "Maybe", dot: "bg-warning" },
  { value: "not_going", label: "Not Going", dot: "bg-destructive" },
];

function StatusIcon({ status, className }: { status: RsvpStatus; className?: string }) {
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

export function RsvpBadgeDropdown({
  tripId,
  status,
}: RsvpBadgeDropdownProps) {
  const { mutate: updateRsvp } = useUpdateRsvp(tripId);

  const handleSelect = (newStatus: UpdateRsvpInput["status"]) => {
    if (newStatus === status) return;
    updateRsvp(
      { status: newStatus },
      {
        onSuccess: () => {
          const label = options.find((o) => o.value === newStatus)?.label ?? newStatus;
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
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <StatusIcon status={status} className="w-5 h-5" />
          <span className="text-sm">{labels[status]}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleSelect(option.value)}
          >
            <span className={`size-2 rounded-full ${option.dot}`} />
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
