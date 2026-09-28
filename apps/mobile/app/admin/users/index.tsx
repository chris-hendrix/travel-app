import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Segmented } from "@/components/ui/Segmented";
import { AdminGate } from "@/components/admin/AdminGate";
import { useDebouncedValue } from "@/lib/debounce";
import {
  FILTERS,
  emptyCopy,
  plural,
  type AdminFilter,
} from "@/lib/admin";
import {
  useAdminUsers,
  type AdminUserRow,
} from "@/lib/queries/admin";
import { toErrorCopy } from "@/lib/queries/errors";

/**
 * The user list. `AdminGate` around the child that owns its reads —
 * the reads must live in a child of the gate, never in the component
 * that branches on `useAuth()`, because hooks run on every render
 * including the blocked one and `useInfiniteQuery` fires on mount.
 */
export default function AdminUsersScreen() {
  return (
    <FullscreenDialog title="Users" dismissHref="/profile">
      <AdminGate label="Loading users">
        <AdminUsersList />
      </AdminGate>
    </FullscreenDialog>
  );
}

function AdminUsersList() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminFilter>("all");
  // The debounce takes the field's value, so the field stays immediate
  // and only the query waits.
  const settled = useDebouncedValue(search, 250);
  // The page is deliberately not state: the filters are part of the
  // query key, so a new search or filter starts its own accumulation
  // at page 1 and nothing has to be reset by hand.
  const query = useAdminUsers({ limit: 20, search: settled, filter });
  const rows = query.data?.pages.flatMap((page) => page.users) ?? [];
  const count = query.data?.pages[0]?.total ?? 0;

  if (query.isPending) {
    return <LoadingBlock label="Loading users" />;
  }
  if (query.isError) {
    return (
      <AdminUsersFailure
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <View className="gap-4">
        <AdminUsersControls
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
        />
        <Text className="font-body text-base text-ink">
          {emptyCopy({ search: settled, filter })}
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-4">
      <AdminUsersControls
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
      />
      {/* Not a FlatList: twenty two-line rows is a screenful or three,
          and this app's other lists are plain stacks inside `Screen`
          (`app/trips/index.tsx`, the roster) — the dialog already
          scrolls as one surface. */}
      <View>
        {rows.map((user) => (
          <AdminUserRowView
            key={user.id}
            user={user}
            onPress={() =>
              router.push(`/admin/users/detail?id=${user.id}`)
            }
          />
        ))}
      </View>
      <Text className="font-body text-sm text-ink">
        {plural(count, "user")}
      </Text>
      {query.hasNextPage ? (
        <Button
          title={query.isFetchingNextPage ? "Loading more" : "Load more"}
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}

function AdminUsersControls({
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filter: AdminFilter;
  onFilterChange: (value: AdminFilter) => void;
}) {
  return (
    <View className="gap-4">
      <TextField
        label="Search"
        value={search}
        onChangeText={onSearchChange}
        placeholder="Name, phone or ID"
      />
      <View className="flex-row">
        <Segmented
          options={[...FILTERS]}
          value={filter}
          onChange={onFilterChange}
          size="sm"
        />
      </View>
    </View>
  );
}

/**
 * Where the list request failed, in place of the rows. The
 * non-suspending precedent is `ProfileFailure` in `app/profile.tsx`:
 * offline renders `OfflineBlock` with its default copy, anything else
 * renders the screen's sentence. A 403 mid-session reads `You can't do
 * that here` with no retry — asking again cannot change the answer —
 * through the same `toErrorCopy` every other screen uses.
 */
function AdminUsersFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const copy = toErrorCopy(error);
  // `exactOptionalPropertyTypes` is on: only pass `onRetry` when the
  // copy offers a retry, never an explicit `undefined`.
  const retryProps = copy.retry ? { onRetry } : {};
  if (copy.offline) {
    return <OfflineBlock {...retryProps} />;
  }
  return (
    <InlineError
      message={copy.message ?? "Couldn't load users"}
      {...retryProps}
    />
  );
}

function AdminUserRowView({
  user,
  onPress,
}: {
  user: AdminUserRow;
  onPress: () => void;
}) {
  const name =
    user.displayName.trim() !== "" ? user.displayName : "No name";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      className="min-h-11 flex-row items-center justify-between gap-4 border-t border-gravel py-2"
    >
      <View className="flex-1">
        <Text className="font-body-bold text-base text-ink">{name}</Text>
        <Text className="font-body text-sm text-ink">
          {user.phoneNumber}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {user.status === "banned" ? (
          <Badge label="Banned" variant="live" size="sm" />
        ) : null}
        {user.role === "admin" ? (
          <Badge label="Admin" variant="category" size="sm" />
        ) : null}
      </View>
    </Pressable>
  );
}
