"use client";

import { memo } from "react";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { MemberTravel } from "@journiful/shared/types";
import { formatInTimezone } from "@/lib/utils/timezone";

interface MemberTravelLineItemProps {
  memberTravel: MemberTravel;
  memberName: string;
  timezone: string;
  onClick: (memberTravel: MemberTravel) => void;
}

export const MemberTravelLineItem = memo(function MemberTravelLineItem({
  memberTravel,
  memberName,
  timezone,
  onClick,
}: MemberTravelLineItemProps) {
  const Icon =
    memberTravel.travelType === "arrival" ? PlaneLanding : PlaneTakeoff;

  const time = formatInTimezone(memberTravel.time, timezone, "time");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(memberTravel)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(memberTravel);
        }
      }}
      className="flex items-center gap-2.5 rounded-md py-1.5 px-3 hover:bg-muted/50 active:bg-muted/70 transition-colors cursor-pointer min-h-[36px]"
    >
      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {time}
      </span>
      <span className="text-sm font-medium text-foreground truncate">
        {memberName}
      </span>
    </div>
  );
});
