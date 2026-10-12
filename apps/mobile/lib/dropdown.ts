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

/**
 * What the field shows for the current value: the matched row's own
 * reading, preferring `fieldText` — the typed row's label carries
 * quotes marking "your words" in the list, which would read as stray
 * punctuation (and nest once per keystroke in a freeText dropdown,
 * where every keystroke commits) once echoed back into the field.
 * Falls back to the label, then the raw value, then empty.
 */
export function displayTextForValue(
  entries: PickerEntry[],
  value: string | null,
): string {
  const selected = entries.find((option) => option.value === value);
  return selected?.fieldText ?? selected?.label ?? value ?? "";
}

/**
 * Whether entering the field should open its list.
 *
 * A plain option list — every member, this trip's own wheres — is worth
 * showing the moment the field is entered: the answer is already here,
 * and pressing the field is the question. A live list is not: Places
 * fetches on a query, so an empty one has no rows to show and focusing
 * the field must leave it shut.
 *
 * The flag alone is the whole guard, deliberately. What has been typed
 * is a thing the component knows; why it is here is a thing the caller
 * knows, and the caller is the one that knows which kind of list it
 * handed over.
 */
export function shouldOpenOnPress(liveOptions: boolean): boolean {
  return !liveOptions;
}
