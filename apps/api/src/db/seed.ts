import { reset, cities } from "drizzle-seed";
import { db, pool } from "@/config/database.js";
import * as schema from "@/db/schema/index.js";
import type { POISuggestion } from "@journiful/shared/types";

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
        destinationLat: 35.6762,
        destinationLon: 139.6503,
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
        destinationLat: 41.3874,
        destinationLon: 2.1686,
        startDate: toDateStr(daysFromNow(14)),
        endDate: toDateStr(daysFromNow(21)),
        preferredTimezone: "Europe/Madrid",
        description: "Sun, tapas, and Gaudi architecture.",
        createdBy: bob.id,
      },
      {
        name: "NYC Weekend",
        destination: "New York City, USA",
        destinationLat: 40.7128,
        destinationLon: -74.0060,
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
            ? ("food_and_drink" as const)
            : pick(["misc", "food_and_drink"] as const);
        const name =
          type === "food_and_drink"
            ? mealNames[mi++ % mealNames.length]!
            : activityNames[ai++ % activityNames.length]!;
        const duration = type === "food_and_drink" ? randInt(1, 2) : randInt(2, 4);

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
      eventType: "food_and_drink",
      location: "Time Out Market",
      startTime: daysFromNow(7, 19),
      endTime: daysFromNow(7, 21),
    },
    {
      tripId: lisbon!.id,
      createdBy: bob.id,
      name: "Evening Walk in Alfama",
      eventType: "misc",
      location: "Alfama District",
      startTime: daysFromNow(7, 16),
      endTime: daysFromNow(7, 18),
    },
    // Day 2 (startDay+8): activities only, no meals → triggers missing_meal
    {
      tripId: lisbon!.id,
      createdBy: alice.id,
      name: "Belém Tower Visit",
      eventType: "misc",
      location: "Belém Tower",
      startTime: daysFromNow(8, 10),
      endTime: daysFromNow(8, 12),
    },
    {
      tripId: lisbon!.id,
      createdBy: alice.id,
      name: "Jerónimos Monastery",
      eventType: "misc",
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
      eventType: "misc",
      location: "Sintra",
      startTime: daysFromNow(11, 9),
      endTime: daysFromNow(11, 17),
    },
    {
      tripId: lisbon!.id,
      createdBy: alice.id,
      name: "Seafood Dinner",
      eventType: "food_and_drink",
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

  // ── POI Cache Mock Data ───────────────────────────────────────────────

  // Helper to create mock POIs for a city
  function makeMockPOIs(
    sourceId: string,
    name: string,
    address: string,
    lat: number,
    lon: number,
    distance: number,
    category: "food_and_drink" | "arts_and_entertainment" | "outdoors" | "nightlife",
    subcategory: string,
  ): POISuggestion {
    return {
      sourceId,
      name,
      address,
      lat,
      lon,
      distance,
      category,
      popularity: null,
      price: null,
      rating: null,
      website: null,
      tel: null,
      subcategory,
      eventId: null,
    };
  }

  // Tokyo POIs
  const tokyoPOIs: POISuggestion[] = [
    makeMockPOIs("mock-tokyo-001", "Ichiran Shibuya", "1-22-7 Jinnan, Shibuya", 35.6603, 139.7024, 3200, "food_and_drink", "Ramen Restaurant"),
    makeMockPOIs("mock-tokyo-002", "Sukiyabashi Jiro", "4-2-15 Ginza, Chuo", 35.6722, 139.7637, 5200, "food_and_drink", "Sushi Restaurant"),
    makeMockPOIs("mock-tokyo-003", "Gonpachi Nishiazabu", "1-13-11 Nishiazabu, Minato", 35.6592, 139.7239, 2800, "food_and_drink", "Izakaya"),
    makeMockPOIs("mock-tokyo-004", "Senso-ji Temple", "2-3-1 Asakusa, Taito", 35.7148, 139.7967, 4800, "arts_and_entertainment", "Buddhist Temple"),
    makeMockPOIs("mock-tokyo-005", "teamLab Borderless", "1-3-8 Aomi, Koto", 35.6247, 139.7822, 7500, "arts_and_entertainment", "Digital Art Museum"),
    makeMockPOIs("mock-tokyo-006", "Shinjuku Gyoen", "11 Naitomachi, Shinjuku", 35.6852, 139.7100, 4100, "outdoors", "National Garden"),
    makeMockPOIs("mock-tokyo-007", "Yoyogi Park", "2-1 Yoyogikamizonocho, Shibuya", 35.6715, 139.6949, 3500, "outdoors", "City Park"),
    makeMockPOIs("mock-tokyo-008", "Golden Gai", "1-1-6 Kabukicho, Shinjuku", 35.6943, 139.7031, 2300, "nightlife", "Bar District"),
    makeMockPOIs("mock-tokyo-009", "WOMB", "2-16 Maruyamacho, Shibuya", 35.6555, 139.6976, 1800, "nightlife", "Nightclub"),
  ];

  // Barcelona POIs
  const barcelonaPOIs: POISuggestion[] = [
    makeMockPOIs("mock-bcn-001", "Ciudad Condal", "Rambla de Catalunya 18", 41.3895, 2.1656, 1500, "food_and_drink", "Tapas Restaurant"),
    makeMockPOIs("mock-bcn-002", "La Boqueria", "La Rambla 91", 41.3817, 2.1717, 2200, "food_and_drink", "Food Market"),
    makeMockPOIs("mock-bcn-003", "Can Paixano", "Carrer de la Reina Cristina 7", 41.3801, 2.1834, 2800, "food_and_drink", "Cava Bar"),
    makeMockPOIs("mock-bcn-004", "Sagrada Família", "Carrer de Mallorca 401", 41.4036, 2.1744, 3100, "arts_and_entertainment", "Basilica"),
    makeMockPOIs("mock-bcn-005", "Picasso Museum", "Carrer Montcada 15-23", 41.3852, 2.1808, 2400, "arts_and_entertainment", "Art Museum"),
    makeMockPOIs("mock-bcn-006", "Barceloneta Beach", "Passeig Marítim de la Barceloneta", 41.3786, 2.1925, 3500, "outdoors", "Beach"),
    makeMockPOIs("mock-bcn-007", "Park Güell", "Carrer d'Olot 7", 41.4145, 2.1527, 4200, "outdoors", "Public Park"),
    makeMockPOIs("mock-bcn-008", "Razzmatazz", "Carrer dels Almogàvers 122", 41.3975, 2.1912, 2600, "nightlife", "Nightclub"),
  ];

  // NYC POIs
  const nycPOIs: POISuggestion[] = [
    makeMockPOIs("mock-nyc-001", "Joe's Pizza", "7 Carmine St, Greenwich Village", 40.7303, -74.0026, 1800, "food_and_drink", "Pizzeria"),
    makeMockPOIs("mock-nyc-002", "Katz's Delicatessen", "205 E Houston St, Lower East Side", 40.7223, -73.9874, 2500, "food_and_drink", "Deli"),
    makeMockPOIs("mock-nyc-003", "Russ & Daughters", "179 E Houston St", 40.7226, -73.9883, 2600, "food_and_drink", "Bagel Shop"),
    makeMockPOIs("mock-nyc-004", "The Met", "1000 5th Ave, Upper East Side", 40.7794, -73.9632, 4200, "arts_and_entertainment", "Art Museum"),
    makeMockPOIs("mock-nyc-005", "Broadway Theatre", "1681 Broadway, Midtown", 40.7627, -73.9846, 1100, "arts_and_entertainment", "Theater District"),
    makeMockPOIs("mock-nyc-006", "Central Park", "59th to 110th St, Manhattan", 40.7829, -73.9654, 4500, "outdoors", "Urban Park"),
    makeMockPOIs("mock-nyc-007", "The High Line", "Gansevoort St to 34th St", 40.7480, -74.0048, 2300, "outdoors", "Elevated Park"),
    makeMockPOIs("mock-nyc-008", "The Dead Rabbit", "30 Water St, Financial District", 40.7033, -74.0112, 3200, "nightlife", "Irish Pub"),
    makeMockPOIs("mock-nyc-009", "House of Yes", "2 Wyckoff Ave, Bushwick", 40.7066, -73.9229, 8500, "nightlife", "Event Venue"),
  ];

  // Lisbon POIs
  const lisbonPOIs: POISuggestion[] = [
    makeMockPOIs("mock-lis-001", "Pastéis de Belém", "Rua de Belém 84", 38.6975, -9.2037, 4200, "food_and_drink", "Bakery"),
    makeMockPOIs("mock-lis-002", "Cervejaria Ramiro", "Av. Almirante Reis 1", 38.7319, -9.1347, 1800, "food_and_drink", "Seafood Restaurant"),
    makeMockPOIs("mock-lis-003", "Time Out Market", "Av. 24 de Julho 49", 38.7068, -9.1453, 2400, "food_and_drink", "Food Court"),
    makeMockPOIs("mock-lis-004", "Jerónimos Monastery", "Praça do Império", 38.6979, -9.2068, 4500, "arts_and_entertainment", "Monastery"),
    makeMockPOIs("mock-lis-005", "MAAT", "Av. Brasília, Central Tejo", 38.6959, -9.1943, 3200, "arts_and_entertainment", "Modern Art Museum"),
    makeMockPOIs("mock-lis-006", "Praça do Comércio", "Praça do Comércio", 38.7075, -9.1365, 1500, "outdoors", "Plaza"),
    makeMockPOIs("mock-lis-007", "Jardim Botânico", "Rua da Escola Politécnica 58", 38.7167, -9.1522, 2100, "outdoors", "Botanical Garden"),
    makeMockPOIs("mock-lis-008", "Bairro Alto", "Bairro Alto", 38.7126, -9.1465, 1800, "nightlife", "Nightlife District"),
    makeMockPOIs("mock-lis-009", "Lux Frágil", "Av. Infante D. Henrique", 38.7075, -9.1268, 1600, "nightlife", "Nightclub"),
  ];

  // Insert poi_cache rows
  await db.insert(schema.poiCache).values([
    {
      tripId: tokyo.id,
      source: "google",
      searchLat: tokyo.destinationLat!,
      searchLon: tokyo.destinationLon!,
      searchLocation: tokyo.destination,
      cachedAt: new Date(),
      suggestions: tokyoPOIs,
    },
    {
      tripId: barcelona.id,
      source: "google",
      searchLat: barcelona.destinationLat!,
      searchLon: barcelona.destinationLon!,
      searchLocation: barcelona.destination,
      cachedAt: new Date(),
      suggestions: barcelonaPOIs,
    },
    {
      tripId: nyc.id,
      source: "google",
      searchLat: nyc.destinationLat!,
      searchLon: nyc.destinationLon!,
      searchLocation: nyc.destination,
      cachedAt: new Date(),
      suggestions: nycPOIs,
    },
    {
      tripId: lisbon!.id,
      source: "google",
      searchLat: lisbon!.destinationLat!,
      searchLon: lisbon!.destinationLon!,
      searchLocation: lisbon!.destination,
      cachedAt: new Date(),
      suggestions: lisbonPOIs,
    },
  ]);

  console.log("\n  📍 POI cache seeded for all 4 trips\n");

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
