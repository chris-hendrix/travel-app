import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Fact } from "@/components/ui/Fact";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { toE164 } from "@/components/ui/PhoneField";
import { PhoneFieldAction } from "@/components/ui/PhoneFieldAction";
import { QuietAction } from "@/components/ui/QuietAction";
import { Section } from "@/components/ui/Section";
import { TextField } from "@/components/ui/TextField";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useDismiss } from "@/hooks/useDismiss";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { viewerOf, type Member } from "@/lib/members";
import { formatPhoneForDisplay } from "@/lib/phone";
import { memberLabel } from "@/lib/rsvp";
import { useTrip } from "@/lib/tripsStore";
import {
  InviteGuestError,
  isGuestPhoneTaken,
  useInviteGuest,
  useMembers,
  useRemoveInvitation,
  useRemoveMember,
  useSetOrganizer,
  useUpdateGuest,
} from "@/lib/queries/members";
import {
  useTripInvitations,
  type TripInvitationRow,
} from "@/lib/queries/invitations";
import type { Trip } from "@/components/trip/TripCard";

/**
 * The person dialog: one route, two parameter keys. `?member=` names a
 * row that exists; `?invite=` names an invitation with no member row
 * behind it. A guest is told apart from a member by the row's own shape
 * (`userId === null`), never by a param.
 *
 * The phone row is `PhoneFieldAction`, which `InviteDialog` also draws.
 * It used to be this file and that one writing the same row by hand — a
 * label above, a `PhoneField` in a `flex-1` column, a `Button` beside it
 * in one `flex-row` so box and button share a height — which is the shape
 * that can drift, and the reason the row is a primitive.
 */
export default function PersonDetail() {
  return (
    <TripGate label="Loading person details">
      <PersonDetailDialog />
    </TripGate>
  );
}

function PersonDetailDialog() {
  const { id, member, invite } = useLocalSearchParams<{
    id?: string;
    member?: string;
    invite?: string;
  }>();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
  // The roster suspends under the same gate as the trip above, so the
  // dialog never renders without it.
  const { members } = useMembers(trip?.id);
  // Your role comes from the server: your own roster row, matched by
  // account — never a query param.
  const organizer = viewerOf(members, user?.id)?.isOrganizer ?? false;
  const { invitations } = useTripInvitations(trip?.id, organizer);

  if (!trip) {
    return <NotFound />;
  }

  // The roll call only offers the way in on its organizer variant, but a
  // URL is not a door that closes. Without this, a traveler who opens
  // `/trips/members/detail?id=…&member=…` gets the organizer's dialogs —
  // and the `invite` branch below would read "not on this trip any more",
  // because a traveler is handed no invitations to match against.
  if (!organizer) {
    return (
      <FullscreenDialog
        title="Person"
        dismissHref={`/trips/members?id=${trip.id}`}
      >
        <Text className="font-body text-base text-ink">
          Only an organizer can manage the people on this trip.
        </Text>
      </FullscreenDialog>
    );
  }

  const memberId = typeof member === "string" ? member : undefined;
  const inviteId = typeof invite === "string" ? invite : undefined;
  const found = memberId
    ? members.find((candidate) => candidate.id === memberId)
    : undefined;

  if (found) {
    if (found.userId === null) {
      return (
        <GuestDialog
          trip={trip}
          member={found}
          invitations={invitations}
          dismissHref={`/trips/members?id=${trip.id}`}
        />
      );
    }
    return (
      <MemberDialog
        trip={trip}
        member={found}
        dismissHref={`/trips/members?id=${trip.id}`}
      />
    );
  }

  if (inviteId) {
    const invitation = invitations.find(
      (candidate) => candidate.id === inviteId,
    );
    // A guest who has been invited is never this branch: their
    // invitation is the guest dialog's `Invite sent` state, so this
    // branch only ever shows an invitation with no member row behind
    // it — anything else reads as gone.
    if (invitation) {
      return (
        <InvitedDialog
          trip={trip}
          invitation={invitation}
          dismissHref={`/trips/members?id=${trip.id}`}
        />
      );
    }
  }

  return (
    <FullscreenDialog
      title="Person"
      dismissHref={`/trips/members?id=${trip.id}`}
    >
      <Text className="font-body text-base text-ink">
        That person is not on this trip any more.
      </Text>
    </FullscreenDialog>
  );
}

/**
 * The guest dialog (mockup 3): the name, the phone row with `Send
 * invite` beside it, `Save changes` on the bar, and `Manage` with the
 * two-press remove. A guest keeps the `Guest` mark on the roster; the
 * invite state lives here, read from the trip's invitations.
 */
function GuestDialog({
  trip,
  member,
  invitations,
  dismissHref,
}: {
  trip: Trip;
  member: Member;
  invitations: TripInvitationRow[];
  dismissHref: string;
}) {
  const storedName = member.name;
  const storedPhone = member.guestPhone ?? member.phone ?? "";
  const [draftName, setDraftName] = useState(storedName);
  const [draftPhone, setDraftPhone] = useState(storedPhone);
  // A field-level failure on the phone, set on send or on save.
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  // An invite that failed after the phone saved: the phone stays, and
  // the failure sits where the send was asked for, with a way back.
  const [inviteError, setInviteError] = useState<string | null>(null);
  // The number the last send went to, so a claimed row (an account
  // behind the number joins in place) still reads sent before the
  // roster comes back.
  const [sentPhone, setSentPhone] = useState<string | null>(null);
  // The remove's first press: the button inverts and a Cancel appears
  // under it. The bar's danger action is not used here.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const dismiss = useDismiss(dismissHref);

  const updateGuest = useUpdateGuest(trip.id);
  const inviteGuest = useInviteGuest(trip.id);
  const removeMember = useRemoveMember(trip.id);

  const parsed = toE164(draftPhone);
  const draftPhoneKey = parsed ?? "";
  // A pending invitation for the saved number, or for the number as
  // typed: either way there is nothing to send twice.
  const pendingInvite = invitations.some(
    (invitation) =>
      invitation.status === "pending" &&
      (invitation.phone === storedPhone ||
        (draftPhoneKey !== "" && invitation.phone === draftPhoneKey)),
  );
  const inviteSent =
    pendingInvite || (sentPhone !== null && sentPhone === draftPhoneKey);
  const dirty =
    draftName.trim() !== storedName || draftPhoneKey !== storedPhone;
  const pending =
    updateGuest.isPending || inviteGuest.isPending || removeMember.isPending;

  function save() {
    const patch: { displayName?: string; guestPhone?: string } = {};
    if (draftName.trim() !== storedName) patch.displayName = draftName.trim();
    if (draftPhoneKey !== storedPhone) patch.guestPhone = draftPhoneKey;
    if (Object.keys(patch).length === 0) return;
    setPhoneError(undefined);
    updateGuest.mutate(
      { memberId: member.id, patch },
      {
        onSuccess: () => dismiss(),
        onError: (error: unknown) => {
          if (isGuestPhoneTaken(error)) {
            setPhoneError("That number is already on this trip.");
          }
        },
      },
    );
  }

  function sendInvite() {
    if (!parsed) {
      setPhoneError("Enter a valid phone number");
      return;
    }
    setPhoneError(undefined);
    setInviteError(null);
    inviteGuest.mutate(
      { memberId: member.id, phone: parsed },
      {
        onSuccess: () => setSentPhone(parsed),
        onError: (error: unknown) => {
          const cause =
            error instanceof InviteGuestError ? error.cause : error;
          if (isGuestPhoneTaken(error) || isGuestPhoneTaken(cause)) {
            setPhoneError("That number is already on this trip.");
            return;
          }
          if (error instanceof InviteGuestError && error.stage === "phone") {
            setPhoneError("Enter a valid phone number");
            return;
          }
          setInviteError("Couldn't send that invite.");
        },
      },
    );
  }

  function remove() {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setRemoveError(null);
    removeMember.mutate(
      { memberId: member.id },
      {
        onSuccess: () => dismiss(),
        onError: (error: unknown) => {
          if (
            error instanceof ApiError &&
            error.status === 409 &&
            error.code === "MEMBER_HAS_PAYMENTS"
          ) {
            setRemoveError("This trip has fees recorded against them.");
            return;
          }
          setRemoveError("Couldn't remove them.");
        },
      },
    );
  }

  return (
    <FullscreenDialog
      title="Guest"
      primaryTitle="Save changes"
      onPrimary={save}
      // Disabled until the draft differs from the stored values: there
      // is nothing to save yet, not a write in flight.
      primaryDisabled={!dirty}
      pending={pending}
      dismissHref={dismissHref}
    >
      <Text className="font-display-extrabold text-display-md uppercase text-ink md:text-display-md-wide">
        {member.name}
      </Text>

      <TextField
        label="Name"
        value={draftName}
        onChangeText={setDraftName}
        placeholder="Their name"
      />

      <View className="gap-1">
        <Text className="font-body-bold text-sm text-ink">Phone</Text>
        <PhoneFieldAction
          label="Phone"
          ariaLabel="Phone"
          value={draftPhone}
          onChangeText={(value) => {
            setDraftPhone(value);
            setPhoneError(undefined);
          }}
          error={phoneError}
          submitTitle={inviteSent ? "Invite sent" : "Send invite"}
          onSubmit={sendInvite}
          // Enabled only once the field parses, and never twice for
          // the same number: a pending invitation disables it.
          submitDisabled={parsed === null || inviteSent || inviteGuest.isPending}
        />
      </View>

      {inviteError ? (
        <InlineError message={inviteError} onRetry={sendInvite} />
      ) : null}

      <Section title="Manage">
        <View className="gap-2">
          <Text className="font-body-bold text-base text-ink">
            Remove guest
          </Text>
          <Text className="font-body text-sm text-ink opacity-60">
            They come off the trip, and their travel goes with them.
          </Text>
          {/* The question appears only once the button is armed, and it
              is the loudest line here: the reason above is quiet ink,
              and this is the one asking for an answer. */}
          {confirmingRemove ? (
            <Text className="font-body text-sm text-ink">
              Are you sure?
            </Text>
          ) : null}
          <Button
            title="Remove guest"
            variant={confirmingRemove ? "danger" : "secondary"}
            onPress={remove}
            disabled={removeMember.isPending}
          />
          {confirmingRemove ? (
            <QuietAction
              label="Cancel"
              onPress={() => setConfirmingRemove(false)}
            />
          ) : null}
          {removeError ? <InlineError message={removeError} /> : null}
        </View>
      </Section>
    </FullscreenDialog>
  );
}

/**
 * The member dialog (mockup 4): facts, then `Manage` with the inverting
 * role row and the remove. No bar primary: nothing here is a form. Your
 * own row, and the creator's row, replace the whole `Manage` section
 * with the one line saying why there is nothing to do. A traveler never
 * reaches this dialog: the roll call gives them no pressable rows.
 */
function MemberDialog({
  trip,
  member,
  dismissHref,
}: {
  trip: Trip;
  member: Member;
  dismissHref: string;
}) {
  const { user } = useAuth();
  const [roleError, setRoleError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // The remove's first press: the button inverts and a Cancel appears
  // under it. The same shape the guest dialog takes, because taking
  // somebody off the trip asks the same question whoever they are.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const dismiss = useDismiss(dismissHref);

  const setOrganizer = useSetOrganizer(trip.id);
  const removeMember = useRemoveMember(trip.id);

  // The detail mapper carries the creator on the trip, so the dialog
  // reads it straight off `trip`. The API is the authority on who the
  // creator is; the app only words it.
  const creatorId = trip.createdBy;

  const isSelf = member.userId !== null && member.userId === user?.id;
  const isCreator = creatorId !== undefined && member.userId === creatorId;

  function toggleRole() {
    setRoleError(null);
    setOrganizer.mutate(
      { memberId: member.id, isOrganizer: !member.isOrganizer },
      {
        onError: () => setRoleError("Couldn't change their part."),
      },
    );
  }

  function remove() {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setRemoveError(null);
    removeMember.mutate(
      { memberId: member.id },
      {
        onSuccess: () => dismiss(),
        onError: (error: unknown) => {
          if (
            error instanceof ApiError &&
            error.status === 409 &&
            error.code === "MEMBER_HAS_PAYMENTS"
          ) {
            setRemoveError("This trip has fees recorded against them.");
            return;
          }
          setRemoveError("Couldn't remove them.");
        },
      },
    );
  }

  return (
    <FullscreenDialog title="Member" dismissHref={dismissHref}>
      <Text className="font-display-extrabold text-display-md uppercase text-ink md:text-display-md-wide">
        {member.name}
      </Text>

      <View className="gap-4">
        <Fact label="Part">
          <Text className="font-body text-base text-ink">
            {memberLabel(member)}
          </Text>
        </Fact>
        {member.phone ? (
          <Fact label="Phone">
            <Text className="font-body text-base text-ink">
              {formatPhoneForDisplay(member.phone)}
            </Text>
          </Fact>
        ) : null}
      </View>

      {isSelf ? (
        <Text className="font-body text-base text-ink">
          You can&apos;t remove yourself or change your own part.
        </Text>
      ) : isCreator ? (
        <Text className="font-body text-base text-ink">
          The creator stays on the trip.
        </Text>
      ) : (
        <Section title="Manage">
          <View className="gap-2">
            <Text className="font-body-bold text-base text-ink">
              {member.isOrganizer ? "Remove as organizer" : "Make organizer"}
            </Text>
            <Text className="font-body text-sm text-ink opacity-60">
              {member.isOrganizer
                ? "They keep their place on the trip and lose what only an organizer can do."
                : "An organizer can invite people and edit the trip."}
            </Text>
            <Button
              title={member.isOrganizer ? "Remove as organizer" : "Make organizer"}
              variant="secondary"
              onPress={toggleRole}
              disabled={setOrganizer.isPending}
            />
            {roleError ? (
              <InlineError message={roleError} onRetry={toggleRole} />
            ) : null}
          </View>

          <View className="gap-2 border-t border-gravel pt-6">
            <Text className="font-body-bold text-base text-ink">
              Remove from trip
            </Text>
            <Text className="font-body text-sm text-ink opacity-60">
              They lose access to this trip, and their travel goes with
              them.
            </Text>
            {/* The question appears only once the button is armed, and
                it is the loudest line here: the reason above is quiet
                ink, and this is the one asking for an answer. */}
            {confirmingRemove ? (
              <Text className="font-body text-sm text-ink">
                Are you sure?
              </Text>
            ) : null}
            <Button
              title="Remove"
              variant={confirmingRemove ? "danger" : "secondary"}
              onPress={remove}
              disabled={removeMember.isPending}
            />
            {confirmingRemove ? (
              <QuietAction
                label="Cancel"
                onPress={() => setConfirmingRemove(false)}
              />
            ) : null}
            {removeError ? <InlineError message={removeError} /> : null}
          </View>
        </Section>
      )}
    </FullscreenDialog>
  );
}

/**
 * The invited dialog (mockup 5): the number, `Not on the trip yet.`,
 * then `Manage` with the remove that cancels the invitation. No bar
 * primary: nothing here is a form.
 */
function InvitedDialog({
  trip,
  invitation,
  dismissHref,
}: {
  trip: Trip;
  invitation: TripInvitationRow;
  dismissHref: string;
}) {
  const [removeError, setRemoveError] = useState<string | null>(null);
  const dismiss = useDismiss(dismissHref);

  const removeInvitation = useRemoveInvitation(trip.id);

  function remove() {
    setRemoveError(null);
    removeInvitation.mutate(
      { id: invitation.id },
      {
        onSuccess: () => dismiss(),
        onError: () => setRemoveError("Couldn't remove them."),
      },
    );
  }

  return (
    <FullscreenDialog title="Invited" dismissHref={dismissHref}>
      <Text className="font-display-extrabold text-display-md uppercase text-ink md:text-display-md-wide">
        {formatPhoneForDisplay(invitation.phone)}
      </Text>
      <Text className="font-body text-base text-ink">
        Not on the trip yet.
      </Text>

      <Section title="Manage">
        <View className="gap-4">
          <View className="gap-1">
            <Text className="font-body-bold text-base text-ink">Remove</Text>
            <Text className="font-body text-base text-ink">
              They have not joined yet. Removing them cancels the
              invitation.
            </Text>
          </View>
          <Button
            title="Remove"
            variant="secondary"
            onPress={remove}
            disabled={removeInvitation.isPending}
          />
          {removeError ? (
            <InlineError message={removeError} onRetry={remove} />
          ) : null}
        </View>
      </Section>
    </FullscreenDialog>
  );
}
