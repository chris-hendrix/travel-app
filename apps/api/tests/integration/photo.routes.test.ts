import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, members, trips, tripPhotos } from "@/db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { MAX_PHOTOS_PER_TRIP } from "@tripful/shared/config";
import { generateUniquePhone } from "../test-utils.js";
import FormData from "form-data";

// 1x1 PNG buffer for testing
const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Helper to create a user with complete profile */
async function createUser(displayName = "Test User") {
  const [user] = await db
    .insert(users)
    .values({
      phoneNumber: generateUniquePhone(),
      displayName,
      timezone: "UTC",
    })
    .returning();
  return user;
}

/** Helper to create a trip with creator as organizer member */
async function createTripWithMember(creatorId: string) {
  const [trip] = await db
    .insert(trips)
    .values({
      name: "Test Trip",
      destination: "Paris, France",
      preferredTimezone: "Europe/Paris",
      createdBy: creatorId,
    })
    .returning();

  await db.insert(members).values({
    userId: creatorId,
    tripId: trip.id,
    status: "going",
    isOrganizer: true,
  });

  return trip;
}

/** Helper to add a regular member to a trip */
async function addMember(userId: string, tripId: string, isOrganizer = false) {
  await db.insert(members).values({
    userId,
    tripId,
    status: "going",
    isOrganizer,
  });
}

describe("POST /api/trips/:id/photos", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should upload a single file and return 201 with photo in processing status", async () => {
      app = await buildApp();

      const user = await createUser();
      const trip = await createTripWithMember(user.id);
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      const form = new FormData();
      form.append("file", pngBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/photos`,
        cookies: { auth_token: token },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.photos).toHaveLength(1);
      expect(body.photos[0]).toMatchObject({
        tripId: trip.id,
        uploadedBy: user.id,
        status: "processing",
      });
      expect(body.photos[0]).toHaveProperty("id");
    });

    it("should upload multiple files and return 201 with multiple photos", async () => {
      app = await buildApp();

      const user = await createUser();
      const trip = await createTripWithMember(user.id);
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      const form = new FormData();
      form.append("file", pngBuffer, {
        filename: "photo1.png",
        contentType: "image/png",
      });
      form.append("file", pngBuffer, {
        filename: "photo2.png",
        contentType: "image/png",
      });
      form.append("file", pngBuffer, {
        filename: "photo3.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/photos`,
        cookies: { auth_token: token },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.photos).toHaveLength(3);
      for (const photo of body.photos) {
        expect(photo).toMatchObject({
          tripId: trip.id,
          uploadedBy: user.id,
          status: "processing",
        });
      }
    });
  });

  describe("Error Cases", () => {
    it("should return 401 when no auth token is provided", async () => {
      app = await buildApp();

      const user = await createUser();
      const trip = await createTripWithMember(user.id);

      const form = new FormData();
      form.append("file", pngBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/photos`,
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 when user is not a trip member", async () => {
      app = await buildApp();

      const creator = await createUser("Creator");
      const nonMember = await createUser("Non Member");
      const trip = await createTripWithMember(creator.id);
      const token = app.jwt.sign({
        sub: nonMember.id,
        name: nonMember.displayName,
      });

      const form = new FormData();
      form.append("file", pngBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/photos`,
        cookies: { auth_token: token },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it("should return 400 when file type is invalid", async () => {
      app = await buildApp();

      const user = await createUser();
      const trip = await createTripWithMember(user.id);
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      const form = new FormData();
      form.append("file", Buffer.from("not an image"), {
        filename: "test.txt",
        contentType: "text/plain",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/photos`,
        cookies: { auth_token: token },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it("should return 400 when 20-photo limit is reached", async () => {
      app = await buildApp();

      const user = await createUser();
      const trip = await createTripWithMember(user.id);
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      // Insert 20 photos directly into DB
      for (let i = 0; i < 20; i++) {
        await db.insert(tripPhotos).values({
          tripId: trip.id,
          uploadedBy: user.id,
        });
      }

      const form = new FormData();
      form.append("file", pngBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/photos`,
        cookies: { auth_token: token },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PHOTO_LIMIT_EXCEEDED");
    });
  });

  describe("Concurrent Upload Safety", () => {
    it("should not exceed MAX_PHOTOS_PER_TRIP when two concurrent uploads race", async () => {
      app = await buildApp();

      const user = await createUser();
      const trip = await createTripWithMember(user.id);
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      // Pre-fill the trip to just under the limit (18 photos, limit is 20)
      for (let i = 0; i < MAX_PHOTOS_PER_TRIP - 2; i++) {
        await db.insert(tripPhotos).values({
          tripId: trip.id,
          uploadedBy: user.id,
        });
      }

      // Build two forms, each with 3 photos — together they would exceed the limit
      const makeForm = () => {
        const form = new FormData();
        for (let i = 0; i < 3; i++) {
          form.append("file", pngBuffer, {
            filename: `photo${i}.png`,
            contentType: "image/png",
          });
        }
        return form;
      };

      const form1 = makeForm();
      const form2 = makeForm();

      // Fire both requests concurrently
      const [response1, response2] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/api/trips/${trip.id}/photos`,
          cookies: { auth_token: token },
          payload: form1,
          headers: form1.getHeaders(),
        }),
        app.inject({
          method: "POST",
          url: `/api/trips/${trip.id}/photos`,
          cookies: { auth_token: token },
          payload: form2,
          headers: form2.getHeaders(),
        }),
      ]);

      // At least one should succeed (201), the other may succeed partially or fail (400)
      const statuses = [response1.statusCode, response2.statusCode].sort();
      expect(statuses.some((s) => s === 201)).toBe(true);

      // The critical invariant: total photos must never exceed MAX_PHOTOS_PER_TRIP
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tripPhotos)
        .where(eq(tripPhotos.tripId, trip.id));

      expect(count).toBeLessThanOrEqual(MAX_PHOTOS_PER_TRIP);
    });
  });
});

describe("GET /api/trips/:id/photos", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("should return 200 with photos sorted by createdAt DESC", async () => {
    app = await buildApp();

    const user = await createUser();
    const trip = await createTripWithMember(user.id);
    const token = app.jwt.sign({ sub: user.id, name: user.displayName });

    // Insert some photos
    await db.insert(tripPhotos).values({
      tripId: trip.id,
      uploadedBy: user.id,
      caption: "First photo",
    });
    await db.insert(tripPhotos).values({
      tripId: trip.id,
      uploadedBy: user.id,
      caption: "Second photo",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${trip.id}/photos`,
      cookies: { auth_token: token },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.photos).toHaveLength(2);
    // Verify DESC sort order: newest ("Second photo") first
    expect(body.photos[0].caption).toBe("Second photo");
    expect(body.photos[1].caption).toBe("First photo");
    expect(body.photos[0]).toHaveProperty("tripId", trip.id);
  });

  it("should return 200 with empty array when no photos exist", async () => {
    app = await buildApp();

    const user = await createUser();
    const trip = await createTripWithMember(user.id);
    const token = app.jwt.sign({ sub: user.id, name: user.displayName });

    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${trip.id}/photos`,
      cookies: { auth_token: token },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.photos).toHaveLength(0);
  });

  it("should return 403 when user is not a trip member", async () => {
    app = await buildApp();

    const creator = await createUser("Creator");
    const nonMember = await createUser("Non Member");
    const trip = await createTripWithMember(creator.id);
    const token = app.jwt.sign({
      sub: nonMember.id,
      name: nonMember.displayName,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${trip.id}/photos`,
      cookies: { auth_token: token },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("PATCH /api/trips/:id/photos/:photoId", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("should update caption on own photo and return 200", async () => {
    app = await buildApp();

    const user = await createUser();
    const trip = await createTripWithMember(user.id);
    const token = app.jwt.sign({ sub: user.id, name: user.displayName });

    const [photo] = await db
      .insert(tripPhotos)
      .values({
        tripId: trip.id,
        uploadedBy: user.id,
      })
      .returning();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/trips/${trip.id}/photos/${photo.id}`,
      cookies: { auth_token: token },
      payload: { caption: "My vacation photo" },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.photo).toMatchObject({
      id: photo.id,
      caption: "My vacation photo",
    });
  });

  it("should allow organizer to update caption on another user's photo", async () => {
    app = await buildApp();

    const organizer = await createUser("Organizer");
    const member = await createUser("Member");
    const trip = await createTripWithMember(organizer.id);
    await addMember(member.id, trip.id, false);

    const organizerToken = app.jwt.sign({
      sub: organizer.id,
      name: organizer.displayName,
    });

    // Photo uploaded by regular member
    const [photo] = await db
      .insert(tripPhotos)
      .values({
        tripId: trip.id,
        uploadedBy: member.id,
      })
      .returning();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/trips/${trip.id}/photos/${photo.id}`,
      cookies: { auth_token: organizerToken },
      payload: { caption: "Organizer caption" },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.photo.caption).toBe("Organizer caption");
  });

  it("should return 403 when non-owner non-organizer tries to update caption", async () => {
    app = await buildApp();

    const organizer = await createUser("Organizer");
    const memberA = await createUser("Member A");
    const memberB = await createUser("Member B");
    const trip = await createTripWithMember(organizer.id);
    await addMember(memberA.id, trip.id, false);
    await addMember(memberB.id, trip.id, false);

    const memberBToken = app.jwt.sign({
      sub: memberB.id,
      name: memberB.displayName,
    });

    // Photo uploaded by memberA
    const [photo] = await db
      .insert(tripPhotos)
      .values({
        tripId: trip.id,
        uploadedBy: memberA.id,
      })
      .returning();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/trips/${trip.id}/photos/${photo.id}`,
      cookies: { auth_token: memberBToken },
      payload: { caption: "Unauthorized caption" },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it("should return 404 when photo does not exist", async () => {
    app = await buildApp();

    const user = await createUser();
    const trip = await createTripWithMember(user.id);
    const token = app.jwt.sign({ sub: user.id, name: user.displayName });

    const fakePhotoId = "00000000-0000-0000-0000-000000000000";

    const response = await app.inject({
      method: "PATCH",
      url: `/api/trips/${trip.id}/photos/${fakePhotoId}`,
      cookies: { auth_token: token },
      payload: { caption: "Caption" },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PHOTO_NOT_FOUND");
  });
});

describe("DELETE /api/trips/:id/photos/:photoId", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("should delete own photo and return 200", async () => {
    app = await buildApp();

    const user = await createUser();
    const trip = await createTripWithMember(user.id);
    const token = app.jwt.sign({ sub: user.id, name: user.displayName });

    const [photo] = await db
      .insert(tripPhotos)
      .values({
        tripId: trip.id,
        uploadedBy: user.id,
      })
      .returning();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/trips/${trip.id}/photos/${photo.id}`,
      cookies: { auth_token: token },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);

    // Verify photo is deleted from DB
    const deleted = await db
      .select()
      .from(tripPhotos)
      .where(eq(tripPhotos.id, photo.id));
    expect(deleted).toHaveLength(0);
  });

  it("should allow organizer to delete another user's photo", async () => {
    app = await buildApp();

    const organizer = await createUser("Organizer");
    const member = await createUser("Member");
    const trip = await createTripWithMember(organizer.id);
    await addMember(member.id, trip.id, false);

    const organizerToken = app.jwt.sign({
      sub: organizer.id,
      name: organizer.displayName,
    });

    // Photo uploaded by regular member
    const [photo] = await db
      .insert(tripPhotos)
      .values({
        tripId: trip.id,
        uploadedBy: member.id,
      })
      .returning();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/trips/${trip.id}/photos/${photo.id}`,
      cookies: { auth_token: organizerToken },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it("should return 403 when non-owner non-organizer tries to delete photo", async () => {
    app = await buildApp();

    const organizer = await createUser("Organizer");
    const memberA = await createUser("Member A");
    const memberB = await createUser("Member B");
    const trip = await createTripWithMember(organizer.id);
    await addMember(memberA.id, trip.id, false);
    await addMember(memberB.id, trip.id, false);

    const memberBToken = app.jwt.sign({
      sub: memberB.id,
      name: memberB.displayName,
    });

    // Photo uploaded by memberA
    const [photo] = await db
      .insert(tripPhotos)
      .values({
        tripId: trip.id,
        uploadedBy: memberA.id,
      })
      .returning();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/trips/${trip.id}/photos/${photo.id}`,
      cookies: { auth_token: memberBToken },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it("should return 404 when photo does not exist", async () => {
    app = await buildApp();

    const user = await createUser();
    const trip = await createTripWithMember(user.id);
    const token = app.jwt.sign({ sub: user.id, name: user.displayName });

    const fakePhotoId = "00000000-0000-0000-0000-000000000000";

    const response = await app.inject({
      method: "DELETE",
      url: `/api/trips/${trip.id}/photos/${fakePhotoId}`,
      cookies: { auth_token: token },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PHOTO_NOT_FOUND");
  });

  it("should return 401 when no auth token is provided", async () => {
    app = await buildApp();

    const user = await createUser();
    const trip = await createTripWithMember(user.id);

    const fakePhotoId = "00000000-0000-0000-0000-000000000000";

    const response = await app.inject({
      method: "DELETE",
      url: `/api/trips/${trip.id}/photos/${fakePhotoId}`,
    });

    expect(response.statusCode).toBe(401);
  });
});
