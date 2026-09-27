/**
 * Pure dropdown-row helpers, framework-free so specs can import them.
 *
 * `Dropdown` and `SuggestionList` are React Native components; the rules
 * they share — what a row is, when the local substring filter applies,
 * what labels a row — live here instead, where vitest can reach them.
 */

/** One row of a suggestion list: what is committed, and what is read. */
export type PickerEntry = {
  value: string;
  label: string;
  /** What the field shows after this row is picked. Defaults to label. */
  fieldText?: string | undefined;
  /** The second line. Absent means the row reads as one line. */
  secondary?: string | undefined;
  /** Status rows (loading, failure) read but never commit. */
  disabled?: boolean | undefined;
};

/** The attribution footer the place pickers carry, never localized. */
export const GOOGLE_MAPS_ATTRIBUTION = "Google Maps";

/**
 * The local substring filter. Live pickers skip it: Google already
 * ranked its rows, and filtering them by `includes` hides live answers
 * whose label does not contain the raw keystrokes.
 */
export function filterPickerEntries(
  entries: PickerEntry[],
  query: string,
  live: boolean,
): PickerEntry[] {
  if (live) return entries;
  const needle = query.toLowerCase();
  return entries.filter((entry) =>
    entry.label.toLowerCase().includes(needle),
  );
}

/**
 * What a screen reader announces for a row: the primary. The secondary
 * is visible detail, not identity.
 */
export function entryAccessibilityLabel(entry: PickerEntry): string {
  return entry.label;
}
