import { reset, cities } from "drizzle-seed";
import { db, pool } from "@/config/database.js";
import * as schema from "@/db/schema/index.js";

// --- Helpers ---

function daysFromNow(days: number, hour = 12): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

// --- Data pools ---

const PHONE_NUMBERS = [
  "+15550000001",
  "+15550000002",
  "+15550000003",
  "+15550000004",
  "+15550000005",
] as const;

const EVENT_NAMES = {
  activity: [
    "Temple Visit",
    "Museum Tour",
    "Walking Tour",
    "Night Out",
    "Morning Hike",
    "Beach Day",
    "Cable Car Ride",
    "Stadium Tour",
    "Street Art Walk",
    "Boat Tour",
    "Sunset Viewpoint",
    "Neighborhood Walk",
    "Comedy Show",
    "Cooking Class",
    "Bike Ride",
    "Park Picnic",
    "Live Music",
    "Market Stroll",
  ],
  meal: [
    "Brunch",
    "Lunch Spot",
    "Dinner Reservation",
    "Street Food Tour",
    "Rooftop Drinks",
    "Tapas Night",
    "Pizza Night",
    "Cocktail Hour",
    "Market Breakfast",
    "Seafood Feast",
    "Wine Tasting",
    "Dessert Run",
  ],
  travel: [
    "Airport Transfer",
    "Train to City Center",
    "Ferry Crossing",
    "Bus to Hotel",
    "Shuttle to Airport",
    "Car Rental Pickup",
    "Taxi to Station",
    "Drive to Next City",
  ],
};

// --- Main ---

async function main() {
  console.log("Resetting database...");
  await reset(db, schema);

  // Users
  const userRows = await db
    .insert(schema.users)
    .values([
      { phoneNumber: PHONE_NUMBERS[0], displayName: "Alice Johnson", role: "admin" },
      { phoneNumber: PHONE_NUMBERS[1], displayName: "Bob Williams" },
      { phoneNumber: PHONE_NUMBERS[2], displayName: "Carol Martinez" },
      { phoneNumber: PHONE_NUMBERS[3], displayName: "David Kim", status: "banned" },
      { phoneNumber: PHONE_NUMBERS[4], displayName: "Eve Chen" },
    ])
    .returning();

  const [alice, bob, carol, david, eve] = userRows as [
    (typeof userRows)[0],
    (typeof userRows)[0],
    (typeof userRows)[0],
    (typeof userRows)[0],
    (typeof userRows)[0],
  ];

  // Trips — one in-progress (centered on today), one upcoming, one past
  const tripRows = await db
    .insert(schema.trips)
    .values([
      {
        name: "Tokyo Adventure",
        destination: "Tokyo, Japan",
        startDate: toDateStr(daysFromNow(-3)),
        endDate: toDateStr(daysFromNow(4)),
        preferredTimezone: "Asia/Tokyo",
        description:
          "A week exploring Tokyo — temples, food, and nightlife. Door code for Airbnb is 4821. Wifi: TokyoStay / password: sakura2026",
        createdBy: alice.id,
      },
      {
        name: "Barcelona Beach Week",
        destination: "Barcelona, Spain",
        startDate: toDateStr(daysFromNow(14)),
        endDate: toDateStr(daysFromNow(21)),
        preferredTimezone: "Europe/Madrid",
        description: "Sun, tapas, and Gaudi architecture.",
        createdBy: bob.id,
      },
      {
        name: "NYC Weekend",
        destination: "New York City, USA",
        startDate: toDateStr(daysFromNow(-10)),
        endDate: toDateStr(daysFromNow(-7)),
        preferredTimezone: "America/New_York",
        description: "Quick weekend getaway to the city.",
        createdBy: carol.id,
      },
    ])
    .returning();

  const [tokyo, barcelona, nyc] = tripRows as [
    (typeof tripRows)[0],
    (typeof tripRows)[0],
    (typeof tripRows)[0],
  ];

  // Members — Alice is on all 3 trips, Tokyo has all 5 members
  const memberRows = await db
    .insert(schema.members)
    .values([
      {
        tripId: tokyo.id,
        userId: alice.id,
        status: "going" as const,
        isOrganizer: true,
      },
      { tripId: tokyo.id, userId: bob.id, status: "going" as const },
      { tripId: tokyo.id, userId: carol.id, status: "going" as const },
      { tripId: tokyo.id, userId: david.id, status: "maybe" as const },
      { tripId: tokyo.id, userId: eve.id, status: "going" as const },
      {
        tripId: barcelona.id,
        userId: bob.id,
        status: "going" as const,
        isOrganizer: true,
      },
      { tripId: barcelona.id, userId: alice.id, status: "going" as const },
      { tripId: barcelona.id, userId: eve.id, status: "going" as const },
      { tripId: barcelona.id, userId: carol.id, status: "not_going" as const },
      {
        tripId: nyc.id,
        userId: carol.id,
        status: "going" as const,
        isOrganizer: true,
      },
      { tripId: nyc.id, userId: alice.id, status: "going" as const },
      { tripId: nyc.id, userId: david.id, status: "maybe" as const },
      { tripId: nyc.id, userId: eve.id, status: "going" as const },
    ])
    .returning();

  // Events — randomly generated per trip
  const trips = [
    { trip: tokyo, startDay: -3, days: 7, creators: [alice, bob, carol, eve] },
    { trip: barcelona, startDay: 14, days: 7, creators: [bob, alice, eve] },
    { trip: nyc, startDay: -10, days: 3, creators: [carol, david, eve] },
  ];

  for (const { trip, startDay, days, creators } of trips) {
    const eventValues: (typeof schema.events.$inferInsert)[] = [];
    const activityNames = shuffle([...EVENT_NAMES.activity]);
    const mealNames = shuffle([...EVENT_NAMES.meal]);
    const travelNames = shuffle([...EVENT_NAMES.travel]);
    let ai = 0;
    let mi = 0;
    let ti = 0;

    for (let day = 0; day < days; day++) {
      const isFirstDay = day === 0;
      const isLastDay = day === days - 1;

      // Add a travel event on first/last day
      if (isFirstDay || isLastDay) {
        const name = travelNames[ti++ % travelNames.length]!;
        const hour = isFirstDay ? randInt(7, 9) : randInt(16, 19);
        eventValues.push({
          tripId: trip.id,
          createdBy: pick(creators).id,
          name,
          eventType: "travel",
          location: pick(cities),
          startTime: daysFromNow(startDay + day, hour),
          endTime: daysFromNow(startDay + day, hour + randInt(1, 3)),
        });
      }

      const count = randInt(3, 5);
      const hours = shuffle([8, 10, 12, 14, 16, 19])
        .slice(0, count)
        .sort((a, b) => a - b);

      for (const hour of hours) {
        const type =
          hour >= 19 || hour <= 8 || hour === 12
            ? ("meal" as const)
            : pick(["activity", "meal"] as const);
        const name =
          type === "meal"
            ? mealNames[mi++ % mealNames.length]!
            : activityNames[ai++ % activityNames.length]!;
        const duration = type === "meal" ? randInt(1, 2) : randInt(2, 4);

        eventValues.push({
          tripId: trip.id,
          createdBy: pick(creators).id,
          name,
          eventType: type,
          location: pick(cities),
          startTime: daysFromNow(startDay + day, hour),
          endTime: daysFromNow(startDay + day, hour + duration),
        });
      }
    }

    await db.insert(schema.events).values(eventValues);
  }

  // Member travel — arrival + departure for going/maybe members
  const travelValues: (typeof schema.memberTravel.$inferInsert)[] = [];

  for (const { trip, startDay, days } of trips) {
    const goingMembers = memberRows.filter(
      (m) =>
        m.tripId === trip.id && (m.status === "going" || m.status === "maybe"),
    );

    for (const m of goingMembers) {
      const location = `${pick(cities)} Airport`;

      travelValues.push({
        tripId: trip.id,
        memberId: m.id,
        travelType: "arrival",
        time: daysFromNow(startDay, randInt(7, 16)),
        location,
        details: pick([
          "Flight from SFO",
          "Flight from LAX",
          "Flight from JFK",
          "Flight from ORD",
          "Flight from LHR",
          "Train from nearby city",
        ]),
      });

      if (Math.random() < 0.8) {
        travelValues.push({
          tripId: trip.id,
          memberId: m.id,
          travelType: "departure",
          time: daysFromNow(startDay + days, randInt(8, 18)),
          location,
        });
      }
    }
  }

  await db.insert(schema.memberTravel).values(travelValues);

  // Accommodations — Tokyo has two (hotel swap mid-trip)
  await db.insert(schema.accommodations).values([
    {
      tripId: tokyo.id,
      createdBy: alice.id,
      name: "Hotel Sunroute Plaza Shinjuku",
      address: "2-3-1 Yoyogi, Shibuya-ku, Tokyo",
      checkIn: daysFromNow(-3, 15),
      checkOut: daysFromNow(0, 11),
      description:
        "Door code: 4821. Wifi: SunrouteGuest / pass: tokyo2026. Checkout by 11am — leave bags at front desk.",
    },
    {
      tripId: tokyo.id,
      createdBy: alice.id,
      name: "Airbnb in Shibuya",
      address: "15-8 Udagawacho, Shibuya-ku, Tokyo",
      checkIn: daysFromNow(0, 15),
      checkOut: daysFromNow(4, 10),
      description:
        "Lockbox code: 7734. Wifi: ShibuyaFlat / pass: guest2026. Washer in unit. Trash goes out Tue/Fri mornings.",
    },
    {
      tripId: barcelona.id,
      createdBy: bob.id,
      name: "Airbnb near La Rambla",
      address: "Carrer de Ferran 28, Barcelona",
      checkIn: daysFromNow(14, 14),
      checkOut: daysFromNow(21, 10),
    },
    {
      tripId: nyc.id,
      createdBy: carol.id,
      name: "The NoMad Hotel",
      address: "1170 Broadway, New York",
      checkIn: daysFromNow(-10, 15),
      checkOut: daysFromNow(-7, 12),
    },
  ]);

  // Messages
  const [tokyoMsg1] = await db
    .insert(schema.messages)
    .values({
      tripId: tokyo.id,
      authorId: alice.id,
      content: "So excited for Tokyo! Has everyone started packing?",
    })
    .returning();

  await db.insert(schema.messages).values([
    {
      tripId: tokyo.id,
      authorId: bob.id,
      parentId: tokyoMsg1!.id,
      content: "Almost done! Can't wait for the ramen.",
    },
    {
      tripId: tokyo.id,
      authorId: carol.id,
      content: "Still deciding if I can make it — will confirm by next week.",
    },
    {
      tripId: barcelona.id,
      authorId: bob.id,
      content: "Found a great rooftop bar near our Airbnb!",
    },
    {
      tripId: barcelona.id,
      authorId: eve.id,
      content: "I'll book the Sagrada Familia tickets. How many do we need?",
    },
    {
      tripId: nyc.id,
      authorId: carol.id,
      isPinned: true,
      content: "Hamilton tickets are booked! Saturday 7:30pm.",
    },
  ]);

  // --- Affiliate Suggestions Test Trip ---
  // Designed to trigger all 4 gap detection rules:
  //   missing_travel: Alice is "going" but has no memberTravel
  //   no_accommodation: zero accommodations
  //   empty_day: days 3 and 4 have no events
  //   missing_meal: day 2 has activities but no meals
  const [lisbon] = await db
    .insert(schema.trips)
    .values({
      name: "Lisbon Getaway",
      destination: "Lisbon, Portugal",
      destinationLat: 38.7223,
      destinationLon: -9.1393,
      startDate: toDateStr(daysFromNow(7)),
      endDate: toDateStr(daysFromNow(13)),
      preferredTimezone: "Europe/Lisbon",
      description: "A week in Lisbon — affiliate suggestions test trip.",
      createdBy: alice.id,
    })
    .returning();

  const lisbonMembers = await db
    .insert(schema.members)
    .values([
      {
        tripId: lisbon!.id,
        userId: alice.id,
        status: "going" as const,
        isOrganizer: true,
      },
      { tripId: lisbon!.id, userId: bob.id, status: "going" as const },
      { tripId: lisbon!.id, userId: carol.id, status: "maybe" as const },
    ])
    .returning();

  // Only Bob has travel — Alice (going) has none → triggers missing_travel
  const bobMember = lisbonMembers.find((m) => m.userId === bob.id)!;
  await db.insert(schema.memberTravel).values([
    {
      tripId: lisbon!.id,
      memberId: bobMember.id,
      travelType: "arrival",
      time: daysFromNow(7, 10),
      location: "Lisbon Airport",
      details: "Flight from LHR",
    },
    {
      tripId: lisbon!.id,
      memberId: bobMember.id,
      travelType: "departure",
      time: daysFromNow(13, 16),
      location: "Lisbon Airport",
    },
  ]);

  // No accommodations → triggers no_accommodation

  // Events: only on days 1, 2, 5 — days 3 & 4 empty → triggers empty_day
  // Day 2 has only activities (no meals) → triggers missing_meal
  await db.insert(schema.events).values([
    // Day 1 (startDay+7): has meals + activities — no gap
    {
      tripId: lisbon!.id,
      createdBy: alice.id,
      name: "Welcome Dinner",
      eventType: "meal",
      location: "Time Out Market",
      startTime: daysFromNow(7, 19),
      endTime: daysFromNow(7, 21),
    },
    {
      tripId: lisbon!.id,
      createdBy: bob.id,
      name: "Evening Walk in Alfama",
      eventType: "activity",
      location: "Alfama District",
      startTime: daysFromNow(7, 16),
      endTime: daysFromNow(7, 18),
    },
    // Day 2 (startDay+8): activities only, no meals → triggers missing_meal
    {
      tripId: lisbon!.id,
      createdBy: alice.id,
      name: "Belém Tower Visit",
      eventType: "activity",
      location: "Belém Tower",
      startTime: daysFromNow(8, 10),
      endTime: daysFromNow(8, 12),
    },
    {
      tripId: lisbon!.id,
      createdBy: alice.id,
      name: "Jerónimos Monastery",
      eventType: "activity",
      location: "Jerónimos Monastery",
      startTime: daysFromNow(8, 14),
      endTime: daysFromNow(8, 16),
    },
    // Days 3 & 4 (startDay+9, startDay+10): no events → triggers empty_day
    // Day 5 (startDay+11): has meals + activities — no gap
    {
      tripId: lisbon!.id,
      createdBy: bob.id,
      name: "Sintra Day Trip",
      eventType: "activity",
      location: "Sintra",
      startTime: daysFromNow(11, 9),
      endTime: daysFromNow(11, 17),
    },
    {
      tripId: lisbon!.id,
      createdBy: alice.id,
      name: "Seafood Dinner",
      eventType: "meal",
      location: "Cervejaria Ramiro",
      startTime: daysFromNow(11, 19),
      endTime: daysFromNow(11, 21),
    },
  ]);

  await db.insert(schema.messages).values({
    tripId: lisbon!.id,
    authorId: alice.id,
    content:
      "This trip is set up for testing affiliate suggestions — has gaps for all 4 rules!",
  });

  console.log(
    "\n  🧪 Affiliate test trip: 'Lisbon Getaway' (login as Alice to see suggestions)\n",
  );

  // Print login info
  console.log("\nSeed complete! Login with any phone number + code 000000:\n");
  console.log("  Phone Number     Name");
  console.log("  ──────────────── ──────────────");
  const names = [
    "Alice Johnson",
    "Bob Williams",
    "Carol Martinez",
    "David Kim",
    "Eve Chen",
  ];
  PHONE_NUMBERS.forEach((phone, i) => console.log(`  ${phone}  ${names[i]}`));
  console.log("");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
