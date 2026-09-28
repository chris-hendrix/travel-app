import { Text } from "react-native";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { AdminGate } from "@/components/admin/AdminGate";

/**
 * The user record. STUB: Phase 7 fills in the read, the write, and the
 * actions. The shape is already final — `FullscreenDialog title="User"`
 * with `dismissHref="/admin/users"`, so a deep link with nothing to
 * pop back to lands on the list.
 */
export default function AdminUserDetailScreen() {
  return (
    <FullscreenDialog title="User" dismissHref="/admin/users">
      <AdminGate label="Loading user">
        <AdminUserRecord />
      </AdminGate>
    </FullscreenDialog>
  );
}

function AdminUserRecord() {
  return <Text className="font-body text-base text-ink">Coming soon.</Text>;
}
