import { Platform, Text } from "react-native";
import { GOOGLE_MAPS_ATTRIBUTION } from "@/lib/dropdown";

/**
 * The `Google Maps` mark every place picker carries under its rows.
 *
 * Never localized. On the web export the footer also carries
 * `translate="no"` so browser translation cannot alter it; React
 * Native's `Text` has no such prop, so the attribute is set only on
 * the web branch — unconditionally it would be silently dropped on
 * native and mislead a reader into thinking it applies there.
 */
export function MapsAttribution() {
  const webOnly =
    Platform.OS === "web"
      ? ({ translate: "no" } as { translate: string })
      : null;
  return (
    <Text
      className="font-body p-3 text-xs text-ink/60"
      {...(webOnly ?? {})}
    >
      {GOOGLE_MAPS_ATTRIBUTION}
    </Text>
  );
}
