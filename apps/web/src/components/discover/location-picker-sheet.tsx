"use client";

import { MapPin, Building2, Check } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface LocationPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripDestination: { lat: number; lon: number; name: string } | null;
  accommodations: Array<{
    id: string;
    name: string;
    address: string | null;
    addressLat: number;
    addressLon: number;
  }>;
  selectedLocation: { lat: number; lon: number; name: string };
  onSelect: (location: { lat: number; lon: number; name: string }) => void;
}

function isNearby(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): boolean {
  return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lon - b.lon) < 0.0001;
}

export function LocationPickerSheet({
  open,
  onOpenChange,
  tripDestination,
  accommodations,
  selectedLocation,
  onSelect,
}: LocationPickerSheetProps) {
  const validAccommodations = accommodations.filter(
    (a) => a.addressLat != null && a.addressLon != null,
  );

  const handleSelect = (location: {
    lat: number;
    lon: number;
    name: string;
  }) => {
    onSelect(location);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Search near</SheetTitle>
          <SheetDescription>
            Choose a location to discover nearby places
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-1">
            {tripDestination && (
              <LocationRow
                icon={MapPin}
                name={tripDestination.name}
                subtitle={null}
                selected={isNearby(tripDestination, selectedLocation)}
                onClick={() => {
                  handleSelect({
                    lat: tripDestination.lat,
                    lon: tripDestination.lon,
                    name: tripDestination.name,
                  });
                }}
              />
            )}
            {validAccommodations.map((a) => (
              <LocationRow
                key={a.id}
                icon={Building2}
                name={a.name}
                subtitle={a.address}
                selected={isNearby(
                  { lat: a.addressLat, lon: a.addressLon },
                  selectedLocation,
                )}
                onClick={() => {
                  handleSelect({
                    lat: a.addressLat,
                    lon: a.addressLon,
                    name: a.name,
                  });
                }}
              />
            ))}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

interface LocationRowProps {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  name: string;
  subtitle: string | null;
  selected: boolean;
  onClick: () => void;
}

function LocationRow({
  icon: Icon,
  name,
  subtitle,
  selected,
  onClick,
}: LocationRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-4 py-3 text-left transition-colors",
        selected ? "bg-primary/5" : "hover:bg-muted",
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{name}</div>
        {subtitle && (
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
