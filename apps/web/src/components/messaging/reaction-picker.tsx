"use client";

import { useState } from "react";
import { SmilePlus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AllowedReaction } from "@journiful/shared/types";
import { ALLOWED_REACTIONS, REACTION_EMOJI_MAP } from "@journiful/shared/types";

interface ReactionPickerProps {
  onSelect: (emoji: AllowedReaction) => void;
  disabled?: boolean | undefined;
}

export function ReactionPicker({ onSelect, disabled }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Add reaction"
        >
          <SmilePlus className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" side="top" align="start">
        <div className="flex gap-1" role="group" aria-label="Pick a reaction">
          {ALLOWED_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="rounded-md p-1.5 text-lg hover:bg-muted transition-colors"
              aria-label={`React with ${emoji}`}
            >
              {REACTION_EMOJI_MAP[emoji]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
