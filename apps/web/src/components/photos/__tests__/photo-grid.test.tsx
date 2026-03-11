import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhotoGrid } from "../photo-grid";
import type { Photo } from "@tripful/shared/types";

vi.mock("../photo-card", () => ({
  PhotoCard: ({
    photo,
    onClick,
    canModify,
  }: {
    photo: Photo;
    onClick: () => void;
    canModify: boolean;
  }) => (
    <div data-testid={`photo-card-${photo.id}`} onClick={onClick}>
      {photo.status}
      {canModify ? "can-modify" : "read-only"}
    </div>
  ),
}));

const makePhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: "photo-1",
  tripId: "trip-1",
  uploadedBy: "user-1",
  url: "/uploads/photos/test.jpg",
  caption: null,
  status: "ready",
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("PhotoGrid", () => {
  it("renders grid of photo cards", () => {
    const photos = [
      makePhoto({ id: "p1" }),
      makePhoto({ id: "p2" }),
      makePhoto({ id: "p3" }),
    ];

    render(
      <PhotoGrid
        photos={photos}
        onPhotoClick={vi.fn()}
        canModify={() => true}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("photo-card-p1")).toBeDefined();
    expect(screen.getByTestId("photo-card-p2")).toBeDefined();
    expect(screen.getByTestId("photo-card-p3")).toBeDefined();
  });

  it("shows empty state when no photos", () => {
    render(
      <PhotoGrid
        photos={[]}
        onPhotoClick={vi.fn()}
        canModify={() => true}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("No photos yet")).toBeDefined();
    expect(
      screen.getByText("Upload photos to share with the group"),
    ).toBeDefined();
  });

  it("passes correct click handler with index", () => {
    const onPhotoClick = vi.fn();
    const photos = [
      makePhoto({ id: "p1" }),
      makePhoto({ id: "p2" }),
      makePhoto({ id: "p3" }),
    ];

    render(
      <PhotoGrid
        photos={photos}
        onPhotoClick={onPhotoClick}
        canModify={() => true}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("photo-card-p2"));
    expect(onPhotoClick).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTestId("photo-card-p3"));
    expect(onPhotoClick).toHaveBeenCalledWith(2);
  });

  it("passes canModify result to each card", () => {
    const photos = [
      makePhoto({ id: "p1", uploadedBy: "user-1" }),
      makePhoto({ id: "p2", uploadedBy: "user-2" }),
    ];

    const canModify = (photo: Photo) => photo.uploadedBy === "user-1";

    render(
      <PhotoGrid
        photos={photos}
        onPhotoClick={vi.fn()}
        canModify={canModify}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("photo-card-p1").textContent).toContain(
      "can-modify",
    );
    expect(screen.getByTestId("photo-card-p2").textContent).toContain(
      "read-only",
    );
  });
});
