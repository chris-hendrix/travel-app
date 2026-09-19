import { Pressable, Text, View } from "react-native";

/**
 * One choice out of a few, all of them visible at once.
 *
 * Bordered cells in a row rather than a bare chip: the thing this was
 * built for starts with nothing chosen, and a control that can be empty
 * has to read as a control before it reads as a choice.
 *
 * The chosen cell takes the watermelon fill — the system's colour for a
 * filled, attended thing, shared with the countdown chip and the accent
 * button. Ink would be quieter and would disappear next to the chrome
 * bar it sits under.
 *
 * `value` is nullable on purpose — "nothing chosen yet" is a real state,
 * not an error.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row">
      {options.map((option, index) => {
        const chosen = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            aria-pressed={chosen}
            className={`flex-1 items-center border border-ink py-3 ${
              index > 0 ? "border-l-0" : ""
            } ${chosen ? "bg-watermelon" : ""}`}
          >
            <Text
              className={`text-sm ${
                chosen ? "font-body-bold text-ink" : "font-body text-ink"
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
