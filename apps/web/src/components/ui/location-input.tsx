"use client";

import { useState, useRef, type ChangeEvent } from "react";
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
import {
  useLocationAutocomplete,
  type LocationSuggestion,
} from "@/hooks/use-location-autocomplete";
import { cn } from "@/lib/utils";

interface LocationInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (result: LocationSuggestion) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function LocationInput({
  id,
  name,
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  className,
}: LocationInputProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: suggestions = [] } = useLocationAutocomplete(query);

  const hasSuggestions = suggestions.length > 0;

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    if (val.length >= 2) setOpen(true);
    else setOpen(false);
  };

  const handleSelect = (suggestion: LocationSuggestion) => {
    setQuery(suggestion.displayName);
    onChange(suggestion.displayName);
    onSelect?.(suggestion);
    setOpen(false);
    inputRef.current?.blur();
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
            {suggestions.map((suggestion, i) => (
              <CommandItem
                key={`${suggestion.lat}-${suggestion.lon}-${i}`}
                value={suggestion.displayName}
                onSelect={() => handleSelect(suggestion)}
                className="flex items-start gap-2 py-2 px-3 cursor-pointer"
              >
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {suggestion.displayPlace}
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
