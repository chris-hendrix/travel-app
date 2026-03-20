"use client";

import { useCallback } from "react";
import {
  useToggleReaction,
  getToggleReactionErrorMessage,
} from "@/hooks/use-messages";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ReactionSummary, AllowedReaction } from "@journiful/shared/types";
import { REACTION_EMOJI_MAP } from "@journiful/shared/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReactionPicker } from "./reaction-picker";

interface MessageReactionsProps {
  messageId: string;
  tripId: string;
  reactions: ReactionSummary[];
  disabled?: boolean | undefined;
}

function formatReactorNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length <= 10) return names.join(", ");
  const shown = names.slice(0, 10);
  const remaining = names.length - 10;
  return `${shown.join(", ")} and ${remaining} ${remaining === 1 ? "other" : "others"}`;
}

export function MessageReactions({
  messageId,
  tripId,
  reactions,
  disabled,
}: MessageReactionsProps) {
  const toggleReaction = useToggleReaction(tripId);

  const handleToggle = useCallback(
    (emoji: AllowedReaction) => {
      if (disabled || toggleReaction.isPending) return;

      toggleReaction.mutate(
        { messageId, data: { emoji } },
        {
          onError: (error) => {
            const message = getToggleReactionErrorMessage(error);
            toast.error(message ?? "Failed to toggle reaction");
          },
        },
      );
    },
    [messageId, disabled, toggleReaction],
  );

  const activeReactions = reactions.filter((r) => r.count > 0);

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Reactions"
    >
      <TooltipProvider>
        {activeReactions.map((reaction) => {
          const emoji = reaction.emoji as AllowedReaction;
          const emojiChar = REACTION_EMOJI_MAP[emoji] ?? reaction.emoji;
          const tooltipText = formatReactorNames(reaction.reactorNames);

          return (
            <Tooltip key={emoji}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleToggle(emoji)}
                  disabled={disabled}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-sm border transition-colors inline-flex items-center gap-1",
                    reaction.reacted
                      ? "bg-primary/10 border-primary/30 text-primary motion-safe:animate-[reactionPop_200ms_ease-in-out]"
                      : "bg-muted/50 border-transparent hover:bg-muted text-muted-foreground",
                    disabled && "opacity-50 cursor-not-allowed",
                  )}
                  aria-label={`React with ${emoji}`}
                  aria-pressed={reaction.reacted}
                >
                  <span>{emojiChar}</span>
                  <span className="text-xs">{reaction.count}</span>
                </button>
              </TooltipTrigger>
              {tooltipText && <TooltipContent>{tooltipText}</TooltipContent>}
            </Tooltip>
          );
        })}
      </TooltipProvider>
      <ReactionPicker onSelect={handleToggle} disabled={disabled} />
    </div>
  );
}
