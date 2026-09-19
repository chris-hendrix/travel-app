import { Linking, Pressable } from "react-native";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

/**
 * A chip that leaves the app.
 *
 * The system's classification chip — the same ink pill an event's type
 * wears — at the small size, because these hang off a name in a list
 * rather than sitting in the content. It says where an account is and
 * not what it is called: the handle is the link's business, and a roster
 * is not the place to publish everyone's usernames.
 */
export function ChipLink({
  label,
  href,
  variant = "category",
}: {
  label: string;
  href: string;
  variant?: BadgeVariant;
}) {
  return (
    <Pressable
      onPress={() => {
        void Linking.openURL(href);
      }}
      aria-label={`Open ${label}`}
      className="cursor-pointer"
    >
      <Badge label={label} variant={variant} size="sm" />
    </Pressable>
  );
}
