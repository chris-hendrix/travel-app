import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageCard } from "../message-card";
import type { MessageWithReplies } from "@journiful/shared/types";

// Mock hooks
const mockEditMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockPinMutate = vi.fn();
const mockToggleReactionMutate = vi.fn();

vi.mock("@/hooks/use-messages", () => ({
  useEditMessage: () => ({
    mutate: mockEditMutate,
    isPending: false,
  }),
  useDeleteMessage: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
  usePinMessage: () => ({
    mutate: mockPinMutate,
    isPending: false,
  }),
  useToggleReaction: () => ({
    mutate: mockToggleReactionMutate,
    isPending: false,
  }),
  useCreateMessage: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  getEditMessageErrorMessage: (error: Error | null) => error?.message ?? null,
  getDeleteMessageErrorMessage: (error: Error | null) => error?.message ?? null,
  getPinMessageErrorMessage: (error: Error | null) => error?.message ?? null,
  getToggleReactionErrorMessage: (error: Error | null) =>
    error?.message ?? null,
  getCreateMessageErrorMessage: (error: Error | null) => error?.message ?? null,
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      displayName: "John Doe",
      profilePhotoUrl: null,
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("MessageCard", () => {
  beforeEach(() => {
    mockEditMutate.mockClear();
    mockDeleteMutate.mockClear();
    mockPinMutate.mockClear();
    mockToggleReactionMutate.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T12:05:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseMessage: MessageWithReplies = {
    id: "msg-1",
    tripId: "trip-1",
    authorId: "user-1",
    parentId: null,
    content: "Hello everyone!",
    isPinned: false,
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
  };

  describe("Rendering", () => {
    it("renders as an article element with aria-label", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      const article = screen.getByRole("article", {
        name: "Message from John Doe",
      });
      expect(article).toBeDefined();
    });

    it("applies message entry animation class", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      const article = screen.getByRole("article");
      expect(article.className).toContain(
        "motion-safe:animate-[messageIn_300ms_ease-out]",
      );
    });

    it("applies responsive padding", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      const article = screen.getByRole("article");
      expect(article.className).toContain("p-3");
      expect(article.className).toContain("sm:p-4");
    });

    it("renders author name and content", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(screen.getByText("John Doe")).toBeDefined();
      expect(screen.getByText("Hello everyone!")).toBeDefined();
    });

    it("renders relative time", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(screen.getByText("5m ago")).toBeDefined();
    });

    it("shows edited indicator when editedAt is set", () => {
      const editedMessage = {
        ...baseMessage,
        editedAt: "2026-02-15T12:03:00Z",
      };
      render(
        <MessageCard
          message={editedMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(screen.getByText("(edited)")).toBeDefined();
    });

    it("does not show edited indicator when editedAt is null", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(screen.queryByText("(edited)")).toBeNull();
    });

    it("shows pin indicator when message is pinned", () => {
      const pinnedMessage = { ...baseMessage, isPinned: true };
      const { container } = render(
        <MessageCard
          message={pinnedMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      // Pin icon should be present (rendered as svg with text-primary class)
      const pinIcon = container.querySelector("svg.text-primary");
      expect(pinIcon).not.toBeNull();
    });
  });

  describe("Deleted messages", () => {
    it("shows deleted placeholder for deleted messages", () => {
      const deletedMessage = {
        ...baseMessage,
        content: "",
        deletedAt: "2026-02-15T12:04:00Z",
      };
      render(
        <MessageCard
          message={deletedMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(screen.getByText("This message was deleted")).toBeDefined();
      expect(screen.queryByText("Hello everyone!")).toBeNull();
    });

    it("renders deleted message as article with aria-label 'Deleted message'", () => {
      const deletedMessage = {
        ...baseMessage,
        content: "",
        deletedAt: "2026-02-15T12:04:00Z",
      };
      render(
        <MessageCard
          message={deletedMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      const article = screen.getByRole("article", {
        name: "Deleted message",
      });
      expect(article).toBeDefined();
    });

    it("does not show actions menu for deleted messages", () => {
      const deletedMessage = {
        ...baseMessage,
        content: "",
        deletedAt: "2026-02-15T12:04:00Z",
      };
      render(
        <MessageCard
          message={deletedMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(
        screen.queryByLabelText("Actions for message by John Doe"),
      ).toBeNull();
    });
  });

  describe("Actions menu", () => {
    it("shows actions menu for own messages", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(
        screen.getByLabelText("Actions for message by John Doe"),
      ).toBeDefined();
    });

    it("does not show actions menu for other users' messages (non-organizer)", () => {
      const otherMessage = {
        ...baseMessage,
        authorId: "user-2",
        author: {
          id: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
        },
      };
      render(
        <MessageCard
          message={otherMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(
        screen.queryByLabelText("Actions for message by Jane Smith"),
      ).toBeNull();
    });

    it("shows actions menu for other users' messages when organizer", () => {
      const otherMessage = {
        ...baseMessage,
        authorId: "user-2",
        author: {
          id: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
        },
      };
      render(
        <MessageCard
          message={otherMessage}
          tripId="trip-1"
          isOrganizer={true}
        />,
      );

      expect(
        screen.getByLabelText("Actions for message by Jane Smith"),
      ).toBeDefined();
    });

    it("does not show actions menu when disabled", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
          disabled
        />,
      );

      expect(
        screen.queryByLabelText("Actions for message by John Doe"),
      ).toBeNull();
    });
  });

  describe("Avatar", () => {
    it("renders avatar with initials fallback", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      expect(screen.getByText("JD")).toBeDefined();
    });
  });

  describe("Delete confirmation", () => {
    it("shows confirmation dialog when delete is clicked", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();

      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      // Open dropdown menu
      await user.click(
        screen.getByLabelText("Actions for message by John Doe"),
      );

      // Click delete in dropdown
      await user.click(screen.getByText("Delete"));

      // Confirmation dialog should appear
      expect(screen.getByText("Delete message?")).toBeDefined();
      expect(screen.getByText("This action cannot be undone.")).toBeDefined();
    });

    it("does not delete when cancel is clicked in confirmation dialog", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();

      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      // Open dropdown menu
      await user.click(
        screen.getByLabelText("Actions for message by John Doe"),
      );

      // Click delete in dropdown
      await user.click(screen.getByText("Delete"));

      // Click cancel in confirmation dialog
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });

    it("calls delete when confirmed in dialog", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();

      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      // Open dropdown menu
      await user.click(
        screen.getByLabelText("Actions for message by John Doe"),
      );

      // Click delete in dropdown
      await user.click(screen.getByText("Delete"));

      // Click delete in confirmation dialog
      const deleteButtons = screen.getAllByRole("button", { name: /Delete/i });
      const confirmDeleteBtn = deleteButtons[deleteButtons.length - 1];
      await user.click(confirmDeleteBtn);

      expect(mockDeleteMutate).toHaveBeenCalledWith("msg-1", expect.anything());
    });
  });

  describe("Reactions", () => {
    it("renders add-reaction button when no reactions exist", () => {
      render(
        <MessageCard
          message={baseMessage}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      // With no reactions, only the add-reaction picker button should show
      const addReactionButton = screen.getByLabelText("Add reaction");
      expect(addReactionButton).toBeDefined();
    });

    it("renders reaction pills for messages with reactions", () => {
      const messageWithReactions = {
        ...baseMessage,
        reactions: [
          {
            emoji: "heart",
            count: 2,
            reacted: true,
            reactorNames: ["You", "Alice"],
          },
          {
            emoji: "thumbs_up",
            count: 1,
            reacted: false,
            reactorNames: ["Bob"],
          },
        ],
      };
      render(
        <MessageCard
          message={messageWithReactions}
          tripId="trip-1"
          isOrganizer={false}
        />,
      );

      const reactionButtons = screen
        .getAllByRole("button")
        .filter((btn) =>
          btn.getAttribute("aria-label")?.startsWith("React with"),
        );
      expect(reactionButtons.length).toBe(2);
    });
  });
});
