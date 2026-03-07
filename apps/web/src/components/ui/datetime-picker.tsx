"use client";

import * as React from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { utcToLocalParts, localPartsToUTC } from "@/lib/utils/timezone";

interface DateTimePickerProps {
  value?: string; // ISO datetime string (UTC)
  onChange: (value: string) => void;
  timezone: string; // IANA timezone
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  defaultMonth?: Date | undefined;
  tripRange?:
    | { start?: string | null | undefined; end?: string | null | undefined }
    | undefined;
}

export function DateTimePicker({
  value,
  onChange,
  timezone,
  placeholder = "Pick a date & time",
  disabled,
  "aria-label": ariaLabel,
  defaultMonth,
  tripRange,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse the UTC ISO value into local parts for display
  const localParts = React.useMemo(() => {
    if (!value) return { date: "", time: "" };
    return utcToLocalParts(value, timezone);
  }, [value, timezone]);

  // Parse date string to Date for the calendar
  const selectedDate = React.useMemo(() => {
    if (!localParts.date) return undefined;
    const parsed = parse(localParts.date, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [localParts.date]);

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) return;
    const dateStr = format(day, "yyyy-MM-dd");
    const timeStr = localParts.time || "12:00";
    const utcIso = localPartsToUTC(dateStr, timeStr, timezone);
    if (utcIso) onChange(utcIso);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeStr = e.target.value;
    if (!timeStr) return;
    const dateStr = localParts.date || format(new Date(), "yyyy-MM-dd");
    const utcIso = localPartsToUTC(dateStr, timeStr, timezone);
    if (utcIso) onChange(utcIso);
  };

  // Format display string
  const displayText = React.useMemo(() => {
    if (!selectedDate || !localParts.time) return "";
    const dateDisplay = format(selectedDate, "MMM d, yyyy");
    // Format time for display (12-hour)
    const [h, m] = localParts.time.split(":");
    const hour = parseInt(h || "0");
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${dateDisplay} ${hour12}:${m} ${ampm}`;
  }, [selectedDate, localParts.time]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "h-12 w-full justify-start text-left text-base font-normal rounded-md border-input",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayText || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* @ts-expect-error — react-day-picker union types incompatible with exactOptionalPropertyTypes */}
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          defaultMonth={(selectedDate ?? defaultMonth) as Date}
          tripRange={tripRange}
        />
        <div className="border-t border-border p-3">
          <input
            type="time"
            value={localParts.time || ""}
            onChange={handleTimeChange}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-label="Time"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
