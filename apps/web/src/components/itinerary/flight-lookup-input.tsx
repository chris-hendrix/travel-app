"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FlightLookupResult } from "@journiful/shared/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useFlightLookup } from "@/hooks/flight-queries";

const FLIGHT_NUMBER_REGEX = /^[A-Z\d]{2,3}\d{1,4}$/i;

interface FlightLookupInputProps {
  /** Default date for lookup (YYYY-MM-DD), pre-filled from trip start/end date */
  defaultDate?: string | undefined;
  onResult: (result: FlightLookupResult, flightNumber: string) => void;
  /** Called whenever the flight number text changes (for syncing with parent form) */
  onFlightNumberChange?: (flightNumber: string) => void;
  defaultValue?: string | undefined;
  disabled?: boolean | undefined;
  /** Default month for the date picker calendar */
  defaultMonth?: Date | undefined;
  /** Trip date range for calendar highlighting */
  tripRange?: { start?: string | null | undefined; end?: string | null | undefined } | undefined;
}

export function FlightLookupInput({
  defaultDate,
  onResult,
  onFlightNumberChange,
  defaultValue,
  disabled,
  defaultMonth,
  tripRange,
}: FlightLookupInputProps) {
  const [value, setValue] = useState(defaultValue || "");
  const [date, setDate] = useState(defaultDate || "");
  const [notConfigured, setNotConfigured] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync with external defaultValue/defaultDate when they change (e.g., edit dialog re-opens)
  useEffect(() => {
    setValue(defaultValue || "");
  }, [defaultValue]);

  useEffect(() => {
    setDate(defaultDate || "");
  }, [defaultDate]);
  const { mutate, isPending } = useFlightLookup();

  if (notConfigured) {
    return null;
  }

  const isValidFormat = FLIGHT_NUMBER_REGEX.test(value.trim());
  const hasDate = date.length >= 10;
  const canLookup =
    hasDate && value.trim().length > 0 && isValidFormat && !isPending && !disabled;

  const handleLookup = () => {
    setErrorMessage(null);
    mutate(
      { flightNumber: value.trim(), date },
      {
        onSuccess: (response) => {
          if (!response.available) {
            setNotConfigured(true);
            return;
          }
          if (response.available && response.flight) {
            const { departureAirport, arrivalAirport } = response.flight;
            const from = departureAirport.iata || departureAirport.name;
            const to = arrivalAirport.iata || arrivalAirport.name;
            toast.success(`Found: ${from} → ${to}`);
            onResult(response.flight, value.trim());
          } else {
            setErrorMessage("Flight not found for this date");
          }
        },
        onError: () => {
          setErrorMessage("Lookup temporarily unavailable");
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      <label className="text-base font-semibold text-foreground">Flight number</label>
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="e.g., UA123"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onFlightNumberChange?.(e.target.value);
            setErrorMessage(null);
          }}
          disabled={isPending || disabled}
          className="h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md flex-1"
        />
        <div className="w-[160px] shrink-0">
          <DatePicker
            value={date}
            onChange={(val) => {
              setDate(val);
              setErrorMessage(null);
            }}
            placeholder="Travel date"
            disabled={isPending || !!disabled}
            aria-label="Flight date"
            defaultMonth={defaultMonth}
            tripRange={tripRange}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleLookup}
          disabled={!canLookup}
          className="h-12 rounded-md px-4"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Autofill"
          )}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Optional: Add a date and look up to auto-fill time and location
      </p>
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
