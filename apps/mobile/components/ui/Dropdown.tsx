import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { TextField } from "@/components/ui/TextField";

/**
 * Single-select dropdown with autocomplete. The suggestion list overlays
 * what follows it rather than pushing it down — a field that reflows the
 * form as you type is unusable. Inline, never a nested dialog.
 */
export function Dropdown({
  label,
  options,
  value,
  onChange,
  placeholder = "Type to filter…",
  error,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | undefined;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [fieldHeight, setFieldHeight] = useState(0);

  const matches = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase()),
  );

  function select(option: string) {
    setQuery(option);
    setOpen(false);
    onChange(option);
  }

  return (
    <View className="relative z-40">
      <View
        onLayout={(event) =>
          setFieldHeight(event.nativeEvent.layout.height)
        }
      >
        <TextField
          label={label}
          value={query}
          placeholder={placeholder}
          error={error}
          onChangeText={(v) => {
            setQuery(v);
            setOpen(true);
          }}
        />
      </View>

      {open && fieldHeight > 0 ? (
        <View
          className="absolute left-0 right-0 z-50 border border-ink bg-paper"
          style={{ top: fieldHeight }}
        >
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
