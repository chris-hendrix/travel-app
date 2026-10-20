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
import { RuledBlock } from "@/components/ui/RuledBlock";
import { ReportOrBlock } from "@/components/trip/ReportOrBlock";
import { TextField } from "@/components/ui/TextField";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useDismiss } from "@/hooks/useDismiss";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { viewerOf, visiblePhone, type Member } from "@/lib/members";
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

  /**
   * The row this screen's own card is taking off the roster.
   *
   * A removal is painted out of the roster before the server answers
   * (`lib/queries/members.ts`), so on the next render the cache no longer
   * holds the row this screen is showing. Rendered straight from the cache,
   * that is this screen losing its subject — and with the subject goes the
   * card, the landing its write was about to take, and the refusal it was
   * about to read, because `onSuccess` and `onError` ride the observer and
   * the observer dies with the component.
   *
   * Held here for the length of the write instead. The card stays up with
   * its buttons disabled on `pending`, pops to the roll call when the DELETE
   * lands, and reads "This member paid for an expense — edit or delete it
   * first." when the server refuses — which is the rule every other delete
   * in the app already follows ("A failed delete stays on the form with the
   * failure instead of leaving", `app/trips/events/edit.tsx`).
   *
   * The cache stays the authority: a live row always beats the held one, so
   * a rollback is what the card shows. `onRemoveSettled` releases the hold,
   * which is what keeps this a window around one write rather than a second
   * copy of the roster.
   */
  const [heldMember, setHeldMember] = useState<Member | null>(null);
  const [heldInvitation, setHeldInvitation] =
    useState<TripInvitationRow | null>(null);

  if (!trip) {
    return <NotFound />;
  }

  // The roll call gives every person's card a press, because that card is
  // where reporting and blocking live (`components/trip/ReportOrBlock.tsx`)
  // and those are anybody's. The *other* two cards are the organizer's: a
  // guest's and an invitation's are a set of controls over somebody with no
  // account — saving their details, sending their invite, taking them off
  // the trip — and the API refuses every one of them to anyone else. Saying
  // so is better than a row of 403s, and it is why this is a gate and not
  // only a missing press on the roll call: a URL is not a door that closes.
  const memberId = typeof member === "string" ? member : undefined;
  const inviteId = typeof invite === "string" ? invite : undefined;
  const liveMember = memberId
    ? members.find((candidate) => candidate.id === memberId)
    : undefined;
  // The hold answers for the row this screen pressed about, and only while
  // no live row is there to answer for it.
  const found =
    liveMember ?? (heldMember?.id === memberId ? heldMember : undefined);
  // Where the roll call is: every card this screen renders leaves to it.
  const rosterHref = `/trips/members?id=${trip.id}`;

  if (found) {
    if (found.userId === null) {
      if (!organizer) return <OrganizersOnly trip={trip} />;
      return (
        <GuestDialog
          trip={trip}
          member={found}
          invitations={invitations}
          dismissHref={rosterHref}
          onRemovePressed={() => setHeldMember(found)}
          onRemoveSettled={() => setHeldMember(null)}
        />
      );
    }
    return (
      <MemberDialog
        trip={trip}
        member={found}
        organizer={organizer}
        dismissHref={rosterHref}
        onRemovePressed={() => setHeldMember(found)}
        onRemoveSettled={() => setHeldMember(null)}
      />
    );
  }

  if (inviteId) {
    if (!organizer) return <OrganizersOnly trip={trip} />;
    const liveInvitation = invitations.find(
      (candidate) => candidate.id === inviteId,
    );
    const invitation =
      liveInvitation ??
      (heldInvitation?.id === inviteId ? heldInvitation : undefined);
    // A guest who has been invited is never this branch: their
    // invitation is the guest dialog's `Invite sent` state, so this
    // branch only ever shows an invitation with no member row behind
    // it — anything else reads as gone.
    if (invitation) {
      return (
        <InvitedDialog
          trip={trip}
          invitation={invitation}
          dismissHref={rosterHref}
          onRemovePressed={() => setHeldInvitation(invitation)}
          onRemoveSettled={() => setHeldInvitation(null)}
        />
      );
    }
  }

  return (
    <FullscreenDialog title="Person" dismissHref={rosterHref}>
      <Text className="font-body text-base text-ink">
        That person is not on this trip any more.
      </Text>
    </FullscreenDialog>
  );
}

/**
 * The refusal a guest's card and an invitation's show a traveler.
 *
 * Both cards are their own subject's management — a guest's details and
 * their invite, an invitation's cancellation — and every control on them
 * is organizer-only server-side. One sentence for both, because the two
 * cards are one situation: there is nothing here for you, and it is not a
 * permission this screen invented.
 */
function OrganizersOnly({ trip }: { trip: Trip }) {
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

/**
 * What a card asks of the screen around a removal.
 *
 * The roster paints the removed row out of the cache before the server
 * answers, so the card's subject leaves the data while the write is still in
 * flight. The screen holds that row for exactly that window, which is what
 * keeps the card — and the outcome it is going to run — mounted.
 */
type RemovalHold = {
  /** The press, before the write goes: hold this card's row. */
  onRemovePressed: () => void;
  /** The write settled, either way: release it. */
  onRemoveSettled: () => void;
};

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
  onRemovePressed,
  onRemoveSettled,
}: {
  trip: Trip;
  member: Member;
  invitations: TripInvitationRow[];
  dismissHref: string;
} & RemovalHold) {
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
    onRemovePressed();
    removeMember.mutate(
      { memberId: member.id },
      {
        // The outcome is the write's to decide and this card's to take:
        // success pops to the roll call the row left — the screen directly
        // behind this card, which is the only place it is ever opened from —
        // and a refusal reads below. Both are reachable only because the
        // screen holds the row through the write.
        onSuccess: () => dismiss(),
        onSettled: () => onRemoveSettled(),
        onError: (error: unknown) => {
          if (
            error instanceof ApiError &&
            error.status === 409 &&
            error.code === "MEMBER_HAS_PAYMENTS"
          ) {
            setRemoveError(
              "This member paid for an expense — edit or delete it first.",
            );
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
          // No `label`: the row's own label is drawn above it (the paragraph
          // above says why a label inside the row would stretch the button to
          // the label's height). Passing one as well drew "Phone" twice —
          // `InviteDialog`'s row is the same shape and omits it for this
          // reason.
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
 * role row and the remove, then report or block at the foot.
 *
 * **Two audiences, one card.** An organizer gets the management half; a
 * traveler gets the facts and `ReportOrBlock`, which is the whole reason
 * the roll call hands them a press at all — reporting somebody and
 * blocking them are anybody's, and a person's own card is where a reader
 * looks for them. `organizer` is what tells the two halves apart, and the
 * facts obey it too: the number is `visiblePhone`'s, which is the API's
 * own rule and the one the roster row already reads.
 *
 * No bar primary: nothing here is a form. Your own row, and the creator's
 * row, replace the whole `Manage` section with the one line saying why
 * there is nothing to do.
 */
function MemberDialog({
  trip,
  member,
  organizer,
  dismissHref,
  onRemovePressed,
  onRemoveSettled,
}: {
  trip: Trip;
  member: Member;
  /** Whether the viewer runs the trip: the management half's gate. */
  organizer: boolean;
  dismissHref: string;
} & RemovalHold) {
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
    onRemovePressed();
    removeMember.mutate(
      { memberId: member.id },
      {
        // The outcome is the write's to decide and this card's to take:
        // success pops to the roll call the row left — the screen directly
        // behind this card, which is the only place it is ever opened from —
        // and a refusal reads below. Both are reachable only because the
        // screen holds the row through the write.
        onSuccess: () => dismiss(),
        onSettled: () => onRemoveSettled(),
        onError: (error: unknown) => {
          if (
            error instanceof ApiError &&
            error.status === 409 &&
            error.code === "MEMBER_HAS_PAYMENTS"
          ) {
            setRemoveError(
              "This member paid for an expense — edit or delete it first.",
            );
            return;
          }
          setRemoveError("Couldn't remove them.");
        },
      },
    );
  }

  // Which numbers a viewer is handed is the API's rule and not this
  // card's: an organizer sees every number, because somebody has to be able
  // to reach the group, and everybody else sees the numbers of the members
  // who chose to share theirs. The roster row reads the same function, so
  // the card cannot show a number the row behind it withheld.
  const phone = visiblePhone(member, organizer);

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
        {phone ? (
          <Fact label="Phone">
            <Text className="font-body text-base text-ink">
              {formatPhoneForDisplay(phone)}
            </Text>
          </Fact>
        ) : null}
      </View>

      {organizer ? (
        isSelf ? (
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

          {/* A block boundary, in the block's own ink: it was drawn in
              gravel, which is the colour for ground and not for marks,
              so the strongest seam on this screen was the faintest one. */}
          <RuledBlock>
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
          </RuledBlock>
        </Section>
        )
      ) : null}

      {/* The card's last word, and the reason a traveler has this card at
          all. It draws nothing on your own — you cannot report or block
          yourself — and nothing in the demo, which serves neither write. */}
      <ReportOrBlock
        member={member}
        tripId={trip.id}
        onBlocked={dismiss}
      />
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
  onRemovePressed,
  onRemoveSettled,
}: {
  trip: Trip;
  invitation: TripInvitationRow;
  dismissHref: string;
} & RemovalHold) {
  const [removeError, setRemoveError] = useState<string | null>(null);
  const dismiss = useDismiss(dismissHref);

  const removeInvitation = useRemoveInvitation(trip.id);

  function remove() {
    setRemoveError(null);
    onRemovePressed();
    removeInvitation.mutate(
      { id: invitation.id },
      {
        // The outcome is the write's and this card takes it: success pops to
        // the roll call, a refusal reads below. Reachable because the screen
        // holds the invitation through the write.
        onSuccess: () => dismiss(),
        onSettled: () => onRemoveSettled(),
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
