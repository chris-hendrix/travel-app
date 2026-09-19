import { Text } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";

export default function Profile() {
  return (
    <FullscreenDialog
      title="Profile"
      primaryTitle="Save changes"
      onPrimary={() => {}}
    >
      <Text className="font-body text-base text-ink">
        Display name, photo, and phone-sharing consent live here.
      </Text>
    </FullscreenDialog>
  );
}
