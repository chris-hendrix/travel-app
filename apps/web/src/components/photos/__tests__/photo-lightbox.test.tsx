import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PhotoLightbox } from "../photo-lightbox";
import type { Photo } from "@journiful/shared/types";

// Mock next/image — render as plain <img> for testing
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

// Mock getUploadUrl — prefix relative paths
vi.mock("@/lib/api", () => ({
  getUploadUrl: (path: string | null) =>
    path ? `http://localhost:8000${path}` : undefined,
}));

// Mock photo hooks — mutations won't reach a real server in jsdom
const { updateCaptionMutate } = vi.hoisted(() => ({
  updateCaptionMutate: vi.fn(),
}));

vi.mock("@/hooks/use-photos", () => ({
  useUpdatePhotoCaption: () => ({ mutate: updateCaptionMutate }),
  useDeletePhoto: () => ({ mutate: vi.fn() }),
}));

const makePhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: "photo-1",
  tripId: "trip-1",
  uploadedBy: "user-1",
  url: "/uploads/photos/test.jpg",
  caption: "A nice view",
  status: "ready",
  sortOrder: 0,
  createdAt: new Date("2026-06-01T12:00:00Z"),
  updatedAt: new Date("2026-06-01T12:00:00Z"),
  ...overrides,
});

describe("PhotoLightbox", () => {
  let queryClient: QueryClient;

  const photo1 = makePhoto({ id: "photo-1", caption: "Sunset on the beach" });
  const photo2 = makePhoto({
    id: "photo-2",
    caption: "Mountain view",
    sortOrder: 1,
  });

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    updateCaptionMutate.mockClear();
    queryClient.clear();
  });

  const makeWrapper = () => {
    const client = queryClient;
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

  const renderLightbox = (
    overrides?: Partial<React.ComponentProps<typeof PhotoLightbox>>,
  ) => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    const props: React.ComponentProps<typeof PhotoLightbox> = {
      photos: [photo1, photo2],
      currentIndex: 0,
      onClose,
      onNavigate,
      canModify: () => false,
      tripId: "trip-1",
      ...overrides,
    };

    const result = render(<PhotoLightbox {...props} />, {
      wrapper: makeWrapper(),
    });

    return {
      ...result,
      onClose: props.onClose,
      onNavigate: props.onNavigate,
    };
  };

  describe("Counter display", () => {
    it("renders the photo counter with current index and total", () => {
      renderLightbox({ currentIndex: 0 });

      expect(screen.getByText("1 / 2")).toBeDefined();
    });

    it("updates counter when currentIndex changes", () => {
      renderLightbox({ currentIndex: 1 });

      expect(screen.getByText("2 / 2")).toBeDefined();
    });
  });

  describe("Navigation", () => {
    it("next button advances index and calls onNavigate", () => {
      const { onNavigate } = renderLightbox({ currentIndex: 0 });

      const nextButton = screen.getByLabelText("Next photo");
      fireEvent.click(nextButton);

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it("next button is not rendered on the last photo", () => {
      renderLightbox({ currentIndex: 1 });

      expect(screen.queryByLabelText("Next photo")).toBeNull();
    });

    it("previous button goes back and calls onNavigate", () => {
      const { onNavigate } = renderLightbox({ currentIndex: 1 });

      const prevButton = screen.getByLabelText("Previous photo");
      fireEvent.click(prevButton);

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    it("previous button is not rendered on the first photo", () => {
      renderLightbox({ currentIndex: 0 });

      expect(screen.queryByLabelText("Previous photo")).toBeNull();
    });
  });

  describe("Close behavior", () => {
    it("calls onClose when close button is clicked", () => {
      const { onClose } = renderLightbox();

      const closeButton = screen.getByLabelText("Close lightbox");
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape key is pressed", () => {
      const { onClose } = renderLightbox();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when editing caption and Escape is pressed", () => {
      const { onClose } = renderLightbox({
        canModify: () => true,
      });

      // Enter edit mode
      const captionButton = screen.getByText("Sunset on the beach");
      fireEvent.click(captionButton);

      // Press Escape while editing — should cancel edit, not close lightbox
      const input = screen.getByPlaceholderText("Add a caption...");
      fireEvent.keyDown(input, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Caption editing", () => {
    it("shows editable caption button when canModify returns true", () => {
      renderLightbox({ canModify: () => true });

      expect(screen.getByText("Sunset on the beach")).toBeDefined();
    });

    it("shows static caption text when canModify returns false and caption exists", () => {
      renderLightbox({ canModify: () => false });

      // The caption should be a <p> element, not a <button>
      const captionElement = screen.getByText("Sunset on the beach");
      expect(captionElement.tagName).toBe("P");
    });

    it("shows nothing in caption area when canModify returns false and caption is null", () => {
      const photoNoCaption = makePhoto({
        id: "photo-3",
        caption: null,
        sortOrder: 2,
      });
      renderLightbox({
        photos: [photoNoCaption],
        currentIndex: 0,
        canModify: () => false,
      });

      // "Add a caption..." only shows when modifiable; no caption element at all otherwise
      expect(screen.queryByText("Add a caption...")).toBeNull();
      expect(screen.queryByText(/caption/i)).toBeNull();
    });

    it("enters edit mode when caption button is clicked", () => {
      renderLightbox({ canModify: () => true });

      const captionButton = screen.getByText("Sunset on the beach");
      fireEvent.click(captionButton);

      // An input should appear with the current caption value
      const input = screen.getByDisplayValue("Sunset on the beach");
      expect(input.tagName).toBe("INPUT");
    });

    it("shows placeholder when editing a null caption", () => {
      const photoNoCaption = makePhoto({
        id: "photo-3",
        caption: null,
        sortOrder: 2,
      });
      renderLightbox({
        photos: [photoNoCaption],
        currentIndex: 0,
        canModify: () => true,
      });

      const captionButton = screen.getByText("Add a caption...");
      fireEvent.click(captionButton);

      const input = screen.getByPlaceholderText(
        "Add a caption...",
      ) as HTMLInputElement;
      expect(input.value).toBe("");
    });

    it("saves caption on Enter key", async () => {
      renderLightbox({ canModify: () => true });

      // Click to edit
      const captionButton = screen.getByText("Sunset on the beach");
      fireEvent.click(captionButton);

      // Type new caption
      const input = screen.getByDisplayValue("Sunset on the beach");
      const user = userEvent.setup();
      await user.clear(input);
      await user.type(input, "Updated sunset caption");

      // Press Enter to save
      fireEvent.keyDown(input, { key: "Enter" });

      // Should call mutation with new caption
      expect(updateCaptionMutate).toHaveBeenCalledWith({
        photoId: "photo-1",
        data: { caption: "Updated sunset caption" },
      });

      // Should exit edit mode (input removed, caption button restored)
      await waitFor(() => {
        expect(
          screen.queryByDisplayValue("Updated sunset caption"),
        ).toBeNull();
        expect(screen.getByText("Sunset on the beach")).toBeDefined();
      });
    });

    it("cancels edit when Escape is pressed in caption input", () => {
      renderLightbox({ canModify: () => true });

      // Click to edit
      const captionButton = screen.getByText("Sunset on the beach");
      fireEvent.click(captionButton);

      const input = screen.getByDisplayValue("Sunset on the beach");

      // Change the value then press Escape
      fireEvent.change(input, { target: { value: "Should not save" } });
      fireEvent.keyDown(input, { key: "Escape" });

      // Should revert to original caption
      expect(screen.getByText("Sunset on the beach")).toBeDefined();
      expect(screen.queryByDisplayValue("Should not save")).toBeNull();
    });
  });

  describe("Delete flow", () => {
    it("shows delete button when canModify returns true", () => {
      renderLightbox({ canModify: () => true });

      expect(screen.getByLabelText("Delete photo")).toBeDefined();
    });

    it("does not show delete button when canModify returns false", () => {
      renderLightbox({ canModify: () => false });

      expect(screen.queryByLabelText("Delete photo")).toBeNull();
    });

    it("opens delete confirmation dialog when delete button is clicked", async () => {
      renderLightbox({ canModify: () => true });

      const deleteButton = screen.getByLabelText("Delete photo");
      fireEvent.click(deleteButton);

      // The AlertDialog content renders via portal — look for title/description
      await waitFor(() => {
        expect(screen.getByText("Delete photo?")).toBeDefined();
        expect(
          screen.getByText("This action cannot be undone."),
        ).toBeDefined();
        expect(screen.getByText("Cancel")).toBeDefined();
        expect(screen.getByText("Delete")).toBeDefined();
      });
    });
  });

  describe("Image rendering", () => {
    it("renders the current photo image with correct src", () => {
      renderLightbox({ currentIndex: 0 });

      const img = screen.getByRole("img", { name: "Sunset on the beach" });
      expect(img.getAttribute("src")).toBe(
        "http://localhost:8000/uploads/photos/test.jpg",
      );
    });

    it("uses alt text from caption", () => {
      renderLightbox({ currentIndex: 1 });

      const img = screen.getByRole("img", { name: "Mountain view" });
      expect(img).toBeDefined();
    });

    it("falls back to generic alt text when caption is null", () => {
      const noCaptionPhoto = makePhoto({
        id: "photo-3",
        caption: null,
        sortOrder: 2,
      });
      renderLightbox({
        photos: [noCaptionPhoto],
        currentIndex: 0,
      });

      const img = screen.getByRole("img", { name: "Trip photo" });
      expect(img).toBeDefined();
    });
  });

  describe("Accessibility", () => {
    it("has dialog role and aria-modal", () => {
      renderLightbox();

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
    });

    it("has live region on counter for screen readers", () => {
      renderLightbox({ currentIndex: 0 });

      const counter = screen.getByText("1 / 2");
      expect(counter.getAttribute("aria-live")).toBe("polite");
    });
  });

  describe("Body scroll lock", () => {
    it("sets body overflow to hidden on mount", () => {
      renderLightbox();

      expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores body overflow on unmount", () => {
      const { unmount } = renderLightbox();

      unmount();

      expect(document.body.style.overflow).toBe("");
    });
  });
});
