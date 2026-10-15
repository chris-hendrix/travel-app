/**
 * Travel seeding for E2E.
 *
 * The travel journey needs a filed row before it can prove anything:
 * journey (b) cold-loads the form at a URL naming a specific record, and
 * the record has to exist first. This helper files it through the real
 * endpoint, the way `seedTripViaAPI` creates its trip, so the spec is not
 * asserting against a fixture it wrote directly into the database.
 *
 * A row's two ends live in one record, and only the direction's own side
 * is pertinent (`shared/schemas/member-travel.ts` refines on it), so the
 * caller passes the time for the direction it is filing and this helper
 * puts it on the right column. Both ends are columns all the same — two
 * times and two places — so a caller filing a leg that holds both (a
 * hire) passes the far end's time in `times` and its where in the seed.
 * `travelRowsViaAPI` is the read back: the "exactly one row, same id"
 * assertion is a server fact, not a cache one, and only a re-read can
 * say it.
 */

import type { APIRequestContext } from "@playwright/test";
import type { TransportMode } from "@journiful/shared/utils";
import { API_BASE } from "./timeouts";

export type TravelDirection = "arrival" | "departure";

/**
 * What a leg is filed *with*, beyond the direction's own time and place:
 * the mode, and the far end's where.
 */
export type TravelSeed = {
  /**
   * How the member is travelling — one of the six (D1). Absent sends no
   * mode at all, which is the body a build already on a phone sends and
   * what the column's own default answers with `flight`: this helper
   * files the mode it is told and invents none.
   */
  mode?: TransportMode;
  /**
   * The **other** end's where — a hire's dropoff, a flight's takeoff. The
   * record has one column per side, and only the direction's own side is
   * pertinent, so the far one has to be named rather than folded into
   * the location above.
   */
  farLocation?: string;
};

/** The row as `GET /trips/:tripId/member-travel` serves it, trimmed to
 *  the fields the spec reads. */
export type TravelRowWire = {
  id: string;
  memberId: string;
  travelType: TravelDirection;
  arrivalTime: string | null;
  departureTime: string | null;
  arrivalLocation: string | null;
  departureLocation: string | null;
};

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** The organizer's own **member** id — the id space a travel row's
 *  `memberId` lives in, never the account's user id. */
export async function organizerMemberIdViaAPI(
  request: APIRequestContext,
  token: string,
  tripId: string,
): Promise<string> {
  const res = await request.get(`${API_BASE}/trips/${tripId}/members`, {
    headers: auth(token),
  });
  if (!res.ok()) {
    throw new Error(`list-members failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    members: Array<{ id: string; isOrganizer: boolean }>;
  };
  const organizer = body.members.find((member) => member.isOrganizer);
  if (!organizer) {
    throw new Error(`list-members named no organizer on trip ${tripId}`);
  }
  return organizer.id;
}

/**
 * File one direction for one member through the real endpoint. Returns
 * the row's id, which is what journey (b)'s URL needs.
 *
 * `POST` upserts on the member and direction (`member-travel.service.ts`),
 * so this answers 201 for a first filing and 200 for a re-filing; both
 * carry the row.
 */
export async function seedTravelViaAPI(
  request: APIRequestContext,
  token: string,
  tripId: string,
  memberId: string,
  travelType: TravelDirection,
  times: { arrivalTime?: string; departureTime?: string },
  location?: string,
  seed: TravelSeed = {},
): Promise<string> {
  // The side this helper does *not* file by default, which is the one a
  // `farLocation` writes to.
  const farLocationKey =
    travelType === "arrival" ? "departureLocation" : "arrivalLocation";
  const res = await request.post(`${API_BASE}/trips/${tripId}/member-travel`, {
    data: {
      travelType,
      memberId,
      ...times,
      // A mode-less body stays mode-less: the column's default is the
      // only default, and a body that carried `flight` instead would
      // state something the caller never said.
      ...(seed.mode ? { transportMode: seed.mode } : {}),
      ...(location
        ? travelType === "arrival"
          ? { arrivalLocation: location }
          : { departureLocation: location }
        : {}),
      ...(seed.farLocation
        ? { [farLocationKey]: seed.farLocation }
        : {}),
    },
    headers: auth(token),
  });
  if (!res.ok()) {
    throw new Error(
      `create-travel failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { memberTravel: { id: string } };
  return body.memberTravel.id;
}

/** Every live travel row on a trip, as the API holds them. */
export async function travelRowsViaAPI(
  request: APIRequestContext,
  token: string,
  tripId: string,
): Promise<TravelRowWire[]> {
  const res = await request.get(`${API_BASE}/trips/${tripId}/member-travel`, {
    headers: auth(token),
  });
  if (!res.ok()) {
    throw new Error(`list-travel failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { memberTravels: TravelRowWire[] };
  return body.memberTravels;
}
