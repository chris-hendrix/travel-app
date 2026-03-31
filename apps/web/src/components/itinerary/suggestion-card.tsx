"use client";

import { memo } from "react";
import { ExternalLink, Lightbulb, X } from "lucide-react";
import type { SuggestionCard as SuggestionCardType } from "@journiful/shared/types";

interface SuggestionCardProps {
  suggestion: SuggestionCardType;
  onDismiss: (suggestionType: string, suggestionKey: string) => void;
  onClickLink?: (suggestionId: string) => void;
}

export const SuggestionCard = memo(function SuggestionCard({
  suggestion,
  onDismiss,
  onClickLink,
}: SuggestionCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 p-3 my-1.5">
      <Lightbulb className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {suggestion.description}
        </p>
        <a
          href={suggestion.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onClickLink?.(suggestion.id)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-1.5 hover:underline"
        >
          Browse on {suggestion.partner.name}
          <ExternalLink className="w-3 h-3" />
        </a>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          We may earn a commission
        </p>
      </div>
      <button
        onClick={() => onDismiss(suggestion.gapType, suggestion.dismissKey)}
        className="p-1 shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors rounded-sm"
        aria-label="Dismiss suggestion"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});
