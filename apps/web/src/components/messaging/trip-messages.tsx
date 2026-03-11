"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useMessages } from "@/hooks/use-messages";
import { MessageInput } from "./message-input";
import { MessageCard } from "./message-card";
import { PinnedMessages } from "./pinned-messages";

interface TripMessagesProps {
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean | undefined;
  isMuted?: boolean | undefined;
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

export function TripMessages({
  tripId,
  isOrganizer,
  disabled,
  isMuted,
}: TripMessagesProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [isInView, setIsInView] = useState(true);

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

  const messages = data?.pages.flatMap((p) => p.messages) ?? [];
  const total = data?.pages[0]?.meta?.total ?? 0;
  const hasMore = hasNextPage ?? false;

  const inputDisabled = disabled === true || isMuted === true;
  const inputDisabledMessage = isMuted
    ? "You have been muted"
    : disabled
      ? "Trip has ended"
      : undefined;

  return (
    <section
      ref={sectionRef}
      id="discussion"
      className="space-y-4"
      aria-label="Trip discussion"
    >
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold font-playfair">Discussion</h2>
        {total > 0 && (
          <span className="text-muted-foreground text-sm mt-1">{total}</span>
        )}
      </div>

      <PinnedMessages messages={messages} />

      <MessageInput
        tripId={tripId}
        disabled={inputDisabled}
        disabledMessage={inputDisabledMessage}
      />

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
        </div>
      )}
    </section>
  );
}
