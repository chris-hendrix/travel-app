"use client";

import { memo, useCallback, useRef, useState } from "react";
import {
  EllipsisVertical,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useEditMessage,
  useDeleteMessage,
  usePinMessage,
  getEditMessageErrorMessage,
  getDeleteMessageErrorMessage,
  getPinMessageErrorMessage,
} from "@/hooks/use-messages";
import { useAuth } from "@/app/providers/auth-provider";
import { getUploadUrl } from "@/lib/api";
import { getInitials, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MessageReactions } from "./message-reactions";
import { MessageReplies } from "./message-replies";
import type { MessageWithReplies } from "@journiful/shared/types";

const MAX_LENGTH = 2000;
const CHAR_COUNT_THRESHOLD = 1800;

interface MessageCardProps {
  message: MessageWithReplies;
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean | undefined;
  disabledMessage?: string | undefined;
}

export const MessageCard = memo(function MessageCard({
  message,
  tripId,
  isOrganizer,
  disabled,
  disabledMessage,
}: MessageCardProps) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const editMessage = useEditMessage(tripId);
  const deleteMessage = useDeleteMessage(tripId);
  const pinMessage = usePinMessage(tripId);

  const isOwner = message.authorId === user?.id;
  const isDeleted = message.deletedAt !== null;
  const canEdit = isOwner && !isDeleted && !disabled;
  const canDelete = (isOwner || isOrganizer) && !isDeleted && !disabled;
  const canPin = isOrganizer && !isDeleted && !disabled;
  const showActions = canEdit || canDelete || canPin;

  const handleSaveEdit = useCallback(() => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      return;
    }

    editMessage.mutate(
      { messageId: message.id, data: { content: trimmed } },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
        onError: (error) => {
          const msg = getEditMessageErrorMessage(error);
          toast.error(msg ?? "Failed to edit message");
        },
      },
    );
  }, [editContent, message.id, message.content, editMessage]);

  const handleDelete = useCallback(() => {
    deleteMessage.mutate(message.id, {
      onError: (error) => {
        const msg = getDeleteMessageErrorMessage(error);
        toast.error(msg ?? "Failed to delete message");
      },
    });
  }, [message.id, deleteMessage]);

  const handleTogglePin = useCallback(() => {
    pinMessage.mutate(
      { messageId: message.id, data: { pinned: !message.isPinned } },
      {
        onError: (error) => {
          const msg = getPinMessageErrorMessage(error);
          toast.error(msg ?? "Failed to update pin");
        },
      },
    );
  }, [message.id, message.isPinned, pinMessage]);

  const adjustEditHeight = useCallback(() => {
    const textarea = editTextareaRef.current;
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

  if (isDeleted) {
    return (
      <article
        className="bg-card rounded-md border border-border p-3 sm:p-4 motion-safe:animate-[messageIn_300ms_ease-out]"
        aria-label="Deleted message"
      >
        <div className="flex items-start gap-3">
          <Avatar size="default">
            <AvatarFallback>
              {getInitials(message.author.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-muted-foreground">
                {message.author.displayName}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(message.createdAt)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground italic mt-1">
              This message was deleted
            </p>
          </div>
        </div>
        {message.replyCount > 0 && (
          <div className="mt-3">
            <MessageReplies
              message={message}
              tripId={tripId}
              disabled={disabled}
              disabledMessage={disabledMessage}
            />
          </div>
        )}
      </article>
    );
  }

  return (
    <article
      className="bg-card rounded-md border border-border p-3 sm:p-4 hover:shadow-sm transition-shadow motion-safe:animate-[messageIn_300ms_ease-out]"
      aria-label={`Message from ${message.author.displayName}`}
    >
      <div className="flex items-start gap-3">
        <Avatar size="default">
          <AvatarImage
            src={getUploadUrl(message.author.profilePhotoUrl)}
            alt={message.author.displayName}
          />
          <AvatarFallback>
            {getInitials(message.author.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-sm">
                {message.author.displayName}
              </span>
              {message.isPinned && (
                <Pin className="w-3 h-3 text-primary shrink-0" />
              )}
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(message.createdAt)}
              </span>
              {message.editedAt && (
                <span className="text-xs text-muted-foreground">(edited)</span>
              )}
            </div>
            {showActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={`Actions for message by ${message.author.displayName}`}
                  >
                    <EllipsisVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditContent(message.content);
                        setIsEditing(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canPin && (
                    <DropdownMenuItem onSelect={handleTogglePin}>
                      {message.isPinned ? (
                        <>
                          <PinOff className="w-4 h-4" />
                          Unpin
                        </>
                      ) : (
                        <>
                          <Pin className="w-4 h-4" />
                          Pin
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setShowDeleteConfirm(true)}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {isEditing ? (
            <div className="mt-2">
              <textarea
                ref={editTextareaRef}
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value.slice(0, MAX_LENGTH));
                  adjustEditHeight();
                }}
                className="w-full resize-none bg-muted/50 rounded-md border border-border p-2 text-sm outline-none focus:border-primary"
                rows={2}
                disabled={editMessage.isPending}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    onClick={handleSaveEdit}
                    disabled={!editContent.trim() || editMessage.isPending}
                  >
                    {editMessage.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setIsEditing(false)}
                    disabled={editMessage.isPending}
                  >
                    Cancel
                  </Button>
                </div>
                {editContent.length > CHAR_COUNT_THRESHOLD && (
                  <span
                    className={cn(
                      "text-xs text-muted-foreground",
                      editContent.length >= MAX_LENGTH && "text-destructive",
                    )}
                  >
                    {editContent.length}/{MAX_LENGTH}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap mt-1">
              {message.content}
            </p>
          )}

          <div className="mt-3">
            <MessageReactions
              messageId={message.id}
              tripId={tripId}
              reactions={message.reactions}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      {(message.replyCount > 0 || !disabled) && (
        <div className="mt-3">
          <MessageReplies
            message={message}
            tripId={tripId}
            disabled={disabled}
            disabledMessage={disabledMessage}
          />
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMessage.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMessage.isPending}
            >
              {deleteMessage.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
});
