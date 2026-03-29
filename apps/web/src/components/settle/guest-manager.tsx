"use client";

import { useState } from "react";
import { UserPlus, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useGuests,
  useCreateGuest,
  useUpdateGuest,
  useDeleteGuest,
  getGuestErrorMessage,
} from "@/hooks/use-guests";
import type { Guest } from "@journiful/shared/types";

interface GuestManagerProps {
  tripId: string;
  disabled?: boolean;
}

export function GuestManager({ tripId, disabled }: GuestManagerProps) {
  const { data: guests, isPending } = useGuests(tripId);
  const createGuest = useCreateGuest();
  const updateGuest = useUpdateGuest();
  const deleteGuest = useDeleteGuest();

  const [newGuestName, setNewGuestName] = useState("");
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [removingGuest, setRemovingGuest] = useState<Guest | null>(null);

  const handleAddGuest = () => {
    const trimmed = newGuestName.trim();
    if (!trimmed) return;

    createGuest.mutate(
      { tripId, data: { name: trimmed } },
      {
        onSuccess: () => {
          setNewGuestName("");
          setIsAddingGuest(false);
        },
      },
    );
  };

  const handleSaveEdit = (guestId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;

    updateGuest.mutate(
      { guestId, data: { name: trimmed } },
      {
        onSuccess: () => setEditingId(null),
      },
    );
  };

  const handleDelete = (guestId: string) => {
    deleteGuest.mutate(guestId, {
      onSuccess: () => setRemovingGuest(null),
    });
  };

  const error =
    getGuestErrorMessage(createGuest.error) ||
    getGuestErrorMessage(updateGuest.error) ||
    getGuestErrorMessage(deleteGuest.error);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Guests are people who aren&apos;t trip members but share expenses.
      </p>

      {/* Guest chips */}
      {isPending ? (
        <div className="flex gap-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-8 w-20 animate-pulse rounded-full bg-muted"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 items-center">
          {guests?.map((guest) =>
            editingId === guest.id ? (
              <div key={guest.id} className="flex items-center gap-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit(guest.id);
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditName("");
                    }
                  }}
                  className="h-7 w-28 text-sm"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => handleSaveEdit(guest.id)}
                  disabled={updateGuest.isPending}
                >
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                key={guest.id}
                type="button"
                onClick={() => {
                  if (disabled) return;
                  setEditingId(guest.id);
                  setEditName(guest.name);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm hover:bg-accent/50 transition-colors cursor-pointer group"
              >
                <span>{guest.name}</span>
                {!disabled && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemovingGuest(guest);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setRemovingGuest(guest);
                      }
                    }}
                    className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                    aria-label={`Remove ${guest.name}`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            ),
          )}

          {/* Add guest — inline with chips */}
          {!disabled &&
            (isAddingGuest ? (
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Name"
                  value={newGuestName}
                  onChange={(e) => setNewGuestName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddGuest();
                    if (e.key === "Escape") {
                      setIsAddingGuest(false);
                      setNewGuestName("");
                    }
                  }}
                  className="h-7 w-28 text-sm"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={handleAddGuest}
                  disabled={!newGuestName.trim() || createGuest.isPending}
                >
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingGuest(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Remove confirmation dialog */}
      <AlertDialog
        open={!!removingGuest}
        onOpenChange={(open) => {
          if (!open) setRemovingGuest(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove guest</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {removingGuest?.name}? If this
              guest has payments, the request will be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removingGuest && handleDelete(removingGuest.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
