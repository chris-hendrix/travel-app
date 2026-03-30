"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useMessages } from "@/hooks/use-messages";
import {
  MessageInput,
  MessageCard,
  PinnedMessages,
} from "@/components/messaging";

interface MessagesPanelProps {
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean;
  isMuted?: boolean;
}

function MessageSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-card rounded-md border border-border p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const NEAR_BOTTOM_THRESHOLD = 150;

export function MessagesPanel({
  tripId,
  isOrganizer,
  disabled,
  isMuted,
}: MessagesPanelProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(true);
  const hasScrolledToBottom = useRef(false);
  const prevMessageCount = useRef(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInView(entry.isIntersecting);
        }
      },
      { threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { data, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useMessages(tripId, isInView);

  const messages = (data?.pages.flatMap((p) => p.messages) ?? []).toReversed();
  const hasMore = hasNextPage ?? false;

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }, []);

  // Scroll to bottom on initial load
  useLayoutEffect(() => {
    if (!isPending && messages.length > 0 && !hasScrolledToBottom.current) {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        hasScrolledToBottom.current = true;
      }
    }
  }, [isPending, messages.length]);

  // Auto-scroll when new messages arrive (if near bottom)
  useEffect(() => {
    if (messages.length > prevMessageCount.current && hasScrolledToBottom.current) {
      if (isNearBottom()) {
        const el = scrollRef.current;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
      }
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, isNearBottom]);

  const inputDisabled = disabled === true || isMuted === true;
  const inputDisabledMessage = isMuted
    ? "You have been muted"
    : disabled
      ? "Trip has ended"
      : undefined;

  return (
    <section
      ref={sectionRef}
      className="flex flex-col h-full"
      aria-label="Trip discussion"
    >
      <PinnedMessages messages={messages} />

      {/* Scrollable messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 space-y-3">
        {isPending ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No messages yet"
            description="Start the conversation!"
            className="rounded-lg"
          />
        ) : (
          <div role="feed" aria-busy={isPending} className="space-y-3">
            {hasMore && (
              <div className="flex justify-center py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-sm text-muted-foreground"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Loading..." : "Load earlier messages"}
                </Button>
              </div>
            )}
            {messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                tripId={tripId}
                isOrganizer={isOrganizer}
                disabled={disabled}
                disabledMessage={inputDisabledMessage}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input pinned at bottom */}
      <div className="shrink-0 border-t border-border px-4 py-2 pb-3 bg-background">
        <MessageInput
          tripId={tripId}
          disabled={inputDisabled}
          disabledMessage={inputDisabledMessage}
        />
      </div>
    </section>
  );
}
