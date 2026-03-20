"use client";

import { useState } from "react";
import { Pin, ChevronDown, ChevronUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUploadUrl } from "@/lib/api";
import { getInitials } from "@/lib/format";
import type { MessageWithReplies } from "@journiful/shared/types";

interface PinnedMessagesProps {
  messages: MessageWithReplies[];
}

export function PinnedMessages({ messages }: PinnedMessagesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const pinnedMessages = messages.filter(
    (m) => m.isPinned && m.deletedAt === null,
  );

  if (pinnedMessages.length === 0) return null;

  return (
    <div
      data-testid="pinned-messages"
      className="bg-primary/5 border border-primary/20 rounded-md p-4"
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={
          isExpanded ? "Collapse pinned messages" : "Expand pinned messages"
        }
        className="flex items-center gap-2 w-full"
      >
        <Pin className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-medium text-primary">
          Pinned ({pinnedMessages.length})
        </span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-primary ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-primary ml-auto" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {pinnedMessages.map((message) => (
            <div key={message.id} className="flex items-start gap-2">
              <Avatar size="sm">
                <AvatarImage
                  src={getUploadUrl(message.author.profilePhotoUrl)}
                  alt={message.author.displayName}
                />
                <AvatarFallback>
                  {getInitials(message.author.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-xs">
                  {message.author.displayName}
                </span>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                  {message.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
