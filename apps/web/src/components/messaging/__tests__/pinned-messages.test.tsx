import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PinnedMessages } from "../pinned-messages";
import type { MessageWithReplies } from "@journiful/shared/types";

describe("PinnedMessages", () => {
  const makeMessage = (
    overrides: Partial<MessageWithReplies> = {},
  ): MessageWithReplies => ({
    id: "msg-1",
    tripId: "trip-1",
    authorId: "user-1",
    parentId: null,
    content: "Pinned message content",
    isPinned: true,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-02-15T12:00:00Z",
    updatedAt: "2026-02-15T12:00:00Z",
    author: {
      id: "user-1",
      displayName: "John Doe",
      profilePhotoUrl: null,
    },
    reactions: [],
    replies: [],
    replyCount: 0,
    ...overrides,
  });

  it("renders nothing when no messages are pinned", () => {
    const { container } = render(<PinnedMessages messages={[]} />);

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when pinned messages are deleted", () => {
    const messages = [
      makeMessage({
        isPinned: true,
        deletedAt: "2026-02-15T12:00:00Z",
      }),
    ];
    const { container } = render(<PinnedMessages messages={messages} />);

    expect(container.innerHTML).toBe("");
  });

  it("shows pinned header with count", () => {
    const messages = [makeMessage(), makeMessage({ id: "msg-2" })];
    render(<PinnedMessages messages={messages} />);

    expect(screen.getByText("Pinned (2)")).toBeDefined();
  });

  it("does not show pinned content by default (collapsed)", () => {
    const messages = [makeMessage()];
    render(<PinnedMessages messages={messages} />);

    expect(screen.queryByText("Pinned message content")).toBeNull();
  });

  it("shows pinned content when expanded", async () => {
    const user = userEvent.setup();
    const messages = [makeMessage()];
    render(<PinnedMessages messages={messages} />);

    await user.click(screen.getByText("Pinned (1)"));

    expect(screen.getByText("Pinned message content")).toBeDefined();
    expect(screen.getByText("John Doe")).toBeDefined();
  });

  it("collapses when clicked again", async () => {
    const user = userEvent.setup();
    const messages = [makeMessage()];
    render(<PinnedMessages messages={messages} />);

    // Expand
    await user.click(screen.getByText("Pinned (1)"));
    expect(screen.getByText("Pinned message content")).toBeDefined();

    // Collapse
    await user.click(screen.getByText("Pinned (1)"));
    expect(screen.queryByText("Pinned message content")).toBeNull();
  });

  it("has aria-label 'Expand pinned messages' when collapsed", () => {
    const messages = [makeMessage()];
    render(<PinnedMessages messages={messages} />);

    const button = screen.getByRole("button", {
      name: "Expand pinned messages",
    });
    expect(button).toBeDefined();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("has aria-label 'Collapse pinned messages' when expanded", async () => {
    const user = userEvent.setup();
    const messages = [makeMessage()];
    render(<PinnedMessages messages={messages} />);

    await user.click(
      screen.getByRole("button", { name: "Expand pinned messages" }),
    );

    const button = screen.getByRole("button", {
      name: "Collapse pinned messages",
    });
    expect(button).toBeDefined();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("only shows pinned non-deleted messages", () => {
    const messages = [
      makeMessage({ id: "msg-1", isPinned: true }),
      makeMessage({ id: "msg-2", isPinned: false }),
      makeMessage({
        id: "msg-3",
        isPinned: true,
        deletedAt: "2026-02-15T12:00:00Z",
      }),
    ];
    render(<PinnedMessages messages={messages} />);

    expect(screen.getByText("Pinned (1)")).toBeDefined();
  });
});
