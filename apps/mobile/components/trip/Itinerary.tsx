import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EventCard } from "@/components/trip/EventCard";
import { EventRow } from "@/components/trip/EventRow";
import { StayCard } from "@/components/trip/StayCard";
import { StayRow } from "@/components/trip/StayRow";
import { Grid } from "@/components/ui/Grid";
import { QuietAction } from "@/components/ui/QuietAction";
import type { Trip } from "@/components/trip/TripCard";
import { dayLabel, daysFrom, groupEventsByDay } from "@/lib/itinerary";
import { currentStay, staySpan, type Stay } from "@/lib/stays";
import { useStays } from "@/lib/staysStore";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { useEvents } from "@/lib/eventsStore";
import { todayIn } from "@/lib/timezone";

/**
 * The base at the head of the run: a tile in the cards layout, a row in
 * the list — the base is not exempt from the setting that governs
 * everything under it.
 */
function Base({
  stay,
  cards,
  timeZone,
  onPress,
}: {
  stay: Stay;
  cards: boolean;
  timeZone: string | null;
  onPress: () => void;
}) {
  return cards ? (
    <StayCard stay={stay} timeZone={timeZone} onPress={onPress} />
  ) : (
    <StayRow stay={stay} timeZone={timeZone} onPress={onPress} />
  );
}

/**
 * One of the other roofs, as a line rather than a tile.
 *
 * The head can carry one roof whole and a second when there are exactly
 * two; past that it carries a line each, because five tiles above Today
 * is the itinerary before the itinerary starts. The line is the name and
 * the span it covers, which is the whole of what the other roof has to
 * say until you are in it.
 */
function StayIndexLine({
  stay,
  span,
  onPress,
}: {
  stay: Stay;
  span: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      aria-label={stay.name}
      className="cursor-pointer flex-row items-center gap-3 py-1"
    >
      <Text className="flex-1 font-body-bold text-base text-ink underline">
        {stay.name}
      </Text>
      {span ? (
        <Text className="font-body text-sm text-ink opacity-60">{span}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A trip's days, each one a section holding that day's events.
 *
 * Today first, then the days ahead soonest first, then the days behind
 * most recent first — the trips screen's upcoming/past rule, applied to
 * days. So the top of an itinerary is always the day you are on, and
 * what has already happened piles up at the bottom when you ask for it.
 *
 * Before the first day sits the roof you are under. Not a day and not a
 * row in the table: it is the base every day below departs from, and it
 * wears whatever the layout says a thing wears — the run's own tile, or
 * the run's own row.
 *
 * One roof is the ordinary case; two fit at the head, because a trip in
 * two towns has two answers and neither is second-class. Past that the
 * head carries the live roof and a line for each of the others, in the
 * order you will sleep in them: nothing is dropped, and nothing is
 * repeated later in the run, where a base change would read as a day.
 *
 * The run also owns the way to add to it. Add event and Add stay are
 * quiet words in the section head rather than buttons in the stack at
 * the top of the screen — the same rule the travel board follows with
 * its own Add travel: the surface that holds a list holds the way onto
 * it. Words rather than boxes because they are the run's, not the
 * screen's: the trip page spends its loud button on Invite people, and a
 * pair of outlined boxes at the top of a section reads as a toolbar
 * sitting on the content.
 *
 * No other controls in view: how much of it you read, whose clock you
 * read it on, and whether it is cards or a table are Trip settings,
 * which live in the header's action group with the trip's other buttons.
 * What is left here is content.
 *
 * Every card and row opens the same detail. Who is looking is carried
 * down from the screen above rather than asked again, so the dialog
 * cannot disagree with the trip it hangs over.
 */
export function Itinerary({
  trip,
  as = "traveler",
  now = new Date(),
}: {
  trip: Trip;
  /** Passed straight through to each detail dialog. */
  as?: "organizer" | "traveler";
  /** Injected so the grouping and the labels agree on the moment. */
  now?: Date;
}) {
  const router = useRouter();
  const { for: settingsFor, update } = useTripSettings();
  const { eventsForTrip } = useEvents();
  const { staysForTrip } = useStays();
  const { showPast, clock, layout } = settingsFor(trip, now);

  const organizer = as === "organizer";
  const cards = layout === "cards";
  const openEvent = (eventId: string) =>
    router.push(
      `/design/trips/events/detail?id=${trip.id}&event=${eventId}&as=${as}`,
    );
  const openStay = (stayId: string) =>
    router.push(
      `/design/trips/stay/detail?id=${trip.id}&stay=${stayId}&as=${as}`,
    );
  const addEvent = () => router.push(`/design/trips/events/new?id=${trip.id}`);
  const addStay = () => router.push(`/design/trips/stay/new?id=${trip.id}`);

  // The zone drives the grouping as well as the clock: an evening in
  // Mallorca belongs to the day it is in Mallorca.
  const timeZone = clock === "trip" ? trip.preferredTimezone : null;
  // And it is the one place a time's zone is stated: the chrome above
  // these rows names it for all of them.
  useDisplayZone(zoneFor(trip, clock, update));
  const today = todayIn(timeZone, now);

  const days = groupEventsByDay(eventsForTrip(trip), timeZone);
  // With the past on, the trip reads as one run from its first day to
  // its last; with it off, it starts at today.
  const shown = showPast ? days : daysFrom(days, today);

  const stays = staysForTrip(trip);
  const head = currentStay(stays, today, timeZone);
  // One roof is the ordinary case and two fit whole. Past that, the live
  // one, in the order you will sleep in them: this one first, because it
  // is the one whose address you need tonight.
  const listed = stays.length <= 2 ? stays : head ? [head] : [];
  const rest =
    stays.length <= 2 ? [] : stays.filter((stay) => !listed.includes(stay));

  // The other roofs, as lines rather than tiles.
  const restLines =
    rest.length > 0 ? (
      <View>
        {rest.map((stay) => (
          <StayIndexLine
            key={stay.id}
            stay={stay}
            span={staySpan(stay, timeZone)}
            onPress={() => openStay(stay.id)}
          />
        ))}
      </View>
    ) : null;

  return (
    <View className="gap-6">
      {/* The run's head. The label names the one block on this screen
          that is a list of many things rather than a fact about the
          trip, and it is what keeps the organizer's two words from
          floating: a pair of actions on their own line reads as chrome
          that fell off something else. */}
      <View className="gap-3">
        <Text className="font-body-bold text-sm uppercase tracking-widest text-ink">
          Itinerary
        </Text>
        {organizer ? (
          <View className="flex-row flex-wrap items-center gap-4">
            <QuietAction label="Add event" onPress={addEvent} />
            <QuietAction label="Add stay" onPress={addStay} />
          </View>
        ) : null}
      </View>

      {cards ? (
        <>
          {listed.length > 0 || rest.length > 0 ? (
            <View className="gap-4">
              <Grid>
                {listed.map((stay) => (
                  <Base
                    key={stay.id}
                    stay={stay}
                    cards
                    timeZone={timeZone}
                    onPress={() => openStay(stay.id)}
                  />
                ))}
              </Grid>
              {restLines}
            </View>
          ) : null}
          <View className="gap-8">
            {shown.map((day) => (
              <View key={day.date} className="gap-6 border-t border-ink pt-6">
                <Text className="font-display text-xl uppercase leading-none text-ink">
                  {dayLabel(day.date, today)}
                </Text>
                <Grid>
                  {day.events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      timeZone={timeZone}
                      onPress={() => openEvent(event.id)}
                    />
                  ))}
                </Grid>
              </View>
            ))}
          </View>
        </>
      ) : (
        // One table for the whole itinerary, with the days inside it:
        // a table per day would put two rules 24px apart at every day
        // boundary. The heading lumps a day together and the gap above
        // it separates it from the day before.
        <View className="border-t border-ink">
          {listed.map((stay) => (
            <Base
              key={stay.id}
              stay={stay}
              cards={false}
              timeZone={timeZone}
              onPress={() => openStay(stay.id)}
            />
          ))}
          {restLines}
          {shown.map((day, index) => (
            <View
              key={day.date}
              // The heading needs air under the rule; a day break then
              // has to be roomier than a row break, or the two read the
              // same.
              className={index === 0 ? "pt-6" : "pt-10"}
            >
              <Text className="pb-3 font-display text-xl uppercase leading-none text-ink">
                {dayLabel(day.date, today)}
              </Text>
              {day.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  timeZone={timeZone}
                  onPress={() => openEvent(event.id)}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Empty is two different states, and they used to share one line
          of copy: a trip with nothing on it yet, and a trip whose days
          have all been and gone. The first is an invitation, the second
          is a hint about a setting. The ways in are in the head, so
          neither block repeats them. */}
      {days.length === 0 ? (
        <View className="gap-1 border-t border-ink pt-6">
          <Text className="font-display text-xl uppercase leading-none text-ink">
            Nothing planned yet
          </Text>
          <Text className="font-body text-base text-ink">
            {organizer
              ? "Start with the first event, or add where you're sleeping."
              : "Nothing has been added to this trip yet."}
          </Text>
        </View>
      ) : shown.length === 0 ? (
        <View className="gap-1 border-t border-ink pt-6">
          <Text className="font-display text-xl uppercase leading-none text-ink">
            Nothing ahead
          </Text>
          <Text className="font-body text-base text-ink">
            This trip is behind you. Turn on Past events to read it.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
