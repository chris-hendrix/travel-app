import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { TextField } from "@/components/ui/TextField";

/**
 * Single-select dropdown with autocomplete. Inline expanding list —
 * never a nested dialog. Selecting an option commits the value and
 * collapses the list.
 */
export function Dropdown({
  label,
  options,
  value,
  onChange,
  placeholder = "Type to filter…",
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);

  const matches = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase()),
  );

  function select(option: string) {
    setQuery(option);
    setOpen(false);
    onChange(option);
  }

  return (
    <View className="gap-0">
      <TextField
        label={label}
        value={query}
        placeholder={placeholder}
        onChangeText={(v) => {
          setQuery(v);
          setOpen(true);
        }}
      />
      {open ? (
        <View className="border border-t-0 border-ink bg-paper">
          {matches.length === 0 ? (
            <Text className="font-body p-3 text-base text-ink">
              No matches
            </Text>
          ) : (
            matches.map((option) => (
              <Pressable
                key={option}
                onPress={() => select(option)}
                className="border-b border-gravel p-3"
              >
                <Text className="font-body text-base text-ink">{option}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
