import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Column } from "@/components/ui/Column";
import { Section } from "@/components/ui/Section";
import { EventRow } from "@/components/trip/EventRow";
import { StayRow } from "@/components/trip/StayRow";
import { ArrivalBoard } from "@/components/trip/ArrivalBoard";
import { RosterList } from "@/components/trip/RosterList";
import { RsvpControl } from "@/components/trip/RsvpControl";
import { getDemoTrip } from "@/lib/demo";
import { travelBoard } from "@/lib/travelBoard";
import { rosterRows } from "@/lib/roster";
import { dayLabel, groupEventsByDay } from "@/lib/itinerary";
import { formatDateRange } from "@/lib/dateRange";
import { todayIn } from "@/lib/timezone";
import type { RsvpStatus } from "@/lib/rsvp";

/**
 * The demo: a fixed trip through the real presentational components,
 * read-only except the RSVP — the product's core gesture on local
 * state only, with the viewer's own roster row reading the same state
 * so the tap visibly moves it.
 *
 * The viewer is a traveler, not the organizer: the landing's baltic
 * band promises "what your friends see". No auth gate, no redirect —
 * a signed-in visitor sees the demo as-is.
 *
 * Every block renders with `rule={false}` so the design-lint rule
 * census stays 42: the demo adds blocks without adding rules.
 */
export default function Demo() {
  const router = useRouter();
  const trip = useMemo(getDemoTrip, []);
  // The one live control: the viewer's answer, held in state. Nothing
  // is sent anywhere — the roster row below reads this same value.
  const [answer, setAnswer] = useState<RsvpStatus>("going");

  const board = useMemo(
    () =>
      travelBoard(
        trip.travel,
        null,
        trip.members.map((member) => ({ id: member.id, name: member.name })),
      ),
    [trip],
  );
  const rows = useMemo(() => rosterRows(trip.members, []), [trip]);
  const days = useMemo(() => groupEventsByDay(trip.events, null), [trip]);
  const today = todayIn(null);

  return (
    <Screen>
      <Column>
        {/* The column owns the vertical padding (py-6 md:py-10); a
            child that restates it doubles the air above the title. */}
        <View className="gap-6">
          <View className="gap-2">
            <Text className="font-body-bold text-lg text-ink">
              {formatDateRange(trip.startDate, trip.endDate)}
            </Text>
            <Text className="font-display-extrabold text-display-md-wide uppercase text-ink md:text-display-lg">
              {trip.title}
            </Text>
            <Text className="font-body text-base text-ink">
              {trip.location}
            </Text>
          </View>

          {/* The run renders unconditionally. The product gates it on
              `canReadRun` (organizer or a viewer who answered going —
              app/trips/detail.tsx:180), withholding it from the
              unanswered and the maybe; a demo that hid its own run
              behind the very tap it exists to show would demonstrate
              nothing, so the demo does not gate on it. */}
          <Section title="The run" rule={false}>
            <View className="gap-2">
              <StayRow stay={trip.stay} timeZone={null} />
              {days.map((day) => (
                <View key={day.date} className="gap-2">
                  <Text className="font-body-bold text-base text-ink">
                    {dayLabel(day.date, today)}
                  </Text>
                  {day.events.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      timeZone={null}
                    />
                  ))}
                </View>
              ))}
            </View>
          </Section>

          <Section title="Who lands when" rule={false}>
            <ArrivalBoard
              heading="Arriving"
              rows={board.arrivals}
              timeZone={null}
            />
          </Section>

          <Section title="Your answer" rule={false}>
            <RsvpControl value={answer} onChange={setAnswer} />
          </Section>

          <Section title="Who's coming" rule={false}>
            <RosterList
              rows={rows}
              viewerIsOrganizer={false}
              viewerMemberId={trip.viewerMemberId}
              viewerAnswer={answer}
            />
          </Section>

          {/* The way in: a button, not a navigation word, so the
              underline ratchet (scripts/design-lint.mjs) stays 16. */}
          <Button
            title="Make your own trip"
            onPress={() => router.push("/login")}
          />
        </View>
      </Column>
    </Screen>
  );
}
