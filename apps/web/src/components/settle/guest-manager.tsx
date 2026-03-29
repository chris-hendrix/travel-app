"use client";

import { useState } from "react";
import { UserPlus, Pencil, Trash2, Check, X } from "lucide-react";
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
  AlertDialogTrigger,
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
}

export function GuestManager({ tripId }: GuestManagerProps) {
  const { data: guests, isPending } = useGuests(tripId);
  const createGuest = useCreateGuest();
  const updateGuest = useUpdateGuest();
  const deleteGuest = useDeleteGuest();

  const [newGuestName, setNewGuestName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAddGuest = () => {
    const trimmed = newGuestName.trim();
    if (!trimmed) return;

    createGuest.mutate(
      { tripId, data: { name: trimmed } },
      {
        onSuccess: () => setNewGuestName(""),
      },
    );
  };

  const handleStartEdit = (guest: Guest) => {
    setEditingId(guest.id);
    setEditName(guest.name);
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

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleDelete = (guestId: string) => {
    deleteGuest.mutate(guestId);
  };

  const error =
    getGuestErrorMessage(createGuest.error) ||
    getGuestErrorMessage(updateGuest.error) ||
    getGuestErrorMessage(deleteGuest.error);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Guests</h3>

      {/* Guest list */}
      {isPending ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      ) : guests && guests.length > 0 ? (
        <ul className="space-y-1">
          {guests.map((guest) => (
            <li
              key={guest.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              {editingId === guest.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(guest.id);
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleSaveEdit(guest.id)}
                    disabled={updateGuest.isPending}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={handleCancelEdit}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm">{guest.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
                    onClick={() => handleStartEdit(guest)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove guest</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove {guest.name}? If this
                          guest has payments, the request will be rejected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(guest.id)}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No guests yet. Add someone who isn&apos;t a trip member.
        </p>
      )}

      {/* Add guest input */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Guest name"
          value={newGuestName}
          onChange={(e) => setNewGuestName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddGuest();
          }}
          className="h-8 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={handleAddGuest}
          disabled={!newGuestName.trim() || createGuest.isPending}
        >
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
