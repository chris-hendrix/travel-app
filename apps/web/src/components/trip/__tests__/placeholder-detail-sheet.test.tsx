import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceholderDetailSheet } from "../placeholder-detail-sheet";
import type { MemberWithProfile } from "@journiful/shared/types";

// The Sheet content must stay position:fixed (Radix overlays it on top of the
// screen). The `linen-texture` utility sets `position: relative`, which — being
// an unlayered rule — overrides Tailwind's layered `fixed` utility and pushes
// the sheet into normal document flow (off-screen). We stub dialog-back so the
// test doesn't touch window.history.
vi.mock("@/hooks/use-dialog-back", () => ({
  useDialogBack: () => {},
}));

const mockUpdatePlaceholder = {
  mutateAsync: vi.fn().mockResolvedValue({ id: "ph-1" }),
  isPending: false,
};
const mockAttachPlaceholder = {
  mutateAsync: vi.fn().mockResolvedValue({ id: "ph-1" }),
  isPending: false,
};
const mockInvitePlaceholder = {
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
};
const mockDeletePlaceholder = {
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
};

vi.mock("@/hooks/use-placeholders", () => ({
  useUpdatePlaceholder: () => mockUpdatePlaceholder,
  useAttachPlaceholder: () => mockAttachPlaceholder,
  useInvitePlaceholder: () => mockInvitePlaceholder,
  useDeletePlaceholder: () => mockDeletePlaceholder,
  getPlaceholderErrorMessage: () => null,
}));

vi.mock("@/hooks/use-mutuals", () => ({
  useMutualSuggestions: () => ({ data: { mutuals: [] }, isPending: false }),
}));

vi.mock("@/lib/api", () => ({
  getUploadUrl: (url: string | null) => url ?? undefined,
}));

vi.mock("@/lib/format", () => ({
  getInitials: (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2),
}));

const placeholder: MemberWithProfile = {
  id: "ph-1",
  userId: null,
  displayName: "Tom",
  profilePhotoUrl: null,
  handles: null,
  isPlaceholder: true,
  status: "no_response",
  isOrganizer: false,
  createdAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlaceholderDetailSheet", () => {
  it("renders the name input prefilled with the member name", () => {
    render(
      <PlaceholderDetailSheet
        member={placeholder}
        open={true}
        onOpenChange={() => {}}
        tripId="trip-123"
      />,
    );

    const nameInput = screen.getByTestId("placeholder-name-input");
    expect((nameInput as HTMLInputElement).value).toBe("Tom");
  });

  it("saves a changed name on blur via useUpdatePlaceholder", async () => {
    const user = userEvent.setup();
    render(
      <PlaceholderDetailSheet
        member={placeholder}
        open={true}
        onOpenChange={() => {}}
        tripId="trip-123"
      />,
    );

    const nameInput = screen.getByTestId("placeholder-name-input");
    await user.clear(nameInput);
    await user.type(nameInput, "Tommy");
    await user.tab();

    expect(mockUpdatePlaceholder.mutateAsync).toHaveBeenCalledWith({
      memberId: "ph-1",
      data: { name: "Tommy" },
    });
  });

  // Regression guard for the "edit name/phone does nothing" bug: the sheet
  // content was given `linen-texture`, whose `position: relative` overrides the
  // Radix sheet's `fixed` positioning, so the sheet rendered off-screen.
  it("keeps the sheet content fixed-positioned (no linen-texture override)", () => {
    render(
      <PlaceholderDetailSheet
        member={placeholder}
        open={true}
        onOpenChange={() => {}}
        tripId="trip-123"
      />,
    );

    const sheet = screen.getByTestId("placeholder-detail-sheet");
    expect(sheet.className).toContain("fixed");
    expect(sheet.className).not.toContain("linen-texture");
  });
});
