import { Text, TextInput, View } from "react-native";

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string;
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
      />
      {error ? (
        <Text className="font-body text-sm text-ink">{error}</Text>
      ) : null}
    </View>
  );
}
