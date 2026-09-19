import { Text } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";

export default function Notifications() {
  return (
    <FullscreenDialog
      title="Notifications"
      primaryTitle="Mark all read"
      onPrimary={() => {}}
    >
      <Text className="font-body text-base text-sand">
        No new notifications. Invites and updates land here.
      </Text>
    </FullscreenDialog>
  );
}
