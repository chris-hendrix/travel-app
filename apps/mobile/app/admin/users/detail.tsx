import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { AdminGate } from "@/components/admin/AdminGate";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { Badge } from "@/components/ui/Badge";
import { Fact } from "@/components/ui/Fact";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { useStartImpersonation } from "@/lib/impersonation";
import {
  adminActionsFor,
  pendingLabel,
  plural,
  type AdminAction,
} from "@/lib/admin";
import { joinedDay } from "@/lib/dateRange";
import {
  adminKeys,
  fetchAdminUser,
  updateAdminUser,
  userAction,
  type AdminUserAction,
  type AdminUserDetailRow,
} from "@/lib/queries/admin";
import { requestCode } from "@/lib/queries/auth";
import { toErrorCopy } from "@/lib/queries/errors";

/** What the scaffold's bar shows while the record is being edited. */
type BarSpec = {
  title: string;
  onPress: () => void;
  pending: boolean;
};

/**
 * The user record. `FullscreenDialog title="User"` with
 * `dismissHref="/admin/users"`, so a deep link with nothing to pop
 * back to lands on the list.
 *
 * The save rides the scaffold's own bar: the record reports its bar
 * up through `onBar` (the dialog owns the chrome, the record owns the
 * editing state, and the two meet nowhere else), and `undefined` keeps
 * the bar off the reading state.
 */
export default function AdminUserDetailScreen() {
  const [bar, setBar] = useState<BarSpec | null>(null);
  return (
    <FullscreenDialog
      title="User"
      dismissHref="/admin/users"
      primaryTitle={bar?.title}
      onPrimary={bar?.onPress}
      pending={bar?.pending ?? false}
    >
      <AdminGate label="Loading user">
        <AdminUserRecord onBar={setBar} />
      </AdminGate>
    </FullscreenDialog>
  );
}

function AdminUserRecord({
  onBar,
}: {
  onBar: (bar: BarSpec | null) => void;
}) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  // `?id=`, never a path segment: the web build is a static export
  // with no dynamic routes.
  const userId = typeof id === "string" ? id : undefined;
  const query = useQuery({
    queryKey: adminKeys.user(userId ?? ""),
    queryFn: () => fetchAdminUser(userId ?? ""),
    // An absent id is the not-found state rather than a fetch: the
    // same way the trip dialogs refuse to read a trip they were not
    // given.
    enabled: Boolean(userId),
  });

  if (!userId) {
    return (
      <Text className="font-body text-base text-ink">User not found.</Text>
    );
  }
  if (query.isPending) {
    return <LoadingBlock label="Loading user" />;
  }
  if (query.isError) {
    return (
      <AdminUserFailure
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <AdminUserDetail user={query.data} onBar={onBar} />;
}

/**
 * Where the detail request failed, in place of the record. A 404 is
 * the gone state (`User not found.`, with the band's close as the way
 * back); anything else goes through `toErrorCopy`.
 */
function AdminUserFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <Text className="font-body text-base text-ink">User not found.</Text>
    );
  }
  const copy = toErrorCopy(error);
  // `exactOptionalPropertyTypes` is on: only pass `onRetry` when the
  // copy offers a retry, never an explicit `undefined`.
  const retryProps = copy.retry ? { onRetry } : {};
  if (copy.offline) {
    return <OfflineBlock {...retryProps} />;
  }
  return (
    <InlineError
      message={copy.message ?? "Couldn't load user"}
      {...retryProps}
    />
  );
}

function AdminUserDetail({
  user,
  onBar,
}: {
  user: AdminUserDetailRow;
  onBar: (bar: BarSpec | null) => void;
}) {
  const queryClient = useQueryClient();
  const { user: viewer } = useAuth();
  // The write machine: three pieces of state and no more. `editing`
  // arms the form, `draft` holds it (seeded from the record when Edit
  // is pressed), and ONE `confirm` value so two confirmations can
  // never be open at once. (`saving`/`saveFailure` below are the
  // save's own feedback, not the machine.)
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: "", timezone: "" });
  const [confirm, setConfirm] = useState<AdminAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);

  async function save() {
    const trimmedName = draft.displayName.trim();
    // Clearing the name is refused by `adminUpdateUserSchema`
    // (`min(1)`) and reads as a field error, not a banner.
    if (trimmedName === "") {
      setSaveFailure("Enter a display name.");
      return;
    }
    // Only the fields that CHANGED ride the request.
    const patch: { displayName?: string; timezone?: string } = {};
    if (trimmedName !== user.displayName) patch.displayName = trimmedName;
    const trimmedTimezone = draft.timezone.trim();
    if (trimmedTimezone !== (user.timezone ?? "")) {
      patch.timezone = trimmedTimezone;
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveFailure(null);
    try {
      await updateAdminUser({ id: user.id, ...patch });
      await queryClient.invalidateQueries({
        queryKey: adminKeys.user(user.id),
      });
      await queryClient.invalidateQueries({ queryKey: adminKeys.all });
      setEditing(false);
    } catch (caught) {
      const copy = toErrorCopy(caught);
      setSaveFailure(copy.message ?? "Couldn't save the change.");
    } finally {
      setSaving(false);
    }
  }
  // The bar belongs to the scaffold above, the save to this component:
  // the ref keeps the bar's press on the latest save without re-ariming
  // the effect around a function identity.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!editing) {
      onBar(null);
      return;
    }
    onBar({
      title: saving ? "Saving changes" : "Save changes",
      onPress: () => void saveRef.current(),
      pending: saving,
    });
    return () => onBar(null);
  }, [editing, saving, onBar]);

  function beginEditing() {
    // `adminUpdateUserSchema` accepts exactly these two fields, so
    // temperature and everything else stay read-only facts and never
    // become inputs.
    setDraft({
      displayName: user.displayName,
      timezone: user.timezone ?? "",
    });
    setSaveFailure(null);
    setEditing(true);
  }

  const displayName =
    user.displayName.trim() !== "" ? user.displayName : "No name";
  const saveField = saveFailure ? fieldFor(saveFailure) : null;

  return (
    <View className="gap-5">
      <View className="gap-1">
        <Text className="font-display text-2xl text-ink">{displayName}</Text>
        <Text className="font-body text-base text-ink">
          {user.phoneNumber}
        </Text>
        <View className="flex-row items-center gap-2 pt-1">
          {user.status === "banned" ? (
            <Badge label="Banned" variant="live" size="md" />
          ) : null}
          {user.role === "admin" ? (
            <Badge label="Admin" variant="category" size="md" />
          ) : null}
        </View>
      </View>
      <View className="gap-3">
        <Fact label="Trips">
          <Text className="font-body text-base text-ink">
            {plural(user.tripCount, "trip")}
          </Text>
        </Fact>
        <Fact label="Joined">
          <Text className="font-body text-base text-ink">
            {joinedDay(user.createdAt)}
          </Text>
        </Fact>
      </View>
      <View className="gap-4 border-t border-ink pt-6">
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-xl uppercase leading-none text-ink">
            Profile
          </Text>
          {editing ? (
            <QuietAction label="Cancel" onPress={() => setEditing(false)} />
          ) : (
            <QuietAction label="Edit" onPress={beginEditing} />
          )}
        </View>
        {editing ? (
          <AdminUserForm
            draft={draft}
            onDraftChange={setDraft}
            saveFailure={saveFailure}
            saveField={saveField}
            onSave={() => void saveRef.current()}
          />
        ) : (
          <View className="gap-3">
            <Fact label="Name">
              <Text className="font-body text-base text-ink">
                {displayName}
              </Text>
            </Fact>
            <Fact label="Timezone">
              <Text className="font-body text-base text-ink">
                {user.timezone ?? "Not set"}
              </Text>
            </Fact>
            <Fact label="Temperature">
              <Text className="font-body text-base text-ink">
                {user.temperatureUnit ?? "Not set"}
              </Text>
            </Fact>
          </View>
        )}
      </View>
      <AdminUserActions
        user={user}
        viewerId={viewer?.id}
        confirm={confirm}
        onConfirmChange={setConfirm}
      />
    </View>
  );
}

/**
 * Which field a save failure belongs under, when it names one.
 * Anything else reads above the fields, never under one.
 */
function fieldFor(message: string): "displayName" | "timezone" | null {
  if (/display name/i.test(message)) return "displayName";
  if (/timezone/i.test(message)) return "timezone";
  return null;
}

function AdminUserForm({
  draft,
  onDraftChange,
  saveFailure,
  saveField,
  onSave,
}: {
  draft: { displayName: string; timezone: string };
  onDraftChange: (draft: { displayName: string; timezone: string }) => void;
  saveFailure: string | null;
  saveField: "displayName" | "timezone" | null;
  onSave: () => void;
}) {
  return (
    <View className="gap-4">
      {saveFailure && !saveField ? (
        <InlineError message={saveFailure} onRetry={onSave} />
      ) : null}
      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(displayName) =>
          onDraftChange({ ...draft, displayName })
        }
        error={
          saveField === "displayName" ? (saveFailure ?? undefined) : undefined
        }
      />
      <TextField
        label="Timezone"
        value={draft.timezone}
        onChangeText={(timezone) => onDraftChange({ ...draft, timezone })}
        error={
          saveField === "timezone" ? (saveFailure ?? undefined) : undefined
        }
      />
    </View>
  );
}

function AdminUserActions({
  user,
  viewerId,
  confirm,
  onConfirmChange,
}: {
  user: AdminUserDetailRow;
  viewerId: string | undefined;
  confirm: AdminAction | null;
  onConfirmChange: (confirm: AdminAction | null) => void;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<AdminAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Your own record offers no action group at all, and says so.
  if (viewerId !== undefined && user.id === viewerId) {
    return (
      <View className="border-t border-ink pt-6">
        <Text className="font-body text-base text-ink">
          You can&apos;t ban, demote or impersonate your own account.
        </Text>
      </View>
    );
  }
  if (viewerId === undefined) return null;
  const actions = adminActionsFor(user, viewerId);

  async function runAction(action: AdminUserAction) {
    setPending(action);
    setFailure(null);
    try {
      await userAction(user.id, action);
      // On success the badge and the offered actions invert — that is
      // the feedback, not a message.
      onConfirmChange(null);
      await queryClient.invalidateQueries({
        queryKey: adminKeys.user(user.id),
      });
      await queryClient.invalidateQueries({ queryKey: adminKeys.all });
    } catch (caught) {
      const copy = toErrorCopy(caught);
      setFailure(copy.message ?? "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  return (
    <View className="gap-4 border-t border-ink pt-6">
      {failure ? <InlineError message={failure} /> : null}
      {actions.map((action) =>
        action === "impersonate" ? (
          <AdminImpersonateAction
            key={action}
            userId={user.id}
            confirming={confirm === action}
            pending={pending === action}
            actionPendingLabel={pending ? pendingLabel(pending) : null}
            onReveal={() => {
              setFailure(null);
              onConfirmChange(action);
            }}
            onCancel={() => onConfirmChange(null)}
          />
        ) : confirm === action ? (
          <AdminActionConfirm
            key={action}
            action={action}
            pending={pending === action}
            onCancel={() => onConfirmChange(null)}
            onConfirm={() => void runAction(action)}
          />
        ) : (
          <Button
            key={action}
            title={actionTitle(action)}
            variant={action === "ban" ? "danger" : "secondary"}
            disabled={pending !== null}
            onPress={() => {
              setFailure(null);
              onConfirmChange(action);
            }}
          />
        ),
      )}
    </View>
  );
}

function actionTitle(action: AdminAction): string {
  switch (action) {
    case "ban":
      return "Ban user";
    case "unban":
      return "Unban user";
    case "promote":
      return "Promote to admin";
    case "demote":
      return "Demote from admin";
    case "impersonate":
      return "Impersonate";
  }
}

/**
 * One action's in-place confirm: the mockup's exact sentence, then the
 * same two buttons — a second press of the second one is the write.
 * While pending both buttons are disabled and the sending one wears
 * the pending label.
 */
function AdminActionConfirm({
  action,
  pending,
  onCancel,
  onConfirm,
}: {
  action: AdminUserAction;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View className="gap-3">
      <Text className="font-body text-base text-ink">
        {confirmCopy(action)}
      </Text>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            title="Cancel"
            variant="secondary"
            disabled={pending}
            onPress={onCancel}
          />
        </View>
        <View className="flex-1">
          <Button
            title={pending ? pendingLabel(action) : actionTitle(action)}
            variant={action === "ban" ? "danger" : "secondary"}
            disabled={pending}
            onPress={onConfirm}
          />
        </View>
      </View>
    </View>
  );
}

function confirmCopy(action: AdminUserAction): string {
  switch (action) {
    case "ban":
      return "Banning stops this account from using the app. It can be undone.";
    case "unban":
      return "They will be able to use the app again.";
    case "promote":
      return "Admins can search accounts, impersonate people, and ban them.";
    case "demote":
      return "They lose access to the admin screens. Their account is otherwise unchanged.";
  }
}

type CodeSendState = "sending" | "sent" | "failed";

/**
 * Impersonation, the one place this port improves on web: revealing
 * the field SENDS the code to the admin's own number, which is what
 * makes `We text a code to your number.` true. Web asks for a code
 * nothing had issued.
 *
 * The button is offered for a banned row too: the API happily
 * impersonates a banned account (the only guard on that path is
 * `target.role === "admin"`, which `adminActionsFor` already
 * encodes). That is the API's answer, not this screen's.
 */
function AdminImpersonateAction({
  userId,
  confirming,
  pending,
  actionPendingLabel,
  onReveal,
  onCancel,
}: {
  userId: string;
  confirming: boolean;
  pending: boolean;
  actionPendingLabel: string | null;
  onReveal: () => void;
  onCancel: () => void;
}) {
  const { user: viewer } = useAuth();
  const { starting, start } = useStartImpersonation();
  const [code, setCode] = useState("");
  const [sendState, setSendState] = useState<CodeSendState | null>(null);
  const [codeError, setCodeError] = useState<{
    message: string;
    resend: boolean;
  } | null>(null);

  async function sendCode() {
    const phoneNumber = viewer?.phoneNumber;
    if (!phoneNumber) return;
    setSendState("sending");
    try {
      await requestCode({ phoneNumber, smsConsent: true });
      setSendState("sent");
    } catch {
      setSendState("failed");
    }
  }

  // The code is texted at the moment the field appears.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming && !wasConfirming.current) {
      wasConfirming.current = true;
      setCode("");
      setCodeError(null);
      setSendState(null);
      void sendCode();
    } else if (!confirming) {
      wasConfirming.current = false;
    }
    // `sendCode` reads the viewer's number, which cannot change while
    // this confirm is open; re-running on it would re-text the code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming]);

  async function submit() {
    setCodeError(null);
    try {
      await start({ userId, code });
    } catch (caught) {
      const copy = toErrorCopy(caught);
      const message =
        copy.message ??
        (caught instanceof Error
          ? caught.message
          : "That code is not right, or it has expired.");
      // A 403 (the session is no longer an admin's) offers no retry;
      // a rejected code offers another text.
      setCodeError({ message, resend: copy.retry });
    }
  }

  if (!confirming) {
    return (
      <Button
        title="Impersonate"
        variant="secondary"
        disabled={pending}
        onPress={onReveal}
      />
    );
  }

  const busy = starting || sendState === "sending";
  return (
    <View className="gap-3">
      <Text className="font-body text-base text-ink">
        We text a code to your number. That is the second factor for
        impersonation.
      </Text>
      <View
        pointerEvents={sendState === "sending" ? "none" : "auto"}
        className={sendState === "sending" ? "opacity-40" : ""}
      >
        <TextField
          label="Verification code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          error={codeError?.message}
        />
      </View>
      {sendState === "sending" ? (
        <Text className="font-body text-sm text-ink">Sending a code</Text>
      ) : null}
      {sendState === "failed" && !codeError ? (
        <View className="flex-row items-center gap-3">
          <Text className="font-body text-sm text-ink">
            Couldn&apos;t text you a code.
          </Text>
          <QuietAction label="Send another code" onPress={() => void sendCode()} />
        </View>
      ) : null}
      {codeError?.resend ? (
        <QuietAction label="Send another code" onPress={() => void sendCode()} />
      ) : null}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            title="Cancel"
            variant="secondary"
            disabled={busy}
            onPress={onCancel}
          />
        </View>
        <View className="flex-1">
          <Button
            title={
              starting
                ? "Starting…"
                : (actionPendingLabel ?? "Start impersonating")
            }
            variant="secondary"
            disabled={busy}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </View>
  );
}
