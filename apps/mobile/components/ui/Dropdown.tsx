import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { TextField } from "@/components/ui/TextField";
import { SuggestionList } from "@/components/ui/SuggestionList";
import { MapsAttribution } from "@/components/ui/MapsAttribution";
import { FieldError } from "@/components/ui/FieldError";
import { INK } from "@/lib/theme";
import {
  displayTextForValue,
  filterPickerEntries,
  shouldOpenOnPress,
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
  openOnPress = false,
  searchable = true,
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
  /**
   * Entering the field opens its list. Opt-in, because it is only right
   * for a list that already holds the whole answer — every member, this
   * trip's own wheres. A live list has nothing to show until you type,
   * so the Places pickers simply do not pass this.
   */
  openOnPress?: boolean;
  /**
   * Whether the field can be typed in. `false` is the picker: a fixed
   * list is a value rather than a search, so the field shows the chosen
   * row and opens on press, and nothing can be typed that is not a row.
   *
   * That last part is the reason this exists. A menu whose text is not
   * committed — every list picker before this — can be typed into and
   * keep the words, so the field reads "Bob" while the form still holds
   * Alice, and the save goes to Alice. A roster is the case that matters:
   * there is nothing to search for in a list of the people on the trip.
   */
  searchable?: boolean;
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
  const selectedLabel = displayTextForValue(entries, value);

  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);

  // Typing is not interrupted: the value only moves on a choice, so this
  // re-runs when the choice lands and stays out of the way while a query
  // is being typed.
  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  const matches = searchable
    ? filterPickerEntries(entries, query, liveOptions)
    : entries;

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
      {searchable ? (
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
          onFocus={() => {
            // The whole answer is already here when the list is local, so
            // entering the field is the question. A live list waits for a
            // query, which is what its own keystrokes supply.
            if (openOnPress && shouldOpenOnPress(liveOptions)) setOpen(true);
          }}
        />
      ) : (
        <PickerField
          label={label}
          value={selectedLabel}
          placeholder={placeholder}
          error={error}
          open={open}
          onPress={() => setOpen((current) => !current)}
        />
      )}

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

/**
 * A menu's field when it cannot be typed in: the value, and a mark that
 * says it opens.
 *
 * `TimeField`'s closed row, to the point — a bordered box, what is
 * chosen, and the arrow that opens the options — because that is this
 * system's control for a value that opens a list, and this is one. The
 * label sits above it and the error under it exactly as a text field's
 * do, so a form does not change shape when a field becomes a picker.
 *
 * The arrow is the value-list mark rather than `DisclosureButton`'s
 * filled triangle: that one is for a list of verbs, and a roster is a
 * list of values.
 */
function PickerField({
  label,
  value,
  placeholder,
  error,
  open,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  error?: string | undefined;
  open: boolean;
  onPress: () => void;
}) {
  const Icon = open ? ArrowUp : ArrowDown;

  return (
    <View className="gap-1">
      <Text className="font-body-bold text-sm text-ink">{label}</Text>
      <Pressable
        role="button"
        aria-expanded={open}
        onPress={onPress}
        className="flex-row items-center justify-between border border-ink bg-paper p-4"
      >
        <Text
          className={`font-body text-base text-ink ${
            value ? "" : "opacity-60"
          }`}
        >
          {value || placeholder}
        </Text>
        <Icon color={INK} size={20} aria-hidden />
      </Pressable>
      <FieldError message={error} />
    </View>
  );
}
