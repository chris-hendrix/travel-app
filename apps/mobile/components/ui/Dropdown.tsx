import { useEffect, useState } from "react";
import { View } from "react-native";
import { TextField } from "@/components/ui/TextField";
import { SuggestionList } from "@/components/ui/SuggestionList";

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
export type DropdownOption = { value: string; label: string };

export function Dropdown({
  label,
  options,
  value,
  onChange,
  placeholder = "Type to filter…",
  error,
  freeText = false,
}: {
  label: string;
  options: Array<string | DropdownOption>;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | undefined;
  /** Commit whatever is typed, matched or not. */
  freeText?: boolean;
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

  const matches = entries.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );

  function select(option: DropdownOption) {
    setQuery(option.label);
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
          setOpen(true);
          if (freeText) onChange(v);
        }}
      />

      {open ? (
        <SuggestionList
          suggestions={matches}
          empty="No matches"
          onPick={(value) => {
            const option = entries.find((entry) => entry.value === value);
            if (option) select(option);
          }}
        />
      ) : null}
    </View>
  );
}
