"use client";

import Image from "next/image";
import { THEME_PRESETS } from "@journiful/shared/config";
import { buildBackground } from "@/lib/theme-styles";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

interface ThemePickerProps {
  value: string | null;
  onChange: (themeId: string | null) => void;
}

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="grid grid-cols-3 gap-2">
        {/* No theme option */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "aspect-square max-w-28 rounded-lg overflow-hidden relative cursor-pointer",
            "flex flex-col items-center justify-center gap-1",
            "bg-muted border border-border",
            "transition-all",
            value === null &&
              "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[9px] font-medium text-muted-foreground">
            None
          </span>
        </button>

        {/* Theme presets */}
        {THEME_PRESETS.map((preset) => {
          const isSelected = value === preset.id;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.id)}
              className={cn(
                "aspect-square max-w-28 rounded-lg overflow-hidden relative cursor-pointer",
                "flex flex-col",
                "transition-all",
                isSelected &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
              style={{ background: buildBackground(preset.background) }}
              title={preset.name}
            >
              {/* Cover image — landscape ratio, fills middle */}
              {preset.defaultCoverUrl && (
                <div className="absolute left-2 right-2 top-2 bottom-[34px] rounded-sm overflow-hidden shadow-sm">
                  <Image
                    src={preset.defaultCoverUrl}
                    alt={preset.name}
                    fill
                    sizes="100px"
                    className="object-cover"
                  />
                  {/* Selected indicator — inside image */}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center shadow">
                      <Check className="w-2 h-2 text-white" />
                    </div>
                  )}
                </div>
              )}

              {/* Fallback selected indicator for themes without cover */}
              {isSelected && !preset.defaultCoverUrl && (
                <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" />
                </div>
              )}

              {/* Bottom strip: name + palette swatches */}
              <div className="absolute bottom-0 left-0 right-0 h-[32px] flex flex-col justify-center px-2 gap-0.5">
                <span
                  className={cn(
                    "text-[10px] font-semibold leading-none truncate",
                    preset.background.isDark
                      ? "text-white/90"
                      : "text-black/70",
                  )}
                >
                  {preset.name}
                </span>
                <div className="flex items-center gap-1">
                  {preset.palette.map((color, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-black/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
