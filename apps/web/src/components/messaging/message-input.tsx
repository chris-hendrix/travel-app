"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  useCreateMessage,
  getCreateMessageErrorMessage,
} from "@/hooks/use-messages";
import { useAuth } from "@/app/providers/auth-provider";
import { cn } from "@/lib/utils";
import { getUploadUrl } from "@/lib/api";
import { getInitials } from "@/lib/format";
import { toast } from "sonner";

const MAX_LENGTH = 2000;
const CHAR_COUNT_THRESHOLD = 1000;
const CHAR_COUNT_WARNING = 1800;

interface MessageInputProps {
  tripId: string;
  parentId?: string | undefined;
  disabled?: boolean | undefined;
  disabledMessage?: string | undefined;
  compact?: boolean | undefined;
  onMessageSent?: (() => void) | undefined;
}

export function MessageInput({
  tripId,
  parentId,
  disabled,
  disabledMessage,
  compact,
  onMessageSent,
}: MessageInputProps) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createMessage = useCreateMessage(tripId);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (prefersReducedMotion) {
        textarea.style.transition = "none";
      }
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed || createMessage.isPending) return;

    createMessage.mutate(
      { content: trimmed, parentId },
      {
        onSuccess: () => {
          setContent("");
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
          onMessageSent?.();
        },
        onError: (error) => {
          const message = getCreateMessageErrorMessage(error);
          toast.error(message ?? "Failed to send message");
        },
      },
    );
  }, [content, parentId, createMessage, onMessageSent]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (disabled) {
    return (
      <div
        className={cn(
          "bg-card rounded-md border border-border p-4",
          compact && "p-3",
        )}
      >
        <p className="text-sm text-muted-foreground text-center">
          {disabledMessage ?? "Messages are disabled"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card rounded-md border border-border p-4",
        compact && "p-3",
      )}
    >
      <div className="flex items-end gap-3">
        {!compact && user && (
          <Avatar size="default">
            <AvatarImage
              src={getUploadUrl(user.profilePhotoUrl)}
              alt={user.displayName}
            />
            <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1 min-w-0">
          {content.length > CHAR_COUNT_THRESHOLD && (
            <div
              id="char-count"
              className="text-xs text-muted-foreground mb-1"
              aria-live="polite"
            >
              <span
                className={cn(
                  content.length >= CHAR_COUNT_WARNING &&
                    content.length < MAX_LENGTH &&
                    "text-warning",
                  content.length >= MAX_LENGTH && "text-destructive",
                )}
              >
                {content.length}/{MAX_LENGTH}
              </span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value.slice(0, MAX_LENGTH));
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={compact ? "Write a reply..." : "Write a message..."}
            aria-label={compact ? "Write a reply" : "Write a message"}
            aria-describedby="char-count"
            className={cn(
              "w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground outline-none",
              compact ? "min-h-[36px]" : "min-h-[36px]",
            )}
            rows={1}
            disabled={createMessage.isPending}
          />
        </div>
        <Button
          variant="gradient"
          size={compact ? "icon-xs" : "icon"}
          className="shrink-0"
          onClick={handleSend}
          disabled={!content.trim() || createMessage.isPending}
          aria-label="Send message"
        >
          {createMessage.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
