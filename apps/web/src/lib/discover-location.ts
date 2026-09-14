export interface DiscoverLocation {
  lat: number;
  lon: number;
  name: string;
  source: "trip" | "accommodation";
  accommodationId?: string;
}

interface DiscoverTripInput {
  destinationLat: number | null;
  destinationLon: number | null;
  destination: string | null;
}

interface DiscoverAccommodationInput {
  id: string;
  name: string;
  addressLat: number | null;
  addressLon: number | null;
  checkIn: string | null;
}

export function resolveDiscoverLocations(
  trip: DiscoverTripInput | undefined,
  accommodations: DiscoverAccommodationInput[] | undefined,
  now: Date = new Date(),
): DiscoverLocation[] {
  const nowMs = now.getTime();

  const accs = (accommodations ?? [])
    .filter((a) => a.addressLat !== null && a.addressLon !== null)
    .map((a) => {
      const parsed = a.checkIn === null ? NaN : Date.parse(a.checkIn);
      const distance = Number.isNaN(parsed) ? Infinity : Math.abs(parsed - nowMs);
      const isFuture = !Number.isNaN(parsed) && parsed >= nowMs;
      return { acc: a, distance, isFuture };
    })
    .sort((x, y) => {
      if (x.distance !== y.distance) return x.distance - y.distance;
      if (x.isFuture !== y.isFuture) return x.isFuture ? -1 : 1;
      return x.acc.id < y.acc.id ? -1 : x.acc.id > y.acc.id ? 1 : 0;
    })
    .map(({ acc }): DiscoverLocation => ({
      lat: acc.addressLat as number,
      lon: acc.addressLon as number,
      name: acc.name,
      source: "accommodation",
      accommodationId: acc.id,
    }));

  const result = [...accs];

  if (
    trip !== undefined &&
    trip.destinationLat !== null &&
    trip.destinationLon !== null
  ) {
    result.push({
      lat: trip.destinationLat,
      lon: trip.destinationLon,
      name: trip.destination || "Trip destination",
      source: "trip",
    });
  }

  return result;
}
