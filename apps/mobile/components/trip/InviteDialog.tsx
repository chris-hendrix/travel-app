import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { PhoneField } from "@/components/ui/PhoneField";
import { SuggestionList } from "@/components/ui/SuggestionList";
import { TextField } from "@/components/ui/TextField";
import { useDismiss } from "@/hooks/useDismiss";
import {
  filterTripmates,
  phoneNumberError,
  sendInvitations,
  type InviteOutcome,
} from "@/lib/newInvite";
import { formatPhoneForDisplay, toE164 } from "@/lib/phone";
import { joinFacts } from "@/lib/wording";
import { membersFor } from "@/mocks/members";
import { tripmatesFor, type Tripmate } from "@/mocks/tripmates";
import type { Trip } from "@/components/trip/TripCard";
import { SAND } from "@/lib/theme";

/**
 * How many suggestions the field offers at once.
 *
 * Twenty, because an empty field is a question too: "who can I invite"
 * is answered by the list rather than by a letter typed to prove you
 * mean it. It is the same twenty the server pages by, and the same order
 * — most trips shared first — so the field opens on the people most
 * likely to be picked.
 */
const SUGGESTIONS = 20;

/**
/**
 * Invite people — the two ways onto a trip, and nothing else yet.
 *
 * The web's dialog has three: mutuals, numbers, and guests without an
 * account. This one has the first two, because a guest is a member the
 * organizer maintains rather than a person they ask, and that is a
 * different job for a different day.
 *
 * Two ways, one list. Picking a name and typing a number both end in the
 * same place: a chip at the top of the dialog, inked because ink is this
 * app's mark for chosen, in the order they were added. They used to be
 * kept in their own sections, one above its field and one below — so
 * "who am I about to invite" had two answers in two places, and the same
 * question looked like two different questions.
 *
 * By name picks from the trips you have already taken, through the same
 * suggestion list the Place field opens — one component, so the two
 * cannot drift into nearly the same list. It opens on the empty field,
 * because the list is also the answer to "who can I invite". By number
 * names somebody the app cannot look up, and the field arrives holding
 * the country code.
 *
 * What happens to a number is not explained here. That an existing
 * account joins straight away rather than being asked is the one thing
 * the web leaves you to discover, and it belongs where it is discovered:
 * the sentence after sending, about the person it happened to.
 *
 * Nothing here authors a trip's content, so the traveler has no business
 * in this dialog at all; it is reached from the two organizer doors and
 * nowhere else.
 */
export function InviteDialog({
  trip,
  dismissHref,
}: {
  trip: Trip;
  /** Where to land when there is no history to pop back to. */
  dismissHref: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState<InviteOutcome | null>(null);
  const dismiss = useDismiss(dismissHref);

  const tripmates = tripmatesFor(trip);
  const members = membersFor(trip);
  // The field offers who is left, so tapping a suggestion always adds.
  const remaining = tripmates.filter(
    (tripmate) => !picked.includes(tripmate.id),
  );
  const suggestions = filterTripmates(remaining, query).slice(0, SUGGESTIONS);
  const pickedTripmates = picked
    .map((id) => tripmates.find((tripmate) => tripmate.id === id))
    .filter((tripmate): tripmate is Tripmate => Boolean(tripmate));
  const chosen = picked.length + numbers.length;

  const remove = (id: string) =>
    setPicked((current) => current.filter((pickedId) => pickedId !== id));

  function addTripmate(tripmate: Tripmate) {
    setPicked((current) => [...current, tripmate.id]);
    // Cleared rather than kept: the name is a chip now, and leaving it in
    // the field would read as a filter over a list that has closed.
    setQuery("");
    setOpen(false);
  }

  function addNumber() {
    const problem = phoneNumberError(draft, numbers);
    setError(problem);
    if (problem) return;

    const phone = toE164(draft);
    if (!phone) return;

    setNumbers((current) => [...current, phone]);
    // Cleared rather than refilled with a country code: a bare ten-digit
    // number is read as home, so the prefill only ever got in the way of
    // the next person being abroad.
    setDraft("");
  }

  function send() {
    setSent(
      sendInvitations({
        input: { tripmateIds: picked, phoneNumbers: numbers },
        tripmates,
        members: members.map((member) => ({
          name: member.name,
          phone: member.phone,
        })),
      }),
    );
  }

  return (
    <FullscreenDialog
      title="Invite people"
      // Once it is sent there is one thing left to do with this dialog,
      // and it says so rather than offering to send it again.
      primaryTitle={
        sent
          ? "Done"
          : chosen === 1
            ? "Send 1 invitation"
            : chosen > 1
              ? `Send ${chosen} invitations`
              : "Send invitations"
      }
      onPrimary={sent ? dismiss : send}
      primaryDisabled={!sent && chosen === 0}
      dismissHref={dismissHref}
    >
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

      {sent ? (
        <Sent outcome={sent} />
      ) : (
        <>
          {/* The pool, before either way of filling it: names as they
              were picked, then numbers as they were typed. */}
          <Chips
            labels={[
              ...pickedTripmates.map((tripmate) => ({
                key: tripmate.id,
                label: tripmate.name,
                onRemove: () => remove(tripmate.id),
              })),
              ...numbers.map((phone) => ({
                key: phone,
                label: formatPhoneForDisplay(phone),
                onRemove: () =>
                  setNumbers((current) =>
                    current.filter((number) => number !== phone),
                  ),
              })),
            ]}
          />

          <View>
            <Section title="From your other trips">
              {tripmates.length === 0 ? (
                <Text className="font-body text-base text-ink">
                  Nobody from your other trips to suggest.
                </Text>
              ) : (
                <View>
                  <TextField
                    label="Name"
                    value={query}
                    placeholder="Start typing a name"
                    // Opens on the empty field as well as on typing: the
                    // list answers "who can I invite" too.
                    onFocus={() => setOpen(true)}
                    onChangeText={(value) => {
                      setQuery(value);
                      setOpen(true);
                    }}
                  />

                  {open ? (
                    <SuggestionList
                      suggestions={suggestions.map((tripmate) => ({
                        value: tripmate.id,
                        // Name and count on one line, joined the way this
                        // app joins two facts — the shape a place and its
                        // region have in the same list.
                        label: joinFacts(
                          tripmate.name,
                          sharedTrips(tripmate),
                        ),
                      }))}
                      empty="No one by that name."
                      onPick={(id) => {
                        const tripmate = tripmates.find(
                          (candidate) => candidate.id === id,
                        );
                        if (tripmate) addTripmate(tripmate);
                      }}
                    />
                  ) : null}

                  {remaining.length === 0 ? (
                    <Text className="font-body text-base text-ink">
                      That is everyone you have travelled with.
                    </Text>
                  ) : null}
                </View>
              )}
            </Section>
          </View>

          <View className="border-t border-ink pt-6">
            {/* The label above the row and the button inside it, so the
                box and the button are one height. The button is detached
                from the field rather than a word inside it: a word in the
                box is a word the eye reads as the value's last word, and
                it is the one coloured control here because it is the only
                thing in the dialog that does something on its own. */}
            <View className="gap-1">
              <Text className="font-body-bold text-sm text-ink">
                Phone number
              </Text>
              <View className="flex-row items-stretch gap-3">
                <View className="flex-1">
                  {/* The label is drawn above the row, so the field is
                      asked for its own name and nothing else. */}
                  <PhoneField
                    ariaLabel="Phone number"
                    value={draft}
                    onChangeText={(value) => {
                      setDraft(value);
                      setError(undefined);
                    }}
                    error={error}
                  />
                </View>
                <Button title="Add" variant="accent" onPress={addNumber} />
              </View>
            </View>
          </View>
        </>
      )}
    </FullscreenDialog>
  );
}

/** "4 shared trips", or the singular. */
function sharedTrips(tripmate: Tripmate): string {
  return tripmate.sharedTripCount === 1
    ? "1 shared trip"
    : `${tripmate.sharedTripCount} shared trips`;
}

/**
 * Who this send will carry, and the way to take any of them back.
 *
 * Inked, because ink is this app's word for chosen — the mark the
 * calendar's chosen day wears, and the one the bar's count stands for.
 */
function Chips({
  labels,
}: {
  labels: Array<{ key: string; label: string; onRemove: () => void }>;
}) {
  if (labels.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2">
      {labels.map(({ key, label, onRemove }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          className="cursor-pointer flex-row items-center gap-3 bg-ink px-3 py-2"
        >
          <Text className="font-body text-base text-sand">{label}</Text>
          <X color={SAND} size={14} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * What the send did, in the endpoint's own three outcomes.
 *
 * The invitation count is the line that matters and the other two are the
 * exceptions, which is why they are the ones that get names: "1 already
 * invited" is a number nobody can act on. This is also where a number
 * that turned out to be an account is explained — after the fact, about
 * the person it happened to, rather than as a rule up front.
 */
function Sent({ outcome }: { outcome: InviteOutcome }) {
  const count = outcome.invited.length;

  return (
    <Section title="Sent">
      <Text className="font-body text-base text-ink">
        {count === 1 ? "1 invitation sent." : `${count} invitations sent.`}
      </Text>
      {outcome.added.length > 0 ? (
        <Text className="font-body text-base text-ink">
          {list(outcome.added)} joined straight away — that number already
          had an account.
        </Text>
      ) : null}
      {outcome.skipped.length > 0 ? (
        <Text className="font-body text-base text-ink">
          {list(outcome.skipped)} is already on this trip.
        </Text>
      ) : null}
    </Section>
  );
}

/** Names as a sentence: "A", "A and B", "A, B and C". */
function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** A titled block of the dialog, ruled off from the one above it. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-5 border-t border-ink pt-6">
      <Text className="font-display text-xl uppercase leading-none text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}
