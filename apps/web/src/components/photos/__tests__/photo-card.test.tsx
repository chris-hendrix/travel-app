import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhotoCard } from "../photo-card";
import type { Photo } from "@journiful/shared/types";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock("@/lib/api", () => ({
  getUploadUrl: (path: string | null) =>
    path ? `http://localhost:8000${path}` : undefined,
}));

const makePhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: "photo-1",
  tripId: "trip-1",
  uploadedBy: "user-1",
  url: "/uploads/photos/test.jpg",
  caption: "A nice view",
  status: "ready",
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("PhotoCard", () => {
  const createMocks = () => ({
    onClick: vi.fn() as unknown as () => void,
    onDelete: vi.fn() as unknown as (photoId: string) => void,
  });

  describe("Processing state", () => {
    it("renders skeleton/loading state when status is processing", () => {
      const photo = makePhoto({ status: "processing", url: null });
      const { onClick, onDelete } = createMocks();
      const { container } = render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={true}
          onDelete={onDelete}
        />,
      );

      const skeleton = container.querySelector('[data-slot="skeleton"]');
      expect(skeleton).not.toBeNull();
    });

    it("does not call onClick when processing", () => {
      const photo = makePhoto({ status: "processing", url: null });
      const { onClick, onDelete } = createMocks();
      const { container } = render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={true}
          onDelete={onDelete}
        />,
      );

      // There should be no button element when processing
      const button = container.querySelector("button");
      expect(button).toBeNull();

      // Click the container div
      fireEvent.click(container.firstElementChild!);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("Ready state", () => {
    it("renders image with correct src", () => {
      const photo = makePhoto();
      const { onClick, onDelete } = createMocks();
      render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={false}
          onDelete={onDelete}
        />,
      );

      const img = screen.getByRole("img");
      expect(img.getAttribute("src")).toBe(
        "http://localhost:8000/uploads/photos/test.jpg",
      );
    });

    it("calls onClick when clicked", () => {
      const photo = makePhoto();
      const { onClick, onDelete } = createMocks();
      render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={false}
          onDelete={onDelete}
        />,
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("shows hover overlay with delete button when canModify is true", () => {
      const photo = makePhoto();
      const { onClick, onDelete } = createMocks();
      render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={true}
          onDelete={onDelete}
        />,
      );

      const deleteButton = screen.getByLabelText("Delete photo");
      expect(deleteButton).toBeDefined();
    });

    it("does not show delete button when canModify is false", () => {
      const photo = makePhoto();
      const { onClick, onDelete } = createMocks();
      render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={false}
          onDelete={onDelete}
        />,
      );

      expect(screen.queryByLabelText("Delete photo")).toBeNull();
    });

    it("calls onDelete when delete button clicked", () => {
      const photo = makePhoto({ id: "photo-42" });
      const { onClick, onDelete } = createMocks();
      render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={true}
          onDelete={onDelete}
        />,
      );

      const deleteButton = screen.getByLabelText("Delete photo");
      fireEvent.click(deleteButton);
      expect(onDelete).toHaveBeenCalledWith("photo-42");
      // Should not trigger the parent onClick
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("Failed state", () => {
    it("renders error state with message", () => {
      const photo = makePhoto({ status: "failed", url: null });
      const { onClick, onDelete } = createMocks();
      render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={false}
          onDelete={onDelete}
        />,
      );

      expect(screen.getByText("Processing failed")).toBeDefined();
    });

    it("does not call onClick when failed", () => {
      const photo = makePhoto({ status: "failed", url: null });
      const { onClick, onDelete } = createMocks();
      const { container } = render(
        <PhotoCard
          photo={photo}
          onClick={onClick}
          canModify={false}
          onDelete={onDelete}
        />,
      );

      // There should be no button element when failed
      const button = container.querySelector('button[type="button"]');
      expect(button).toBeNull();

      fireEvent.click(container.firstElementChild!);
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
