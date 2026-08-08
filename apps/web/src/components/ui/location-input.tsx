"use client";

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { useLocationAutocomplete } from "@/hooks/use-location-autocomplete";
import { useLocationDetails, type LocationSuggestion } from "@/hooks/use-location-details";
import type { AutocompleteSuggestion } from "@journiful/shared/types";
import { cn } from "@/lib/utils";

interface LocationInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (result: LocationSuggestion) => void;
  context?: { lat: number; lon: number } | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function generateSessionToken(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function LocationInput({
  id,
  name,
  value,
  onChange,
  onSelect,
  context,
  placeholder,
  disabled,
  className,
}: LocationInputProps) {
  const detailsMutation = useLocationDetails();
  const [sessionToken, setSessionToken] = useState(() => generateSessionToken());
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal query when value prop changes externally (e.g. form.reset)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const { data: suggestions = [] } = useLocationAutocomplete(
    query,
    context,
    sessionToken,
  );

  const hasSuggestions = suggestions.length > 0;

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    if (val.length >= 2) setOpen(true);
    else setOpen(false);
  };

  const handleSelect = async (suggestion: AutocompleteSuggestion) => {
    try {
      const fullSuggestion = await detailsMutation.mutateAsync({
        placeId: suggestion.placeId,
        sessionToken,
      });
      setQuery(fullSuggestion.shortName);
      onChange(fullSuggestion.shortName);
      onSelect?.(fullSuggestion);
      setOpen(false);
      inputRef.current?.blur();
      setSessionToken(generateSessionToken());
    } catch {
      // silently fail — user can try another suggestion
    }
  };

  return (
    <Popover open={open && hasSuggestions} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          name={name}
          ref={inputRef}
          value={query}
          onChange={handleInputChange}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => {
            if (query.length >= 2 && hasSuggestions) setOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "h-12 text-base border-input focus-visible:border-ring focus-visible:ring-ring rounded-md",
            className,
          )}
        />
      </PopoverAnchor>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {suggestions.slice(0, 5).map((suggestion) => (
              <CommandItem
                key={suggestion.placeId}
                value={suggestion.displayName}
                onSelect={() => handleSelect(suggestion)}
                className="flex items-start gap-2 py-2 px-3 cursor-pointer"
              >
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {suggestion.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {suggestion.displayAddress}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
