"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getUploadUrl } from "@/lib/api";
import { getInitials, formatRelativeTime } from "@/lib/format";
import { MessageInput } from "./message-input";
import { MessageReactions } from "./message-reactions";
import type { Message, MessageWithReplies } from "@journiful/shared/types";

interface MessageRepliesProps {
  message: MessageWithReplies;
  tripId: string;
  disabled?: boolean | undefined;
  disabledMessage?: string | undefined;
}

function ReplyCard({
  reply,
  tripId,
  disabled,
}: {
  reply: Message;
  tripId: string;
  disabled?: boolean | undefined;
}) {
  const isDeleted = reply.deletedAt !== null;

  if (isDeleted) {
    return (
      <div className="py-2">
        <p className="text-sm text-muted-foreground italic">
          This message was deleted
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex items-start gap-2">
        <Avatar size="sm">
          <AvatarImage
            src={getUploadUrl(reply.author.profilePhotoUrl)}
            alt={reply.author.displayName}
          />
          <AvatarFallback>
            {getInitials(reply.author.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs">
              {reply.author.displayName}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(reply.createdAt)}
            </span>
            {reply.editedAt && (
              <span className="text-xs text-muted-foreground">(edited)</span>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap mt-0.5">{reply.content}</p>
          {reply.reactions.length > 0 && (
            <div className="mt-1.5">
              <MessageReactions
                messageId={reply.id}
                tripId={tripId}
                reactions={reply.reactions}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageReplies({
  message,
  tripId,
  disabled,
  disabledMessage,
}: MessageRepliesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);

  const { replies, replyCount } = message;
  const hiddenCount = replyCount - 2;
  const visibleReplies = isExpanded ? replies : replies.slice(-2);

  if (replyCount === 0 && disabled) {
    return null;
  }

  return (
    <div className="ml-4 pl-3 sm:ml-6 sm:pl-4 border-l-2 border-border">
      {hiddenCount > 0 && !isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="text-sm text-primary hover:underline mb-2 inline-flex items-center gap-1"
          aria-expanded={false}
          aria-label="Show more replies"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          View {hiddenCount} more {hiddenCount === 1 ? "reply" : "replies"}
        </button>
      )}

      {isExpanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="text-sm text-primary hover:underline mb-2 inline-flex items-center gap-1"
          aria-expanded={true}
          aria-label="Hide replies"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          Hide replies
        </button>
      )}

      <div className="space-y-1">
        {visibleReplies.map((reply) => (
          <ReplyCard
            key={reply.id}
            reply={reply}
            tripId={tripId}
            disabled={disabled}
          />
        ))}
      </div>

      {!disabled && (
        <>
          {!showReplyInput ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground mt-1"
              onClick={() => setShowReplyInput(true)}
            >
              Reply
            </Button>
          ) : (
            <div className="mt-2">
              <MessageInput
                tripId={tripId}
                parentId={message.id}
                compact
                disabled={false}
                disabledMessage={disabledMessage}
                onMessageSent={() => setShowReplyInput(false)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
