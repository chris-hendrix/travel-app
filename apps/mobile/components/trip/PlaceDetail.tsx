import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "@/components/ui/Image";
import { Badge } from "@/components/ui/Badge";
import { LinkedText } from "@/components/ui/LinkedText";
import { PhotoCredit } from "@/components/ui/PhotoCredit";
import { PlaceActions } from "@/components/ui/PlaceActions";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { RuledBlock } from "@/components/ui/RuledBlock";
import { useMotion } from "@/hooks/useMotion";
import { EVENT_HUES } from "@/lib/eventColors";
import { EVENT_TYPE_LABEL } from "@/lib/itinerary";
import type { SavedPlace } from "@/lib/saved-places";

/**
 * One saved place, seen whole: the photo, the name, the address and its
 * two verbs, the saver's prose, and who saved it.
 *
 * The hero is the event sheet's exact fill — the type badge overlaid on
 * the photo, the `Pinned` badge beside it when the organizer pinned the
 * row — with the stay sheet's fallback beside it: a typed place has no
 * photo, so the type's stock photo draws instead of a blank box. The
 * title is the saver's own words, and the byline under it reads the
 * viewer off the session (`createdBy === viewerUserId`, the same bargain
 * `ExpenseDetail` makes for the payer): your own row says "You".
 *
 * The address block mirrors the event sheet's Where: the address as the
 * provider gave it, with `PlaceActions` under it — the Maps link pinned
 * to the place itself, the copy beside it. A typed place carries no
 * address, so the block hides the way `EventCard` skips a falsy footnote:
 * a line that holds nothing is not drawn at all. The note reads
 * through `LinkedText`, so an address somebody pasted presses where it
 * sits, and a block with no prose draws no title.
 *
 * The organizer's one extra verb sits at the foot as a `Button`
 * (`secondary`) — `Pin to top` / `Unpin` — the pin the plan keeps off
 * the cards, where a per-row glyph would be a 44pt target two-thirds
 * of the trip cannot use. The toggle is reversible, so it takes the
 * unfilled variant the one-way verbs skip. A failed pin reads as a
 * transient line right under it — the members sheet's role-error
 * bargain — while the optimistic flag is rolled back by the writer
 * itself.
 * Edit lives in the dialog's bar, never here: the travel sheet's own
 * rule is that there is no second Edit button at the foot. Delete lives
 * on the form, the way every sibling sheet files it (stay, event and
 * travel all own `onDelete` on their edit routes and none on their
 * detail), behind the two-press danger idiom.
 */
export function PlaceDetail({
  place,
  viewerUserId,
  isOrganizer,
  onTogglePin,
  pinPending = false,
  pinError,
}: {
  place: SavedPlace;
  /** The viewer's **user** id, for the "You" in the byline. */
  viewerUserId: string;
  /** The organizer's pin verb draws only for the organizer. */
  isOrganizer: boolean;
  /** Flips the pin; the list invalidates itself, so nothing follows. */
  onTogglePin: () => void;
  /** A pin write is in flight: the verb parks (Button's own disabled). */
  pinPending?: boolean;
  /** The last pin write's failure, owned by the caller that reads it. */
  pinError?: string | null;
}) {
  const motion = useMotion();

  return (
    <View className="gap-6">
      <View className="gap-y-6 md:flex-row md:gap-12">
        <View className="md:flex-1">
          <View className="relative overflow-hidden">
            {!place.image ? (
              <View className="w-full aspect-[2/1]">
                <PlaceholderImage kind={place.type} />
              </View>
            ) : place.photoSourceUri ? (
              <Pressable
                onPress={() => void Linking.openURL(place.photoSourceUri!)}
                aria-label="View photo source on Google Maps"
                className={motion.pressDim}
              >
                <Image
                  source={{ uri: place.image }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  className="w-full aspect-[2/1]"
                />
              </Pressable>
            ) : (
              <Image
                source={{ uri: place.image }}
                contentFit="cover"
                cachePolicy="memory-disk"
                className="w-full aspect-[2/1]"
              />
            )}
            <View className="absolute left-3 top-3">
              <View className="flex-row gap-2">
                <Badge
                  label={EVENT_TYPE_LABEL[place.type]}
                  variant="category"
                  hue={EVENT_HUES[place.type] ?? undefined}
                />
                {place.isPinned ? (
                  <Badge label="Pinned" variant="pinned" />
                ) : null}
              </View>
            </View>
          </View>
          <PhotoCredit
            credit={place.photoCredit ?? null}
            sourceUri={place.photoSourceUri ?? null}
          />
        </View>

        <View className="gap-2 md:flex-1">
          <Text className="font-display-extrabold text-display-md uppercase text-ink md:text-display-md-wide">
            {place.name}
          </Text>
          <Text className="font-body text-base text-ink opacity-60">
            Saved by{" "}
            {place.createdBy === viewerUserId ? "You" : place.creatorName}
          </Text>
        </View>
      </View>

      {/* The address, and the two verbs an address has: the Maps link
          pinned to the place itself, the copy beside it. Drawn only
          where there is one — a typed place files words, not an
          address, and a Where over nothing says something is here
          when nothing is. */}
      {place.address?.trim() ? (
        <RuledBlock title="Where">
          <Text selectable className="font-body text-base text-ink/70">
            {place.address}
          </Text>
          <PlaceActions
            name={place.name}
            address={place.address}
            placeId={place.placeId}
          />
        </RuledBlock>
      ) : null}

      {/* The saver's note, titled with the column's own word: the form
          labels this field `Notes`, so this screen does not invent
          a second name for one field. */}
      {place.notes ? (
        <RuledBlock title="Notes">
          <LinkedText text={place.notes} />
        </RuledBlock>
      ) : null}

      {/* The organizer curates without owning the words: a per-row glyph
          would be a target most of the trip cannot use, so the pin is
          one verb at the foot of the sheet, and only the organizer sees
          it. A `Button` because it is a control, not a word; `secondary`
          because the toggle is reversible, so it does not wear the one
          accent the one-way verbs take — the same layout the sibling
          detail sheets give their foot-row boxes (fills the column on a
          phone, hugs the start edge from md up). Disabled while the pin
          write is in flight: a press that landed before the first write
          settled would invert the row twice. The label stays
          self-sufficient — the sheet is one place, so "Pin to top"
          names its target. */}
      {isOrganizer ? (
        <View className="gap-2">
          <Button
            title={place.isPinned ? "Unpin" : "Pin to top"}
            variant="secondary"
            onPress={onTogglePin}
            disabled={pinPending}
          />
          {pinError ? <InlineError message={pinError} /> : null}
        </View>
      ) : null}
    </View>
  );
}
