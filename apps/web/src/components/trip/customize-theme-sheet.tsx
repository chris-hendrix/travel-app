"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { THEME_PRESETS } from "@tripful/shared/config";
import type { ThemeFont } from "@tripful/shared/types";
import { toast } from "sonner";
import {
  useUpdateTrip,
  getUpdateTripErrorMessage,
  type Trip,
} from "@/hooks/use-trips";
import { tripKeys } from "@/hooks/trip-queries";
import { apiRequest } from "@/lib/api";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/trip/image-upload";
import { ThemePicker } from "@/components/trip/theme-picker";
import { FontPicker } from "@/components/trip/font-picker";
import { useThemePreview } from "@/hooks/use-theme-preview";
import { Loader2, Trash2 } from "lucide-react";

interface CustomizeThemeSheetProps {
  trip: Trip;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomizeThemeSheet({
  trip,
  open,
  onOpenChange,
}: CustomizeThemeSheetProps) {
  const queryClient = useQueryClient();
  const { mutate: updateTrip } = useUpdateTrip();

  const [themeId, setThemeId] = useState<string | null>(trip.themeId ?? null);
  const [themeFont, setThemeFont] = useState<string | null>(
    trip.themeFont ?? null,
  );
  const [isRemovingCover, setIsRemovingCover] = useState(false);

  // Reset local state when trip changes or sheet opens
  useEffect(() => {
    if (open) {
      setThemeId(trip.themeId ?? null);
      setThemeFont(trip.themeFont ?? null);
    }
  }, [open, trip.themeId, trip.themeFont]);

  const { commit: commitThemePreview } = useThemePreview({
    themeId,
    themeFont,
    initialThemeId: trip.themeId ?? null,
    initialThemeFont: trip.themeFont ?? null,
    enabled: open,
  });

  // Track whether we're in the initial sync to avoid auto-suggesting font
  const isInitializing = useRef(false);

  useEffect(() => {
    if (open) {
      isInitializing.current = true;
      requestAnimationFrame(() => {
        isInitializing.current = false;
      });
    }
  }, [open]);

  const handleThemeChange = useCallback(
    (newThemeId: string | null) => {
      setThemeId(newThemeId);

      // Auto-suggest font when theme changes and no font is currently set
      let newFont = themeFont;
      if (!isInitializing.current && newThemeId && !themeFont) {
        const preset = THEME_PRESETS.find((p) => p.id === newThemeId);
        if (preset?.suggestedFont) {
          newFont = preset.suggestedFont;
          setThemeFont(newFont);
        }
      }

      // Fire mutation with both themeId and potentially auto-suggested font
      const data: { themeId: string | null; themeFont?: ThemeFont | null } = {
        themeId: newThemeId,
      };
      if (newFont !== themeFont) {
        data.themeFont = newFont as ThemeFont | null;
      }

      updateTrip(
        { tripId: trip.id, data },
        {
          onError: (error) => {
            toast.error(
              getUpdateTripErrorMessage(error) ??
                "Failed to update theme. Please try again.",
            );
            // Revert local state on error
            setThemeId(trip.themeId ?? null);
            setThemeFont(trip.themeFont ?? null);
          },
        },
      );
    },
    [trip.id, trip.themeId, trip.themeFont, themeFont, updateTrip],
  );

  const handleFontChange = useCallback(
    (newFont: string | null) => {
      setThemeFont(newFont);

      updateTrip(
        { tripId: trip.id, data: { themeFont: newFont as ThemeFont | null } },
        {
          onError: (error) => {
            toast.error(
              getUpdateTripErrorMessage(error) ??
                "Failed to update font. Please try again.",
            );
            // Revert local state on error
            setThemeFont(trip.themeFont ?? null);
          },
        },
      );
    },
    [trip.id, trip.themeFont, updateTrip],
  );

  const handleCoverUpload = useCallback(
    (_url: string | null) => {
      // ImageUpload handles the upload directly via tripId prop.
      // Invalidate the trip query so the hero updates.
      void queryClient.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
      void queryClient.invalidateQueries({
        queryKey: tripKeys.all,
        exact: true,
      });
    },
    [queryClient, trip.id],
  );

  const handleRemoveCover = useCallback(async () => {
    setIsRemovingCover(true);
    try {
      await apiRequest(`/trips/${trip.id}/cover-image`, {
        method: "DELETE",
      });
      void queryClient.invalidateQueries({
        queryKey: tripKeys.detail(trip.id),
      });
      void queryClient.invalidateQueries({
        queryKey: tripKeys.all,
        exact: true,
      });
    } catch {
      toast.error("Failed to remove cover photo. Please try again.");
    } finally {
      setIsRemovingCover(false);
    }
  }, [queryClient, trip.id]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        // Sheet is closing — commit the preview since changes are already saved
        commitThemePreview();
      }
      onOpenChange(newOpen);
    },
    [commitThemePreview, onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Customize
          </SheetTitle>
          <SheetDescription>
            Personalize your trip's look and feel
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-6">
            {/* Cover Photo */}
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">
                Cover photo
              </h3>
              <ImageUpload
                value={trip.coverImageUrl}
                onChange={handleCoverUpload}
                tripId={trip.id}
              />
              {trip.coverImageUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveCover}
                  disabled={isRemovingCover}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {isRemovingCover ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1.5" />
                  )}
                  {isRemovingCover ? "Removing..." : "Remove cover photo"}
                </Button>
              )}
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">Theme</h3>
              <p className="text-sm text-muted-foreground">
                Choose a visual theme for your trip
              </p>
              <ThemePicker value={themeId} onChange={handleThemeChange} />
            </div>

            {/* Font */}
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">Font</h3>
              <p className="text-sm text-muted-foreground">
                Choose a font for trip titles
              </p>
              <FontPicker value={themeFont} onChange={handleFontChange} />
            </div>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
