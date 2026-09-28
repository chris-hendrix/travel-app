import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { AdminGate } from "@/components/admin/AdminGate";
import { Section } from "@/components/ui/Section";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { Badge } from "@/components/ui/Badge";
import { Fact } from "@/components/ui/Fact";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { Segmented } from "@/components/ui/Segmented";
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
import { UNITS, type TemperatureUnit } from "@/lib/profile";
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
  const [draft, setDraft] = useState<{
    displayName: string;
    temperatureUnit: TemperatureUnit;
  }>({ displayName: "", temperatureUnit: "fahrenheit" });
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
    const patch: {
      displayName?: string;
      temperatureUnit?: TemperatureUnit;
    } = {};
    if (trimmedName !== user.displayName) patch.displayName = trimmedName;
    if (draft.temperatureUnit !== (user.temperatureUnit ?? "fahrenheit")) {
      patch.temperatureUnit = draft.temperatureUnit;
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
    // The profile screen's shape: name plus the temperature unit
    // picker. Timezone stays a read-only fact — an admin does not set
    // free text into it.
    setDraft({
      displayName: user.displayName,
      temperatureUnit:
        user.temperatureUnit === "celsius" ? "celsius" : "fahrenheit",
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
        {/* The badges sit inline on the name's line and wrap under a
            long name rather than squashing it; only an exception wears
            one (banned or admin). */}
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-display text-2xl text-ink">
            {displayName}
          </Text>
          {user.status === "banned" ? (
            <Badge label="Banned" variant="live" size="md" />
          ) : null}
          {user.role === "admin" ? (
            <Badge label="Admin" variant="category" size="md" />
          ) : null}
        </View>
        <Text className="font-body text-base text-ink">
          {user.phoneNumber}
        </Text>
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
            <Fact label="Temperature">
              <Text className="font-body text-base text-ink">
                {user.temperatureUnit
                  ? user.temperatureUnit.charAt(0).toUpperCase() +
                    user.temperatureUnit.slice(1)
                  : "Not set"}
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
function fieldFor(message: string): "displayName" | "temperatureUnit" | null {
  if (/display name/i.test(message)) return "displayName";
  if (/temperature/i.test(message)) return "temperatureUnit";
  return null;
}

function AdminUserForm({
  draft,
  onDraftChange,
  saveFailure,
  saveField,
  onSave,
}: {
  draft: { displayName: string; temperatureUnit: TemperatureUnit };
  onDraftChange: (draft: {
    displayName: string;
    temperatureUnit: TemperatureUnit;
  }) => void;
  saveFailure: string | null;
  saveField: "displayName" | "temperatureUnit" | null;
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
      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Temperature</Text>
        <Segmented
          options={UNITS}
          value={draft.temperatureUnit}
          onChange={(temperatureUnit) =>
            onDraftChange({ ...draft, temperatureUnit })
          }
        />
        {saveField === "temperatureUnit" && saveFailure ? (
          <Text className="font-body text-sm text-ink">{saveFailure}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The record's action set: a titled `Manage` section, one row per
 * available action. Each row explains itself in text above its button,
 * and no two buttons ever sit side by side.
 */
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
  const [failedAction, setFailedAction] = useState<AdminAction | null>(null);

  // Your own record offers no action group at all, and says so.
  if (viewerId !== undefined && user.id === viewerId) {
    return (
      <View className="border-t border-ink pt-6">
        <Text className="font-body text-base text-ink">
          You can&apos;t ban, demote or impersonate yourself.
        </Text>
      </View>
    );
  }
  if (viewerId === undefined) return null;
  const actions = adminActionsFor(user, viewerId);

  async function runAction(action: AdminUserAction) {
    setPending(action);
    setFailure(null);
    setFailedAction(null);
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
      setFailedAction(action);
    } finally {
      setPending(null);
    }
  }

  return (
    <Section title="Manage">
      {actions.map((action, index) =>
        action === "impersonate" ? (
          <AdminImpersonateAction
            key={action}
            userId={user.id}
            first={index === 0}
            confirming={confirm === action}
            pending={pending === action}
            actionPendingLabel={pending ? pendingLabel(pending) : null}
            onReveal={() => {
              setFailure(null);
              setFailedAction(null);
              onConfirmChange(action);
            }}
            onCancel={() => onConfirmChange(null)}
          />
        ) : action === "ban" ? (
          <View
            key={action}
            className={index === 0 ? "gap-2" : "gap-2 border-t border-gravel pt-6"}
          >
            <Text className="font-body-bold text-base text-ink">
              Ban this user
            </Text>
            <Text className="font-body text-sm text-ink opacity-60">
              Banning stops this user from using the app. It can be
              undone.
            </Text>
            <Button
              title={pending === action ? pendingLabel(action) : "Ban user"}
              variant={confirm === action ? "danger" : "secondary"}
              disabled={pending === action}
              onPress={() => {
                setFailure(null);
                setFailedAction(null);
                if (confirm === action) {
                  void runAction(action);
                } else {
                  onConfirmChange(action);
                }
              }}
            />
            {confirm === action && pending !== action ? (
              <QuietAction
                label="Cancel"
                onPress={() => onConfirmChange(null)}
              />
            ) : null}
            {failedAction === action && failure ? (
              <InlineError message={failure} />
            ) : null}
          </View>
        ) : (
          <View
            key={action}
            className={index === 0 ? "gap-2" : "gap-2 border-t border-gravel pt-6"}
          >
            <Text className="font-body-bold text-base text-ink">
              {rowTitle(action)}
            </Text>
            <Text className="font-body text-sm text-ink opacity-60">
              {rowCopy(action)}
            </Text>
            {/* One press sends it: each of these is one press away from
                being undone, so no arm step. */}
            <Button
              title={pending === action ? pendingLabel(action) : rowButton(action)}
              variant="secondary"
              disabled={pending === action}
              onPress={() => {
                setFailure(null);
                setFailedAction(null);
                void runAction(action);
              }}
            />
            {failedAction === action && failure ? (
              <InlineError message={failure} />
            ) : null}
          </View>
        ),
      )}
    </Section>
  );
}

function rowTitle(action: AdminUserAction): string {
  switch (action) {
    case "ban":
      return "Ban this user";
    case "unban":
      return "Unban this user";
    case "promote":
      return "Make an admin";
    case "demote":
      return "Remove admin";
  }
}

function rowCopy(action: AdminUserAction): string {
  switch (action) {
    case "ban":
      return "Banning stops this user from using the app. It can be undone.";
    case "unban":
      return "They will be able to use the app again.";
    case "promote":
      return "Admins can search users, impersonate people, and ban them.";
    case "demote":
      return "They lose access to the admin screens. Nothing else about them changes.";
  }
}

function rowButton(action: AdminUserAction): string {
  switch (action) {
    case "ban":
      return "Ban user";
    case "unban":
      return "Unban user";
    case "promote":
      return "Promote to admin";
    case "demote":
      return "Demote from admin";
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
  first,
  confirming,
  pending,
  actionPendingLabel,
  onReveal,
  onCancel,
}: {
  userId: string;
  first: boolean;
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
      <View className={first ? "gap-2" : "gap-2 border-t border-gravel pt-6"}>
        <Text className="font-body-bold text-base text-ink">
          Impersonate this user
        </Text>
        <Text className="font-body text-sm text-ink opacity-60">
          You use the app as this user until you stop.
        </Text>
        <Button
          title="Impersonate"
          variant="secondary"
          disabled={pending}
          onPress={onReveal}
        />
      </View>
    );
  }

  const busy = starting || sendState === "sending";
  return (
    <View className={first ? "gap-2" : "gap-2 border-t border-gravel pt-6"}>
      <Text className="font-body-bold text-base text-ink">
        Impersonate this user
      </Text>
      <Text className="font-body text-sm text-ink opacity-60">
        You use the app as this user until you stop.
      </Text>
      <Text className="font-body text-sm text-ink opacity-60">
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
      <Button
        title={
          starting ? "Starting…" : (actionPendingLabel ?? "Start impersonating")
        }
        variant="primary"
        disabled={busy}
        onPress={() => void submit()}
      />
      <QuietAction label="Cancel" onPress={onCancel} />
    </View>
  );
}
