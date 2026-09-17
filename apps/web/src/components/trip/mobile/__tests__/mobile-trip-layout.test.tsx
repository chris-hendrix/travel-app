import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Capture the `enabled` gate passed through DiscoverPanel → DiscoverView.
vi.mock("@/components/discover/discover-view", () => ({
  DiscoverView: function MockDiscoverView(props: {
    tripId: string;
    enabled?: boolean;
  }) {
    return (
      <div
        data-testid="discover-view"
        data-enabled={String(props.enabled)}
        data-trip-id={props.tripId}
      />
    );
  },
}));

// Render all slides mounted (like the real swiper) and expose slide-change
// buttons so tests can drive `activeIndex` through `onSlideChange`.
vi.mock("../mobile-trip-swiper", () => ({
  MobileTripSwiper: function MockSwiper({
    children,
    onSlideChange,
  }: {
    children: ReactNode;
    onSlideChange: (index: number) => void;
  }) {
    return (
      <div data-testid="mock-swiper">
        {children}
        <button data-testid="goto-info" onClick={() => onSlideChange(0)} />
        <button data-testid="goto-itinerary" onClick={() => onSlideChange(1)} />
        <button data-testid="goto-discover" onClick={() => onSlideChange(2)} />
        <button data-testid="goto-messages" onClick={() => onSlideChange(3)} />
        <button data-testid="goto-photos" onClick={() => onSlideChange(4)} />
      </div>
    );
  },
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("../trip-theme-provider", () => ({
  TripThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../animated-hero", () => ({
  AnimatedHero: () => null,
}));
vi.mock("../icon-strip", () => ({
  IconStrip: () => null,
}));
vi.mock("../panels/info-panel", () => ({
  InfoPanel: () => null,
}));
vi.mock("../panels/itinerary-panel", () => ({
  ItineraryPanel: () => null,
}));
vi.mock("../panels/messages-panel", () => ({
  MessagesPanel: () => null,
}));
vi.mock("../panels/photos-panel", () => ({
  PhotosPanel: () => null,
}));
vi.mock("../panels/settle-panel", () => ({
  SettlePanel: () => null,
}));
vi.mock("@/components/trip/members-list", () => ({
  MembersList: () => null,
}));
vi.mock("@/components/trip/member-profile-sheet", () => ({
  MemberProfileSheet: () => null,
}));
vi.mock("@/components/notifications/notification-preferences", () => ({
  NotificationPreferences: () => null,
}));
vi.mock("@/hooks/use-has-open-dialog", () => ({
  useHasOpenDialog: () => false,
}));
vi.mock("@/hooks/invitation-queries", () => ({
  membersQueryOptions: (tripId: string) => ({
    queryKey: ["members", tripId],
    queryFn: async () => [],
  }),
}));
vi.mock("@/hooks/use-invitations", () => ({
  getRemoveMemberErrorMessage: () => "Failed to remove member",
}));

import { MobileTripLayout } from "../mobile-trip-layout";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderLayout() {
  const queryClient = makeQueryClient();
  const removeMember = { mutate: vi.fn(), isPending: false };
  render(
    <QueryClientProvider client={queryClient}>
      <MobileTripLayout
        trip={{ id: "trip-1", themeId: null, themeFont: null } as never}
        tripId="trip-1"
        isOrganizer={false}
        isLocked={false}
        activeEventCount={0}
        weather={undefined}
        weatherLoading={false}
        temperatureUnit="celsius"
        currentMember={undefined}
        user={null}
        removeMember={removeMember}
        handleUpdateRole={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function discoverEnabled(): string | null {
  return screen.getByTestId("discover-view").getAttribute("data-enabled");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("MobileTripLayout discover enabled gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes enabled=false to DiscoverPanel at the info slide (activeIndex 0)", () => {
    renderLayout();
    // |0 - 2| = 2 > 1 → gated off, no /discover fetch
    expect(discoverEnabled()).toBe("false");
  });

  it("passes enabled=true at the Discover slide (activeIndex 2)", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByTestId("goto-discover"));
    expect(discoverEnabled()).toBe("true");
  });

  it("passes enabled=true at adjacent slides (itinerary 1, messages 3) for prewarm", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByTestId("goto-itinerary"));
    expect(discoverEnabled()).toBe("true");
    await user.click(screen.getByTestId("goto-messages"));
    expect(discoverEnabled()).toBe("true");
  });

  it("passes enabled=false at far slides (photos 4) and keeps the slide mounted", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByTestId("goto-discover"));
    expect(discoverEnabled()).toBe("true");
    await user.click(screen.getByTestId("goto-photos"));
    // |4 - 2| = 2 > 1 → gated off; slide stays mounted so scroll/query state survives
    expect(discoverEnabled()).toBe("false");
    expect(screen.getByTestId("discover-view")).toBeDefined();
  });
});
