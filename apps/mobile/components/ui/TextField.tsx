import { Text, TextInput, View } from "react-native";

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline,
  numberOfLines,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** Field-level error. Explicitly nullable so strict callers can pass
   *  an optional lookup straight through. */
  error?: string | undefined;
  multiline?: boolean;
  numberOfLines?: number;
}) {
  return (
    <View className="gap-1">
      <Text className="font-body-bold text-sm text-ink">{label}</Text>
      <TextInput
        className="font-body border border-ink bg-paper p-3 text-base text-ink"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#707070"
        multiline={multiline}
        numberOfLines={numberOfLines}
        textAlignVertical={multiline ? "top" : undefined}
      />
      {error ? (
        <Text className="font-body text-sm text-ink">{error}</Text>
      ) : null}
    </View>
  );
}
