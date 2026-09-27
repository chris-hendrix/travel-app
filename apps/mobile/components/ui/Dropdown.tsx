import { useEffect, useState } from "react";
import { View } from "react-native";
import { TextField } from "@/components/ui/TextField";
import { SuggestionList } from "@/components/ui/SuggestionList";
import { MapsAttribution } from "@/components/ui/MapsAttribution";
import {
  filterPickerEntries,
  type PickerEntry,
} from "@/lib/dropdown";

/**
 * Single-select dropdown with autocomplete. The suggestion list takes
 * its place in the flow, so the form moves down as you type rather than
 * being covered. Inline, never a nested dialog.
 *
 * An option is a plain string when its value reads well — a place name —
 * and a { value, label } pair when it does not, which is how a day shows
 * "Today · Fri Sep 19" while still committing an ISO date.
 *
 * With `freeText`, typing is itself an answer: the field is a suggestion
 * machine, not a menu, which is how a place gets entered when Places has
 * never heard of it.
 */
export type DropdownOption = PickerEntry;

export function Dropdown({
  label,
  options,
  value,
  onChange,
  placeholder = "Type to filter…",
  error,
  freeText = false,
  onSearchText,
  liveOptions = false,
  attribution = false,
}: {
  label: string;
  options: Array<string | DropdownOption>;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | undefined;
  /** Commit whatever is typed, matched or not. */
  freeText?: boolean;
  /** Every keystroke, for callers fetching live suggestions. Never commits. */
  onSearchText?: ((text: string) => void) | undefined;
  /**
   * The caller supplies live rows (already ranked, typed row included):
   * skip the local `includes` filter, which would hide live answers
   * whose label does not contain the raw keystrokes.
   */
  liveOptions?: boolean;
  /** Render the Google Maps mark under the rows. Place pickers only. */
  attribution?: boolean;
}) {
  const entries = options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : option,
  );

  // What the field shows for the current value: the chosen option's
  // label, never its value. A caller handing over { value: id, label:
  // name } is saying the name is what a person reads, and echoing the
  // id back at them is how a field ends up showing a database key.
  const selectedLabel =
    entries.find((option) => option.value === value)?.label ?? value ?? "";

  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);

  // Typing is not interrupted: the value only moves on a choice, so this
  // re-runs when the choice lands and stays out of the way while a query
  // is being typed.
  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  const matches = filterPickerEntries(entries, query, liveOptions);

  function select(option: DropdownOption) {
    // The field echoes the picked row's own reading — except the typed
    // row, whose quotes mark "your words" in the list but would read
    // as stray punctuation once committed.
    setQuery(option.fieldText ?? option.label);
    setOpen(false);
    onChange(option.value);
  }

  return (
    <View>
      <TextField
        label={label}
        value={query}
        placeholder={placeholder}
        error={error}
        onChangeText={(v) => {
          setQuery(v);
          // A live list with an emptied field closes: there is no query
          // to answer, and the typed row needs at least one character.
          setOpen(liveOptions ? v.trim() !== "" : true);
          onSearchText?.(v);
          if (freeText) onChange(v);
        }}
      />

      {open ? (
        <SuggestionList
          suggestions={matches}
          empty="No matches"
          onPick={(value) => {
            const option = entries.find((entry) => entry.value === value);
            if (option && !option.disabled) select(option);
          }}
          footer={attribution ? <MapsAttribution /> : undefined}
        />
      ) : null}
    </View>
  );
}
