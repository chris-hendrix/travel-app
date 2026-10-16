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
 * The typed text as a row, on a local list that commits what you type.
 *
 * Applied **after** the filter, deliberately: the row is built from the
 * trimmed query rather than filtered by it, so a trailing space — a
 * needle no label contains — cannot take the row away. An empty query
 * offers nothing; there is nothing to offer, and the field's own value
 * already is the text. A query a row already answers is not offered
 * twice, because this list is our own strings and an exact match is the
 * common case.
 *
 * The row is the twin of the Places pickers' typed row
 * (`placePickerRows`, `lib/queries/places.ts`): its label quotes the
 * text so the list reads it as your words, and its `fieldText` is the
 * raw text, so the quotes never reach the field once it is committed.
 * The two must agree.
 */
export function withTypedRow(
  entries: PickerEntry[],
  query: string,
): PickerEntry[] {
  const text = query.trim();
  if (text === "") return entries;
  const answered = entries.some(
    (entry) => entry.label.trim().toLowerCase() === text.toLowerCase(),
  );
  if (answered) return entries;
  return [
    {
      value: text,
      label: `"${text}"`,
      secondary: "Use what you typed",
      fieldText: text,
    },
    ...entries,
  ];
}

/**
 * What a pressed row commits: the row from the list that was **drawn**,
 * falling back to the whole option set.
 *
 * The list renders its own rows — filtered, and on a local free-text
 * field led by the typed row — while `entries` is every option the
 * caller handed over. Resolving a press against `entries` alone leaves a
 * row that exists only in the drawn list inert: it draws, and pressing
 * it does nothing, which is exactly the typed row's fate because it is
 * in no `entries` at all.
 */
export function resolvePickedEntry(
  drawn: readonly PickerEntry[],
  entries: readonly PickerEntry[],
  value: string,
): PickerEntry | undefined {
  return (
    drawn.find((entry) => entry.value === value) ??
    entries.find((entry) => entry.value === value)
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
