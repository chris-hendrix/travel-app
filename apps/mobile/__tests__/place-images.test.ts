import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlaceSummary } from "@journiful/shared/types";
import {
  boxForWidth,
  coverImage,
  coverPreviewSeed,
  HERO_BOX_MIN_WIDTH,
  imageSlot,
  placePhotoCredit,
  placePhotoUrl,
} from "@/lib/place-images";

const placeWithPhoto: PlaceSummary = {
  placeId: "ChIJ123",
  name: "La Bodega",
  address: "Carrer de la Mar 14, Sóller",
  photoUrl: "https://api.example/api/locations/photos/places%2Fabc%2Fphotos%2Fref",
  photoAttribution: { name: "Marta R.", uri: "https://maps.example/marta", photoUri: null },
  photoSourceUri: "https://maps.example/photo-source",
  country: "ES", locality: null,
};

const placeWithoutPhoto: PlaceSummary = {
  placeId: "ChIJ456",
  name: "Typed Village",
  address: null,
  photoUrl: null,
  photoAttribution: null,
  photoSourceUri: null,
  country: null, locality: null,
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

/**
 * The regression this block exists for: the API hands `photoUrl` back as
 * a ROOT-RELATIVE path, and a relative `<Image>` resolves against the
 * origin the app runs on — `localhost:8081` under Expo web, which 404s
 * and paints the slot blank while the credit and source link beside it
 * still render. `placeWithPhoto` above is absolute, which is half of why
 * the first version of this file could not see it; the other half is
 * that `resolveUploadUrl` never throws, so with no origin configured it
 * returns the path unchanged and the assertion passes on broken code.
 * Hence the explicit `EXPO_PUBLIC_API_URL` below. See `lib/uploads.ts`
 * for the same fix applied to uploads.
 */
describe("placePhotoUrl absolutizes the API's relative photo path", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000/api";
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  const relativePlace: PlaceSummary = {
    ...placeWithPhoto,
    photoUrl: "/api/locations/photos/places%2Fabc%2Fphotos%2Fref",
  };

  it("prefixes the API origin, minus /api, and keeps the size segment", () => {
    const resolved = coverImage({
      coverImageUrl: null,
      place: relativePlace,
      id: "trip-1",
    });
    expect(resolved.url).toBe(
      "http://localhost:8000/api/locations/photos/places%2Fabc%2Fphotos%2Fref?size=card",
    );
    expect(resolved.source).toBe("place");
  });

  it("never yields a bare relative path, which is what 404s under Expo web", () => {
    const url = coverImage({
      coverImageUrl: null,
      place: relativePlace,
      id: "trip-1",
      box: "hero",
    }).url;
    expect(url).not.toMatch(/^\/api\//);
    expect(url).toBe(
      "http://localhost:8000/api/locations/photos/places%2Fabc%2Fphotos%2Fref?size=hero",
    );
  });

  it("leaves an already-absolute photo base alone", () => {
    expect(placePhotoUrl(placeWithPhoto.photoUrl!, "card")).toBe(
      `${placeWithPhoto.photoUrl}?size=card`,
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

describe("placePhotoCredit", () => {
  it("returns the author name and uri for a populated attribution", () => {
    expect(placePhotoCredit(placeWithPhoto)).toEqual({
      name: "Marta R.",
      uri: "https://maps.example/marta",
    });
  });

  it("returns null for a summary with no photo", () => {
    expect(placePhotoCredit(placeWithoutPhoto)).toBeNull();
    expect(placePhotoCredit(null)).toBeNull();
  });

  it("returns null for an empty author name", () => {
    expect(
      placePhotoCredit({
        ...placeWithPhoto,
        photoAttribution: { name: "  ", uri: "https://maps.example/marta", photoUri: null },
      }),
    ).toBeNull();
  });

  it("passes a null uri through rather than inventing a link", () => {
    expect(
      placePhotoCredit({
        ...placeWithPhoto,
        photoAttribution: { name: "Marta R.", uri: null, photoUri: null },
      }),
    ).toEqual({ name: "Marta R.", uri: null });
  });
});

describe("imageSlot", () => {
  it("resolves a photo url to a photo slot", () => {
    expect(imageSlot({ image: "https://x/y.jpg" })).toEqual({
      kind: "photo",
      url: "https://x/y.jpg",
    });
  });

  it("resolves a missing image to a placeholder slot", () => {
    expect(imageSlot({ image: null })).toEqual({ kind: "placeholder" });
    expect(imageSlot({ image: undefined })).toEqual({ kind: "placeholder" });
    expect(imageSlot({ image: "" })).toEqual({ kind: "placeholder" });
  });

  it("resolves a failed photo to a placeholder slot (the 404 path)", () => {
    expect(imageSlot({ image: "https://x/y.jpg", failed: true })).toEqual({
      kind: "placeholder",
    });
  });
});
