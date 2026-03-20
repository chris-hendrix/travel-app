"use client";

import { THEME_FONT_VALUES } from "@journiful/shared/types";
import { THEME_FONTS, FONT_DISPLAY_NAMES } from "@journiful/shared/config";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface FontPickerProps {
  value: string | null;
  onChange: (font: string | null) => void;
}

export function FontPicker({ value, onChange }: FontPickerProps) {
  return (
    <div className="space-y-2">
      {THEME_FONT_VALUES.map((font) => {
        const isSelected = value === font;
        const isDefault = font === "plus-jakarta";

        return (
          <button
            key={font}
            type="button"
            onClick={() => onChange(isSelected ? null : font)}
            className={cn(
              "w-full rounded-md border p-3 cursor-pointer text-left transition-all",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p
                  className="text-sm font-medium text-foreground"
                  style={{ fontFamily: THEME_FONTS[font] }}
                >
                  {FONT_DISPLAY_NAMES[font]}
                  {isDefault && (
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      (default)
                    </span>
                  )}
                </p>
                <p
                  className="text-xs text-muted-foreground"
                  style={{ fontFamily: THEME_FONTS[font] }}
                >
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 ml-2">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
