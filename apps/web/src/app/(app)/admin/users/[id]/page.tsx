"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ShieldCheck, ShieldOff, UserCog } from "lucide-react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminUserDetail {
  id: string;
  phoneNumber: string;
  displayName: string;
  profilePhotoUrl: string | null;
  timezone: string | null;
  temperatureUnit: string | null;
  handles: Record<string, string> | null;
  role: string;
  status: string;
  tripCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<
    "ban" | "unban" | "promote" | "demote" | null
  >(null);

  // Impersonation dialog state
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateCode, setImpersonateCode] = useState("");
  const [impersonateError, setImpersonateError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", params.id],
    queryFn: () =>
      apiRequest<{ success: boolean; user: AdminUserDetail }>(
        `/admin/users/${params.id}`,
      ),
  });

  const user = data?.user;

  const updateMutation = useMutation({
    mutationFn: (body: { displayName?: string; timezone?: string }) =>
      apiRequest(`/admin/users/${params.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users", params.id] });
      setIsEditing(false);
    },
  });

  const actionMutation = useMutation({
    mutationFn: (action: "ban" | "unban" | "promote" | "demote") =>
      apiRequest(`/admin/users/${params.id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users", params.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setConfirmAction(null);
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (code: string) =>
      apiRequest(`/admin/impersonate/${params.id}`, {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => {
      // Reload the page to pick up the new impersonation cookie
      window.location.href = "/trips";
    },
    onError: (error: Error) => {
      setImpersonateError(error.message || "Invalid verification code");
    },
  });

  const startEdit = () => {
    if (user) {
      setEditDisplayName(user.displayName);
      setEditTimezone(user.timezone ?? "");
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    const body: { displayName?: string; timezone?: string } = {};
    if (editDisplayName !== user?.displayName) body.displayName = editDisplayName;
    if (editTimezone !== (user?.timezone ?? "")) body.timezone = editTimezone;
    if (Object.keys(body).length > 0) {
      updateMutation.mutate(body);
    } else {
      setIsEditing(false);
    }
  };

  const confirmLabels: Record<string, { title: string; description: string }> = {
    ban: {
      title: "Ban User",
      description:
        "This will suspend the user's account. They will be unable to access any features until unbanned.",
    },
    unban: {
      title: "Unban User",
      description: "This will restore the user's access to the platform.",
    },
    promote: {
      title: "Promote to Admin",
      description:
        "This will grant admin privileges to this user, including user management and impersonation.",
    },
    demote: {
      title: "Demote from Admin",
      description:
        "This will remove admin privileges from this user.",
    },
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-muted-foreground">User not found.</p>
        <Link href="/admin/users" className="text-primary hover:underline mt-2 inline-block">
          Back to user list
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </Link>

      {/* User info header */}
      <div className="bg-card rounded-md border border-border p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold font-playfair">
              {user.displayName || "(no name)"}
            </h1>
            <p className="text-muted-foreground mt-1">{user.phoneNumber}</p>
            <div className="flex gap-2 mt-3">
              <Badge
                variant={user.status === "banned" ? "destructive" : "secondary"}
              >
                {user.status}
              </Badge>
              {user.role === "admin" && <Badge variant="default">admin</Badge>}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>{user.tripCount} trip{user.tripCount !== 1 ? "s" : ""}</p>
            <p className="mt-1">
              Joined {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-card rounded-md border border-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold font-playfair">Profile</h2>
          {!isEditing && (
            <Button variant="outline" size="xs" onClick={startEdit}>
              Edit
            </Button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={editTimezone}
                onChange={(e) => setEditTimezone(e.target.value)}
                placeholder="e.g. America/New_York"
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="xs"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Display Name</dt>
            <dd>{user.displayName || "-"}</dd>
            <dt className="text-muted-foreground">Timezone</dt>
            <dd>{user.timezone || "-"}</dd>
            <dt className="text-muted-foreground">Temperature</dt>
            <dd>{user.temperatureUnit || "-"}</dd>
          </dl>
        )}
      </div>

      {/* Actions */}
      <div className="bg-card rounded-md border border-border p-6">
        <h2 className="text-xl sm:text-2xl font-semibold font-playfair mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {user.status === "active" ? (
            <Button
              variant="destructive"
              size="xs"
              onClick={() => setConfirmAction("ban")}
            >
              <Ban className="h-4 w-4" />
              Ban User
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setConfirmAction("unban")}
            >
              Unban User
            </Button>
          )}

          {user.role !== "admin" ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setConfirmAction("promote")}
            >
              <ShieldCheck className="h-4 w-4" />
              Promote to Admin
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setConfirmAction("demote")}
            >
              <ShieldOff className="h-4 w-4" />
              Demote from Admin
            </Button>
          )}

          {user.role !== "admin" && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                setImpersonateCode("");
                setImpersonateError("");
                setImpersonateOpen(true);
              }}
            >
              <UserCog className="h-4 w-4" />
              Impersonate
            </Button>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-playfair">
              {confirmAction && confirmLabels[confirmAction]?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction && confirmLabels[confirmAction]?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && actionMutation.mutate(confirmAction)}
              disabled={actionMutation.isPending}
            >
              {actionMutation.isPending ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Impersonation dialog */}
      <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-playfair">Impersonate {user.displayName}</DialogTitle>
            <DialogDescription>
              Enter your verification code to confirm your identity. A code will
              be sent to your admin phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="impersonate-code">Verification Code</Label>
              <Input
                id="impersonate-code"
                value={impersonateCode}
                onChange={(e) => {
                  setImpersonateCode(e.target.value);
                  setImpersonateError("");
                }}
                placeholder="123456"
                maxLength={6}
                className="mt-1"
              />
              {impersonateError && (
                <p className="text-sm text-destructive mt-1">
                  {impersonateError}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImpersonateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => impersonateMutation.mutate(impersonateCode)}
              disabled={
                impersonateCode.length !== 6 || impersonateMutation.isPending
              }
            >
              {impersonateMutation.isPending
                ? "Verifying..."
                : "Start Impersonation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
