import { TRANSPORT_MODES, type TransportMode } from "@journiful/shared/utils";
import type { TravelLeg } from "@/lib/newTravel";

/**
 * The leg's vocabulary, in two halves: the **words** are
 * `@journiful/shared/utils`'s now, and the **number** is still this
 * module's.
 *
 * The words moved out of the app because a second surface reads them: the
 * API's calendar feed (`GET /calendar/:token.ics`) writes the same words
 * into an event's description, the API cannot import `apps/mobile`, and a
 * table it had to copy would be a second vocabulary for one end of one
 * leg. So the one table lives in `shared/utils/travel.ts`, and this file
 * re-exports it — `modeLabel`, `endLabel`, `whereLabel`, `endNoun`,
 * `farEndWord`, and the `TravelSide` they are keyed by — so no screen has
 * to change an import, and still every one of them reads the shared table.
 * Nothing here may hold a copy: the words are one table, and
 * `__tests__/transport-mode.test.ts` reads this file off disk to keep it
 * that way.
 *
 * What stays is the number field: which modes keep one at all, what it is
 * called, what the field hints at, whether it can be looked up, and what a
 * mode change does to a number the new mode cannot keep. The API has no
 * number field and writes no number the mode does not own, so none of this
 * has a second reader — it is the form's business, and `NUMBER_MAX_LENGTH`
 * is the column's cap rather than a taste.
 *
 * Pure, with no renderer in it: the mobile suite has none, so the words and
 * the number's rules are both unit-tested rather than eyeballed at 390 and
 * 1280.
 */

export {
  endLabel,
  endNoun,
  farEndWord,
  modeLabel,
  whereLabel,
} from "@journiful/shared/utils";
export type { TravelSide } from "@journiful/shared/utils";

/**
 * The longest value the number field will take, and the column's own cap:
 * `flight_number` is `varchar(10)`, and the field was free to type past it
 * the moment the mode stopped being a flight.
 *
 * It lives here, beside the placeholders it constrains, because the two
 * are one invariant: a hint may not demonstrate a value the field
 * refuses. `FlixBus 042` is eleven characters, which is why the bus's
 * placeholder reads `FlixBus 42` below — and it lives here rather than in
 * the component so that `__tests__/transport-mode.test.ts` can hold every
 * placeholder under it in one assertion, the Vitest suite having no
 * renderer to import a screen with.
 */
export const NUMBER_MAX_LENGTH = 10;

/**
 * The number's field, where the mode keeps one.
 *
 * `bus` says service rather than number because that is what a coach
 * has, and a mode absent from this table has no field at all: car,
 * rental and other are a driver's and a walker's business, and the
 * placeholder is the mode's own so the field hints at the shape it
 * wants (`UA 1842`, `TGV 8412`, `FlixBus 42`).
 *
 * `lookup` is the flight's alone: a flight number is what
 * `POST /flights/lookup` is asked about, and the times it answers with
 * are the flight's. Everything else is hand-typed.
 */
const NUMBER_FIELDS: Partial<
  Record<TransportMode, { label: string; placeholder: string; lookup: boolean }>
> = {
  flight: { label: "Flight number", placeholder: "UA 1842", lookup: true },
  train: { label: "Train number", placeholder: "TGV 8412", lookup: false },
  bus: { label: "Bus service", placeholder: "FlixBus 42", lookup: false },
};

/**
 * The modes this file's own table has a row for — the wire's list, not a
 * second copy of one: `TRANSPORT_MODES` is `shared`'s, and every mode in
 * it is a mode the form draws a chip for.
 */
const WIRE_MODES: ReadonlySet<string> = new Set(TRANSPORT_MODES);

/**
 * The mode the number table is read by: the one it was handed where the
 * wire knows it, the flight where it does not.
 *
 * The same deploy-window guard the words' table keeps for itself, in the
 * one place the words no longer cover: a bundle can meet an API that
 * predates a mode — or a newer API can know one this bundle does not — and
 * `NUMBER_FIELDS[mode]` is `undefined` for it, which would tell the form
 * that a flight has no number field. `transport_mode` is
 * `NOT NULL DEFAULT 'flight'`, so the flight's row is what such a leg
 * honestly is.
 *
 * It is **not** a licence to file a default: nothing that writes a leg
 * reads this, so an absent mode stays absent rather than becoming a flight
 * on the way out.
 */
function numberMode(mode: TransportMode | undefined): TransportMode {
  return mode !== undefined && WIRE_MODES.has(mode) ? mode : "flight";
}

/** The number field's label, or null where the mode keeps no number. */
export function numberLabel(mode: TransportMode | undefined): string | null {
  return NUMBER_FIELDS[numberMode(mode)]?.label ?? null;
}

/** The number field's placeholder, or null where there is no field. */
export function numberPlaceholder(
  mode: TransportMode | undefined,
): string | null {
  return NUMBER_FIELDS[numberMode(mode)]?.placeholder ?? null;
}

/** Whether the mode has a number field at all — the render gate. */
export function hasNumberField(mode: TransportMode | undefined): boolean {
  return numberLabel(mode) !== null;
}

/** Whether the number is looked up rather than typed: the flight alone. */
export function hasLookup(mode: TransportMode | undefined): boolean {
  return NUMBER_FIELDS[numberMode(mode)]?.lookup === true;
}

/**
 * The leg under a new mode, with the number the new mode can no longer
 * keep.
 *
 * The number is the *flight's*: it is what `formatFlightNumber` formats
 * and what the lookup is asked about, so a bus typed as `FlixBus 42`
 * would show `FLI XBUS42` — and a bus has no flight number anyway. It
 * is cleared only when the mode **leaves** the flight, which is a
 * narrower rule than "is not a flight": `train` to `bus` keeps a
 * hand-typed value, and a car that becomes a flight keeps the empty
 * field it had rather than inventing a number nobody typed.
 *
 * Nothing else moves, because everything else is the leg's rather than
 * the mode's — including `crossesMidnight`, which a lookup states from
 * the record's real dates: a fact about the leg's two ends does not
 * become false because the member changed how they are travelling.
 */
export function switchLegMode(leg: TravelLeg, mode: TransportMode): TravelLeg {
  if (leg.transportMode === mode) return leg;
  const leavesFlight = leg.transportMode === "flight";
  return {
    ...leg,
    transportMode: mode,
    flightNumber: leavesFlight ? "" : leg.flightNumber,
  };
}
