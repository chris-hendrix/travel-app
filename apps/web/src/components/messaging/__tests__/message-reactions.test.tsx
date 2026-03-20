import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageReactions } from "../message-reactions";
import type { ReactionSummary } from "@journiful/shared/types";

// Mock hooks
const mockMutate = vi.fn();
vi.mock("@/hooks/use-messages", () => ({
  useToggleReaction: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  getToggleReactionErrorMessage: (error: Error | null) =>
    error?.message ?? null,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("MessageReactions", () => {
  beforeEach(() => {
    mockMutate.mockClear();
  });

  const baseReactions: ReactionSummary[] = [
    {
      emoji: "heart",
      count: 3,
      reacted: true,
      reactorNames: ["You", "Alice", "Bob"],
    },
    { emoji: "thumbs_up", count: 1, reacted: false, reactorNames: ["Alice"] },
  ];

  it("renders only the add-reaction button when no reactions exist", () => {
    render(
      <MessageReactions messageId="msg-1" tripId="trip-1" reactions={[]} />,
    );

    const buttons = screen.getAllByRole("button");
    // Only the add-reaction picker button
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Add reaction");
  });

  it("renders pills for reactions with count > 0 plus the add-reaction button", () => {
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
      />,
    );

    const buttons = screen.getAllByRole("button");
    // 2 reaction pills + 1 add-reaction button
    expect(buttons.length).toBe(3);
  });

  it("renders wrapper with role='group' and aria-label='Reactions'", () => {
    render(
      <MessageReactions messageId="msg-1" tripId="trip-1" reactions={[]} />,
    );

    const group = screen.getByRole("group", { name: "Reactions" });
    expect(group).toBeDefined();
  });

  it("applies reaction pop animation to active reactions", () => {
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
      />,
    );

    const heartButton = screen.getByLabelText("React with heart");
    expect(heartButton.className).toContain(
      "motion-safe:animate-[reactionPop_200ms_ease-in-out]",
    );
  });

  it("does not apply reaction pop animation to inactive reactions", () => {
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
      />,
    );

    const thumbsUpButton = screen.getByLabelText("React with thumbs_up");
    expect(thumbsUpButton.className).not.toContain("reactionPop");
  });

  it("shows count for reactions with count > 0", () => {
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
      />,
    );

    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
  });

  it("highlights active reactions", () => {
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
      />,
    );

    const heartButton = screen.getByLabelText("React with heart");
    expect(heartButton.getAttribute("aria-pressed")).toBe("true");
    expect(heartButton.className).toContain("bg-primary/10");
  });

  it("does not highlight inactive reactions", () => {
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
      />,
    );

    const thumbsUpButton = screen.getByLabelText("React with thumbs_up");
    expect(thumbsUpButton.getAttribute("aria-pressed")).toBe("false");
    expect(thumbsUpButton.className).toContain("bg-muted/50");
  });

  it("calls toggleReaction.mutate when a reaction pill is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
      />,
    );

    const heartButton = screen.getByLabelText("React with heart");
    await user.click(heartButton);

    expect(mockMutate).toHaveBeenCalledWith(
      { messageId: "msg-1", data: { emoji: "heart" } },
      expect.any(Object),
    );
  });

  it("does not call mutate when disabled and pill is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
        disabled
      />,
    );

    const heartButton = screen.getByLabelText("React with heart");
    await user.click(heartButton);

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("applies disabled styling to reaction pills when disabled", () => {
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={baseReactions}
        disabled
      />,
    );

    const heartButton = screen.getByLabelText("React with heart");
    expect(heartButton.className).toContain("opacity-50");
    expect(heartButton.className).toContain("cursor-not-allowed");
  });

  it("hides reactions with count of 0", () => {
    const withZero: ReactionSummary[] = [
      { emoji: "heart", count: 0, reacted: false, reactorNames: [] },
      {
        emoji: "thumbs_up",
        count: 2,
        reacted: false,
        reactorNames: ["Alice", "Bob"],
      },
    ];
    render(
      <MessageReactions
        messageId="msg-1"
        tripId="trip-1"
        reactions={withZero}
      />,
    );

    expect(screen.queryByLabelText("React with heart")).toBeNull();
    expect(screen.getByLabelText("React with thumbs_up")).toBeDefined();
  });
});
