import { Linking, Text, View } from "react-native";
import type { PlacePhotoCredit } from "@/lib/place-images";

/**
 * The place-photo credit line under a detail photo: `Photo by <name>`
 * linking to the author's profile, beside `View on Google Maps` opening
 * the photo's required source link. 12sp, quiet — it is owed, not read.
 *
 * Tiles render nothing (the policy's thumbnail exemption): every tile
 * taps through to a detail view that carries this line.
 */
export function PhotoCredit({
  credit,
  sourceUri,
}: {
  credit: PlacePhotoCredit | null | undefined;
  sourceUri: string | null | undefined;
}) {
  if (!credit && !sourceUri) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-1 pt-1">
      {credit ? (
        <Text className="font-body text-xs text-ink opacity-60">
          Photo by{" "}
          {credit.uri ? (
            <Text
              className="underline"
              onPress={() => void Linking.openURL(credit.uri!)}
            >
              {credit.name}
            </Text>
          ) : (
            credit.name
          )}
        </Text>
      ) : null}
      {credit && sourceUri ? (
        <Text className="font-body text-xs text-ink opacity-60">·</Text>
      ) : null}
      {sourceUri ? (
        <Text
          className="font-body text-xs text-ink opacity-60 underline"
          onPress={() => void Linking.openURL(sourceUri)}
        >
          View on Google Maps
        </Text>
      ) : null}
    </View>
  );
}
