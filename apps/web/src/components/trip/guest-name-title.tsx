"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import type { MemberWithProfile } from "@journiful/shared/types";
import { SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  useUpdateGuest,
  getUpdateGuestErrorMessage,
} from "@/hooks/use-guest-members";

interface GuestNameTitleProps {
  member: MemberWithProfile;
  tripId: string;
}

export function GuestNameTitle({ member, tripId }: GuestNameTitleProps) {
  const updateGuest = useUpdateGuest(tripId);
  const [name, setName] = useState(member.displayName);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync if the member row changes underneath us (claim,
  // refetch) while the sheet is open.
  useEffect(() => {
    if (!editing) setName(member.displayName);
  }, [member.displayName, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleBlur = async () => {
    const trimmed = name.trim();
    setEditing(false);
    if (!trimmed || trimmed === member.displayName) {
      setName(member.displayName);
      setError(null);
      return;
    }
    setError(null);
    try {
      await updateGuest.mutateAsync({
        memberId: member.id,
        data: { displayName: trimmed },
      });
      toast.success("Guest updated");
    } catch (err) {
      setError(
        getUpdateGuestErrorMessage(err as Error) ?? "Failed to update guest",
      );
      setName(member.displayName);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setName(member.displayName);
      setError(null);
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex w-full flex-col items-start gap-1">
        <SheetTitle className="sr-only">{member.displayName}</SheetTitle>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit guest name"
          className="group flex items-center gap-1.5 rounded-sm text-left font-playfair text-3xl font-semibold tracking-tight md:text-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {member.displayName}
          <Pencil
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </button>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-1">
      <SheetTitle className="sr-only">{member.displayName}</SheetTitle>
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label="Guest name"
        className="h-auto w-full border-transparent bg-transparent p-0 text-left font-playfair text-3xl font-semibold tracking-tight shadow-none md:text-3xl focus-visible:border-transparent focus-visible:underline focus-visible:ring-0"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
