import { describe, expect, it } from "vitest";
import type { PlaceSummary } from "@journiful/shared/types";
import {
  boxForWidth,
  coverImage,
  coverPreviewSeed,
  HERO_BOX_MIN_WIDTH,
  placePhotoUrl,
} from "@/lib/place-images";

const placeWithPhoto: PlaceSummary = {
  placeId: "ChIJ123",
  name: "La Bodega",
  address: "Carrer de la Mar 14, Sóller",
  photoUrl: "https://api.example/api/locations/photos/places%2Fabc%2Fphotos%2Fref",
  photoAttribution: { name: "Marta R.", uri: "https://maps.example/marta", photoUri: null },
  photoSourceUri: "https://maps.example/photo-source",
  country: "ES",
};

const placeWithoutPhoto: PlaceSummary = {
  placeId: "ChIJ456",
  name: "Typed Village",
  address: null,
  photoUrl: null,
  photoAttribution: null,
  photoSourceUri: null,
  country: null,
};

describe("coverImage precedence", () => {
  it("prefers an upload over a place photo", () => {
    const resolved = coverImage({
      coverImageUrl: "https://cdn.example/cover.jpg",
      place: placeWithPhoto,
      id: "trip-1",
    });
    expect(resolved.url).toBe("https://cdn.example/cover.jpg");
    expect(resolved.source).toBe("upload");
  });

  it("prefers a place photo over the theme fallback", () => {
    const resolved = coverImage({
      coverImageUrl: null,
      place: placeWithPhoto,
      id: "trip-1",
    });
    expect(resolved.url).toBe(placePhotoUrl(placeWithPhoto.photoUrl!, "card"));
    expect(resolved.source).toBe("place");
  });

  it("resolves to no image when there is neither an upload nor a place photo", () => {
    const resolved = coverImage({
      coverImageUrl: null,
      place: placeWithoutPhoto,
      id: "trip-1",
    });
    expect(resolved.url).toBeNull();
    expect(resolved.source).toBe("none");
  });
});

describe("placePhotoUrl", () => {
  it("appends the named size", () => {
    expect(placePhotoUrl("https://api.example/base", "card")).toBe(
      "https://api.example/base?size=card",
    );
    expect(placePhotoUrl("https://api.example/base", "hero")).toBe(
      "https://api.example/base?size=hero",
    );
  });
});

describe("photoSourceUri invariant", () => {
  it("carries a non-null source link for a place with a photo", () => {
    const resolved = coverImage({
      coverImageUrl: null,
      place: placeWithPhoto,
      id: "trip-1",
    });
    expect(resolved.photoSourceUri).toBe("https://maps.example/photo-source");
  });

  it("resolves to nulls when the place has no photo", () => {
    const resolved = coverImage({
      coverImageUrl: null,
      place: placeWithoutPhoto,
      id: "trip-1",
    });
    expect(resolved.url).toBeNull();
    expect(resolved.photoSourceUri).toBeNull();
  });
});

describe("boxForWidth", () => {
  it("asks for card on phones and hero on wide layouts", () => {
    expect(boxForWidth(390)).toBe("card");
    expect(boxForWidth(1024)).toBe("hero");
    expect(boxForWidth(HERO_BOX_MIN_WIDTH)).toBe("hero");
  });
});

describe("coverPreviewSeed", () => {
  it("resolves to no image for a place-photo trip with no upload", () => {
    expect(coverPreviewSeed({ coverImageUrl: null })).toBe("");
    expect(coverPreviewSeed({ coverImageUrl: "https://cdn.example/cover.jpg" })).toBe(
      "https://cdn.example/cover.jpg",
    );
  });
});
