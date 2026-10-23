import { Text, View } from "react-native";
import { Image } from "@/components/ui/Image";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import { PlaceLink } from "@/components/ui/PlaceLink";
import { RuledBlock } from "@/components/ui/RuledBlock";
import { formatDateRange } from "@/lib/dateRange";

/**
 * The trip, as somebody who has not signed in reads it: what the API's
 * invitation preview returns, and nothing else.
 *
 * It is the same order the trip page's own column uses — the cover, the
 * dates, the name in the display face, the place as a link out — because
 * this is that page seen through a keyhole, and a reader who joins should
 * find the thing they were shown rather than a rearrangement of it.
 *
 * **This screen is the product's only growth surface**, and it used to be a
 * business card: four facts and a sign-in button, against a Partiful or Luma
 * invitee who sees the event itself before deciding. What it carries now is
 * the trip's own breadth — its cover, its organizer's prose, and two counts —
 * because a stranger needs a reason to tap through, and "Ana invited you to
 * Croatia" is not one.
 *
 * What it still does not carry is the trip's *contents*: no roster names, no
 * itinerary titles, no addresses, no spends. The route is public and
 * un-authenticated, so those are a stranger's reading of somebody else's
 * travel plans, and `showAllMembers` cannot gate them — nothing in the API
 * enforces that flag yet. The two counts are the boundary: they say how much
 * is behind the door without opening it. That line is drawn in the service
 * (`invitation.service.ts:getInvitationPreview`), and this card is only the
 * place it is read.
 */
export function InviteCard({
  inviterName,
  tripName,
  destination,
  startDate,
  endDate,
  description,
  coverImageUrl,
  eventCount,
  memberCount,
}: {
  /** The organizer, as the API's `inviterName`. */
  inviterName: string;
  tripName: string;
  destination: string;
  /** ISO yyyy-mm-dd, or null when nobody has set the dates yet. */
  startDate: string | null;
  endDate: string | null;
  /** The organizer's own words for the trip, null until somebody writes them. */
  description: string | null;
  /** The trip's uploaded cover; the stock trip photo stands in when absent. */
  coverImageUrl: string | null;
  /** Live events on the itinerary — a count, never titles. */
  eventCount: number;
  /** Everyone on the roster — a count, never names. */
  memberCount: number;
}) {
  // Pluralised in place rather than through a helper: there are two nouns
  // here and one of them ("activities") is irregular, so a shared pluraliser
  // would be three lines of exception handling to save one.
  const counts = [
    memberCount > 0
      ? `${memberCount} ${memberCount === 1 ? "person" : "people"}`
      : null,
    eventCount > 0
      ? `${eventCount} ${eventCount === 1 ? "activity" : "activities"} planned`
      : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <View className="gap-4">
      <Text className="font-body-bold text-sm uppercase tracking-widest text-ink">
        Invitation
      </Text>
      {/* The block's own boundary, in the block's own form: this drew an
          ink rule at `pt-4` and a `gap-2` inside, which is the same
          boundary every other block in the app draws at `pt-6` and
          `gap-5` — the form, not a variant of it. */}
      <RuledBlock>
        {/* The cover leads, as it does on the trip page itself. A frame with
            a definite aspect ratio, never an auto-height box: the fallback
            photo is absolutely filled (`PlaceholderImage`), so it needs
            edges to fill, and squares to nothing without them. No rounded
            corners — nothing in this system is rounded except the two
            circles, the unread dot and the badge. */}
        <View className="aspect-[2/1] w-full overflow-hidden bg-gravel">
          {coverImageUrl ? (
            <Image
              source={{ uri: coverImageUrl }}
              className="h-full w-full"
              contentFit="cover"
            />
          ) : (
            <PlaceholderImage kind="trip" />
          )}
        </View>
        {startDate ? (
          <Text className="font-body-bold text-lg text-ink">
            {formatDateRange(startDate, endDate ?? startDate)}
          </Text>
        ) : null}
        <Text className="font-display-extrabold text-display-md-wide uppercase text-ink">
          {tripName}
        </Text>
        <PlaceLink label={destination} query={`${destination} ${tripName}`} />
        {description ? (
          // Two lines, because the preview is appetising and not the page:
          // enough to set the scene, never enough to replace opening it.
          <Text className="font-body text-base leading-snug text-ink" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        {counts.length > 0 ? (
          <Text className="font-body-bold text-sm text-ink">
            {counts.join(" · ")}
          </Text>
        ) : null}
        <Text className="font-body text-base text-ink">
          {inviterName} invited you.
        </Text>
      </RuledBlock>
    </View>
  );
}
