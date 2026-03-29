"use client";

import { Home, CalendarDays, MessageCircle, Camera, DollarSign } from "lucide-react";

const ICONS = [
  { icon: Home, label: "Home" },
  { icon: CalendarDays, label: "Itinerary" },
  { icon: MessageCircle, label: "Messages" },
  { icon: Camera, label: "Photos" },
  { icon: DollarSign, label: "Settle" },
] as const;

interface IconStripProps {
  activeIndex: number;
  onIconClick: (index: number) => void;
}

export function IconStrip({ activeIndex, onIconClick }: IconStripProps) {
  return (
    <div className="shrink-0 flex items-center justify-around bg-background/90 backdrop-blur-sm pb-safe border-t border-border h-[60px] z-40">
      {ICONS.map(({ icon: Icon, label }, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onIconClick(index)}
            aria-label={label}
            aria-current={isActive ? "true" : undefined}
            className={`flex items-center justify-center w-14 h-14 transition-colors ${
              isActive
                ? "text-primary"
                : "text-foreground/50"
            }`}
          >
            <Icon
              className="w-6 h-6"
              strokeWidth={isActive ? 2 : 1.5}
            />
          </button>
        );
      })}
    </div>
  );
}
