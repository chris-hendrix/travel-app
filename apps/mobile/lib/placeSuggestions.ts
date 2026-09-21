/**
 * Static place suggestions for the pickers, until live Places
 * autocomplete lands (the `TODO(BE)` at each call site names the
 * missing `photos[].name` field mask).
 *
 * Moved here from the mocks folder in Phase 8: these lists are live
 * app behavior, not lab fixtures — the trip and event forms render
 * them as `Dropdown` options, and the trip/itinerary E2E specs pick
 * the "Mallorca, Spain" suggestion from this list (CI carries no
 * Places key). The lab keeps its own fixtures under mocks/.
 */
export const PLACES = [
  "Mallorca, Spain",
  "Lisbon, Portugal",
  "Chamonix, France",
  "Big Sur, California",
  "Kyoto, Japan",
  "Reykjavík, Iceland",
  "Berlin, Germany",
  "Loire Valley, France",
  "Marrakesh, Morocco",
  "Tulum, Mexico",
];

/**
 * The same autocomplete, asked about a single event rather than a whole
 * trip: the kind of places an itinerary holds, so a hand-made event
 * reads like the rest of the day around it.
 */
export const EVENT_PLACES = [
  "Mercat Central",
  "Ridge trailhead",
  "Cala Petita",
  "Old town",
  "Bodega Sole",
  "South beach",
  "Trattoria Nuova",
  "Bar Centrale",
  "Bath house",
  "Corner market",
  "Station",
  "Museo Chico",
];
