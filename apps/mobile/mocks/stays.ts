import type { Trip } from "@/components/trip/TripCard";
import { addDays } from "@/lib/dateRange";
import type { Stay, StayLink } from "@/lib/stays";
import { placePhoto, zoneOffsetFor } from "@/mocks/events";

/**
 * Mock stays, laid onto the days the trip actually runs — the same trick
 * the events and the roster use, so a stay's dates agree with the
 * itinerary hanging under it and the lab needs no hand-written
 * calendar.
 *
 * The descriptions are the point of this file. With no wifi field and no
 * door-code field, the way in is prose the organizer pasted out of a
 * host's message, so the mocks write it the way that arrives: the code
 * first, the wifi under it, the host's number where a host puts it.
 * Hotel Oderberger has none at all, which is a booking made through an
 * app and the case the screen has to hold together without.
 *
 * Photos are stand-ins: the real one comes from Google Places through
 * the API's photo proxy, which owes attribution on the hero.
 */
type Template = {
  name: string;
  address: string;
  /** Nights from the trip's first night. */
  fromNight: number;
  toNight: number;
  /** The trade's own convention, unless a place says otherwise. */
  checkInClock?: string;
  checkOutClock?: string;
  /**
   * Nobody gave a time: a friend's spare room, a house you have the key
   * to. The days are the whole of it, and the sheet has to say the day
   * without inventing an hour for it.
   */
  untimed?: boolean;
  /** What the host actually sent, pasted as it arrived. */
  description?: string;
  /** Name and URL: what the sheet's last block links out to. */
  links?: Array<[string, string]>;
};

const PICOS: Template[] = [
  {
    name: "Refugi de Múclet",
    address: "Camí de Múclet, 07100 Sóller",
    fromNight: 0,
    toNight: 1,
    description:
      "Door code 2207 — the gate at the trailhead is on a latch, not a lock.\n\nWifi: refugi-muclet / muclet2026.\n\nDinner is at eight and there is no choice. Tell them at the bar if you are vegetarian.",
    links: [["Refugi page", "https://example.com/refugi-muclet"]],
  },
  {
    name: "Refugi de Túent",
    address: "Coll de Túent, Deià",
    fromNight: 1,
    toNight: 2,
    checkInClock: "16:00",
    description:
      "No wifi and no signal up here.\n\nRing the bell — someone is in the kitchen until nine.\n\nBring cash. The card machine is a rumour.",
  },
  {
    name: "Son Moragues",
    address: "Carretera de Valldemossa, 07170 Valldemossa",
    fromNight: 2,
    toNight: 4,
    description:
      "Keypad 1489 on the courtyard door; the studio is the second arch.\n\nWifi SonMoragues-Guest / olivetree. Joan is on +34 971 61 20 44 if anything is wrong.\n\nThe water takes a minute to run hot. Eggs from the yard are in the fridge.",
    links: [
      ["Listing", "https://example.com/son-moragues"],
      [
        "Directions from Sóller",
        "https://example.com/son-moragues/how-to-find-us",
      ],
    ],
  },
  {
    name: "Ca'n Puig",
    address: "Carrer de la Mar 14, 07100 Sóller",
    fromNight: 4,
    toNight: 6,
    description:
      "Lockbox left of the blue gate — 4417. The gate sticks, so lift it before you push.\n\nWifi PuigSoller / tramuntana2019. Marta is on +34 600 123 456.\n\nThe bins go out on Tuesday night, if we are still here.",
    links: [
      ["Listing", "https://example.com/can-puig"],
      ["House rules", "https://example.com/can-puig/rules"],
    ],
  },
  {
    name: "Refugi de Deià",
    address: "Carrer des Clot, Deià",
    fromNight: 6,
    toNight: 7,
    description: "Code 3311 on the door by the fig tree.",
  },
];

const LISBON: Template[] = [
  {
    name: "Casa de Alfama",
    address: "Rua dos Remédios 88, 1100-099 Lisboa",
    fromNight: 0,
    toNight: 3,
    checkOutClock: "11:00",
    description:
      "Fourth floor, no lift. Buzzer is the bottom one, marked 'Alfama 4'. Code 2 4 8 9.\n\nWifi MEO-4F2A / saudade88. Inês: +351 912 345 678.\n\nNeighbours go to bed early. The street is loud until about eleven and then it is not.",
    links: [["Listing", "https://example.com/casa-de-alfama"]],
  },
];

const AMALFI: Template[] = [
  {
    name: "Casa Marina",
    address: "Via Umberto I 22, 84010 Praiano",
    fromNight: 0,
    toNight: 5,
    checkInClock: "14:00",
    description:
      "Through the arch, then up the outside stairs. Keypad 7788.\n\nWifi CasaMarina / limone2026. Giulia is on +39 089 874 221.\n\nParking is up the hill; leave the car there and walk down.",
    links: [["Listing", "https://example.com/casa-marina"]],
  },
];

/**
 * A hotel nobody wrote anything down for: the desk takes you in, the
 * wifi is on the back of the door, and the organizer filled in four
 * fields and stopped. The screen has to read as complete without it.
 */
const BERLIN: Template[] = [
  {
    name: "Hotel Oderberger",
    address: "Oderberger Str. 57, 10435 Berlin",
    fromNight: 0,
    toNight: 3,
    checkOutClock: "11:00",
    links: [["Hotel", "https://example.com/hotel-oderberger"]],
  },
];

const ICELAND: Template[] = [
  {
    name: "Guesthouse Grótta",
    address: "Sæbraut 140, 105 Reykjavík",
    fromNight: 0,
    toNight: 3,
    description:
      "Keypad 1099 on the side door after eight. Before that the desk is open.\n\nWifi Grettir-Guest / northernlights.",
  },
  {
    name: "Cabin at Húsafell",
    address: "Húsafell 1, Borgarfjörður",
    fromNight: 3,
    toNight: 7,
    checkInClock: "17:00",
    description:
      "The key is in the red box on the porch.\n\nWood is under the deck and the hot tub takes about an hour to heat.\n\nNo phone signal for the last twenty minutes of the drive — take the directions down before you leave.",
    links: [["Directions", "https://example.com/husafell/cabin-4"]],
  },
];

/**
 * A friend's spare room: days, and no times at all.
 *
 * There is no check-in hour to be at and no check-out hour to be gone
 * by, so both are stamped at midnight — which is the column's way of
 * saying nobody said — and the sheet prints the day and stops. It is the
 * case that decides whether the screen is honest about what it knows.
 */
const CHAMONIX: Template[] = [
  {
    name: "Chalet Ravanel",
    address: "Chemin des Praz 12, Les Praz, Chamonix",
    fromNight: 0,
    toNight: 7,
    untimed: true,
    description:
      "Kirsten's place, up the track past the bakery. The door is open, so no need to knock — the room at the top of the stairs is ours.\n\nWifi ravanel-guest / chamonix2019.\n\nBoots off in the porch, and the stove needs wood from the shed.",
  },
];

const POOLS: Record<string, Template[]> = {
  picos: PICOS,
  lisbon: LISBON,
  amalfi: AMALFI,
  berlin: BERLIN,
  iceland: ICELAND,
  chamonix: CHAMONIX,
};

/**
 * A wall-clock time on the trip's own clock, the same stamping the
 * events use: three in the afternoon in Mallorca is three in the
 * afternoon there, not in UTC.
 */
function stamped(tripId: string, day: string, clock: string): string {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = clock.split(":").map(Number) as [number, number];
  return new Date(
    Date.UTC(year, month - 1, date, hour, minute) -
      zoneOffsetFor(tripId) * 60_000,
  ).toISOString();
}

function linksOf(template: Template): StayLink[] {
  return (template.links ?? []).map(([name, url]) => ({ name, url }));
}

export function staysFor(trip: Trip): Stay[] {
  const pool = POOLS[trip.id] ?? [];

  return pool.map((template, index) => ({
    id: `${trip.id}-stay-${index + 1}`,
    name: template.name,
    address: template.address,
    // The API geocodes the address; the lab has no geocoder, and the
    // sheet links by the address string rather than a pin.
    addressLat: null,
    addressLon: null,
    description: template.description ?? null,
    checkIn: stamped(
      trip.id,
      addDays(trip.startDate, template.fromNight),
      template.untimed ? "00:00" : (template.checkInClock ?? "15:00"),
    ),
    checkOut: stamped(
      trip.id,
      addDays(trip.startDate, template.toNight),
      template.untimed ? "00:00" : (template.checkOutClock ?? "10:00"),
    ),
    image: placePhoto(template.name),
    links: linksOf(template),
    deletedAt: null,
  }));
}
