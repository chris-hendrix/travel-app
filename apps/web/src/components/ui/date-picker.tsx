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

interface DatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  defaultMonth?: Date | undefined;
  tripRange?:
    | { start?: string | null | undefined; end?: string | null | undefined }
    | undefined;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  "aria-label": ariaLabel,
  defaultMonth,
  tripRange,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse YYYY-MM-DD string to Date for the calendar (treat as local date)
  const selected = React.useMemo(() => {
    if (!value) return undefined;
    const parsed = parse(value, "yyyy-MM-dd", new Date());
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [value]);

  const handleSelect = (day: Date | undefined) => {
    if (day) {
      onChange(format(day, "yyyy-MM-dd"));
      setOpen(false);
    }
  };

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
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* @ts-expect-error — react-day-picker union types incompatible with exactOptionalPropertyTypes */}
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={(selected ?? defaultMonth) as Date}
          tripRange={tripRange}
        />
      </PopoverContent>
    </Popover>
  );
}
