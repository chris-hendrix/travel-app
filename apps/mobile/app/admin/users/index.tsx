import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Segmented } from "@/components/ui/Segmented";
import { AdminGate } from "@/components/admin/AdminGate";
import { useDebouncedValue } from "@/lib/debounce";
import { joinedDay } from "@/lib/dateRange";
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
 * The user list, as a page rather than a dialog: it is a surface you
 * browse (search, four filters, Load more), and browsing is what this
 * app renders as a page (`/trips`), while the thing you open to act on
 * is a dialog (`/trips/members`) — which is the record.
 *
 * `AdminGate` around the child that owns its reads — the reads must
 * live in a child of the gate, never in the component that branches on
 * `useAuth()`, because hooks run on every render including the blocked
 * one and `useInfiniteQuery` fires on mount.
 */
export default function AdminUsersScreen() {
  return (
    <Screen lead>
      <Text className="font-display text-3xl uppercase leading-tight text-ink">
        User management
      </Text>
      <AdminGate label="Loading users">
        <AdminUsersList />
      </AdminGate>
    </Screen>
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
      {/* The count is what the current search and filter matched —
          that is what the API returns — not the global total. */}
      <Text className="font-body text-sm text-ink">
        {plural(count, "user")}
      </Text>
      <AdminUsersControls
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
      />
      {/* Not a FlatList: twenty two-line rows is a screenful or three,
          and this app's other lists are plain stacks inside `Screen`
          (`app/trips/index.tsx`, the roster) — the page already scrolls
          as one surface. */}
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
      className="min-h-11 border-t border-gravel py-2"
    >
      {/* The badges sit inline on the name's line and wrap under a
          long name; only an exception wears one (banned or admin). */}
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="font-body-bold text-base text-ink">{name}</Text>
        {user.status === "banned" ? (
          <Badge label="Banned" variant="live" size="sm" />
        ) : null}
        {user.role === "admin" ? (
          <Badge label="Admin" variant="category" size="sm" />
        ) : null}
      </View>
      {/* Joined day plus trip count: the two facts a support reader
          needs. Inline meta laid out as a flex-row with gap-3, the
          way the roster lays out its name plus handle chips. */}
      <View className="flex-row gap-3">
        <Text className="font-body text-sm text-ink">
          {joinedDay(user.createdAt)}
        </Text>
        <Text className="font-body text-sm text-ink">
          {plural(user.tripCount, "trip")}
        </Text>
      </View>
    </Pressable>
  );
}
