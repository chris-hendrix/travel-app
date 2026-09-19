/**
 * Stand-in for Google Places autocomplete. The real field will query
 * Places and let a free-text value through; this list keeps the shape
 * of that interaction — type, filter, commit one suggestion.
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
 * trip: the kind of places an itinerary holds, and the ones the mock
 * itineraries already use, so a hand-made event reads like the rest of
 * the day around it.
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
