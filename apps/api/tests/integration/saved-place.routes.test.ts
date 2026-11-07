import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

const UNKNOWN_UUID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_PLACE_ID = "ChIJ-saved-place-route-test-1";

describe("Saved Place Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  /**
   * A trip owner (going member, non-organizer) plus bearer token.
   * Each suite calls this with its own label so trips stay isolated.
   */
  const seedMember = async (label: string) => {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: label,
        timezone: "UTC",
      })
      .returning();

    const [trip] = await db
      .insert(trips)
      .values({
        name: `${label} Trip`,
        destination: "Lisbon",
        preferredTimezone: "Europe/Lisbon",
        createdBy: user!.id,
      })
      .returning();

    await db.insert(members).values({
      tripId: trip!.id,
      userId: user!.id,
      status: "going",
    });

    const token = app.jwt.sign({
      sub: user!.id,
      name: user!.displayName,
    });

    return { userId: user!.id, token, tripId: trip!.id };
  };

  /** A going member added to an existing trip (non-organizer). */
  const seedExtraMember = async (label: string, tripId: string) => {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: label,
        timezone: "UTC",
      })
      .returning();

    await db.insert(members).values({
      tripId,
      userId: user!.id,
      status: "going",
    });

    const token = app.jwt.sign({
      sub: user!.id,
      name: user!.displayName,
    });

    return { userId: user!.id, token };
  };

  /** An organizer member on an existing trip. */
  const seedOrganizer = async (label: string, tripId: string) => {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: label,
        timezone: "UTC",
      })
      .returning();

    await db.insert(members).values({
      tripId,
      userId: user!.id,
      status: "going",
      isOrganizer: true,
    });

    const token = app.jwt.sign({
      sub: user!.id,
      name: user!.displayName,
    });

    return { userId: user!.id, token };
  };

  /** A user with no membership anywhere. */
  const seedOutsider = async (label: string) => {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: label,
        timezone: "UTC",
      })
      .returning();

    const token = app.jwt.sign({
      sub: user!.id,
      name: user!.displayName,
    });

    return { userId: user!.id, token };
  };

  describe("POST /api/trips/:tripId/saved-places", () => {
    it("should create a saved place and return 201 with the single envelope", async () => {
      app = await buildApp();
      const { token, tripId } = await seedMember("Create User");

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload: {
          name: "La Bodega",
          address: "Carrer de la Mar 14, Soller",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("savedPlace");
      expect(body.savedPlace).toMatchObject({
        name: "La Bodega",
        address: "Carrer de la Mar 14, Soller",
        tripId,
      });
      // The entity shape per shared schemas: resolved place, snapshot
      // pair (null — the table carries no such columns), pin flag.
      expect(body.savedPlace).toHaveProperty("place", null);
      expect(body.savedPlace).toHaveProperty("placeName", null);
      expect(body.savedPlace).toHaveProperty("placeAddress", null);
      expect(body.savedPlace).toHaveProperty("isPinned", false);
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${UNKNOWN_UUID}/saved-places`,
        payload: { name: "La Bodega" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 if user is not a member", async () => {
      app = await buildApp();
      const { tripId } = await seedMember("Owner User");
      const { token } = await seedOutsider("Outsider User");

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload: { name: "La Bodega" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should return 404 for an unknown trip", async () => {
      app = await buildApp();
      const { token } = await seedMember("Unknown Trip User");

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${UNKNOWN_UUID}/saved-places`,
        cookies: { auth_token: token },
        payload: { name: "La Bodega" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 409 SAVED_PLACE_DUPLICATE when the member saves the same Google place twice", async () => {
      app = await buildApp();
      const { token, tripId } = await seedMember("Duplicate User");

      const payload = {
        name: "Cafe de Flore",
        placeProvider: "google",
        placeId: TEST_PLACE_ID,
      };

      const first = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload,
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload: { ...payload, name: "Cafe de Flore (again)" },
      });

      expect(second.statusCode).toBe(409);
      expect(JSON.parse(second.body)).toMatchObject({
        success: false,
        error: {
          code: "SAVED_PLACE_DUPLICATE",
        },
      });
    });
  });

  describe("GET /api/trips/:tripId/saved-places", () => {
    it("should list saved places and return 200 with the list envelope", async () => {
      app = await buildApp();
      const { token, tripId } = await seedMember("List User");

      for (const name of ["Spot One", "Spot Two"]) {
        const created = await app.inject({
          method: "POST",
          url: `/api/trips/${tripId}/saved-places`,
          cookies: { auth_token: token },
          payload: { name },
        });
        expect(created.statusCode).toBe(201);
      }

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("savedPlaces");
      expect(body.savedPlaces).toHaveLength(2);
      expect(body.savedPlaces.map((row: { name: string }) => row.name).sort()).toEqual(
        ["Spot One", "Spot Two"],
      );
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${UNKNOWN_UUID}/saved-places`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 if user is not a member", async () => {
      app = await buildApp();
      const { tripId } = await seedMember("List Owner");
      const { token } = await seedOutsider("List Outsider");

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should return 404 for an unknown trip", async () => {
      app = await buildApp();
      const { token } = await seedMember("List Unknown");

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${UNKNOWN_UUID}/saved-places`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/saved-places/:id", () => {
    it("should update a saved place and return 200", async () => {
      app = await buildApp();
      const { token, tripId } = await seedMember("Update User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload: { name: "Old name" },
      });
      expect(created.statusCode).toBe(201);
      const id = JSON.parse(created.body).savedPlace.id;

      const response = await app.inject({
        method: "PUT",
        url: `/api/saved-places/${id}`,
        cookies: { auth_token: token },
        payload: { name: "New name", description: "Worth the climb" },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.savedPlace.name).toBe("New name");
      expect(body.savedPlace.description).toBe("Worth the climb");
    });

    it("should return 403 for a non-author non-organizer edit", async () => {
      app = await buildApp();
      const { token, tripId } = await seedMember("Edit Owner");
      const { token: otherToken } = await seedExtraMember("Edit Other", tripId);

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload: { name: "Mine" },
      });
      const id = JSON.parse(created.body).savedPlace.id;

      const response = await app.inject({
        method: "PUT",
        url: `/api/saved-places/${id}`,
        cookies: { auth_token: otherToken },
        payload: { name: "Theirs now" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should return 404 for a gone saved place", async () => {
      app = await buildApp();
      const { token } = await seedMember("Update Gone");

      const response = await app.inject({
        method: "PUT",
        url: `/api/saved-places/${UNKNOWN_UUID}`,
        cookies: { auth_token: token },
        payload: { name: "Ghost" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/saved-places/:id", () => {
    it("should delete a saved place and return 200", async () => {
      app = await buildApp();
      const { token, tripId } = await seedMember("Delete User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload: { name: "Delete me" },
      });
      const id = JSON.parse(created.body).savedPlace.id;

      const response = await app.inject({
        method: "DELETE",
        url: `/api/saved-places/${id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ success: true });

      // Gone for good: the list no longer carries it.
      const listed = await app.inject({
        method: "GET",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
      });
      expect(
        JSON.parse(listed.body).savedPlaces.map((row: { id: string }) => row.id),
      ).not.toContain(id);
    });

    it("should return 404 for a gone saved place", async () => {
      app = await buildApp();
      const { token } = await seedMember("Delete Gone");

      const response = await app.inject({
        method: "DELETE",
        url: `/api/saved-places/${UNKNOWN_UUID}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/saved-places/:id/pin and DELETE /api/saved-places/:id/pin", () => {
    it("should let an organizer pin and unpin and answer the single envelope", async () => {
      app = await buildApp();
      const { token, tripId } = await seedMember("Pin Saver");
      const { token: organizerToken } = await seedOrganizer("Pin Organizer", tripId);

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload: { name: "Pinnable" },
      });
      const id = JSON.parse(created.body).savedPlace.id;

      const pinned = await app.inject({
        method: "POST",
        url: `/api/saved-places/${id}/pin`,
        cookies: { auth_token: organizerToken },
        payload: { pinned: true },
      });

      expect(pinned.statusCode).toBe(200);
      expect(JSON.parse(pinned.body)).toMatchObject({
        success: true,
        savedPlace: { id, isPinned: true },
      });

      const unpinned = await app.inject({
        method: "DELETE",
        url: `/api/saved-places/${id}/pin`,
        cookies: { auth_token: organizerToken },
      });

      expect(unpinned.statusCode).toBe(200);
      expect(JSON.parse(unpinned.body)).toMatchObject({
        success: true,
        savedPlace: { id, isPinned: false },
      });
    });

    it("should return 403 for a non-organizer pin", async () => {
      app = await buildApp();
      // The saver is a plain member, not the trip creator: creators
      // count as organizers, so the pin must come from the extra member.
      const { tripId } = await seedMember("Pin Trip Owner");
      const { token } = await seedExtraMember("Pin Member", tripId);

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/saved-places`,
        cookies: { auth_token: token },
        payload: { name: "Pinnable" },
      });
      const id = JSON.parse(created.body).savedPlace.id;

      const response = await app.inject({
        method: "POST",
        url: `/api/saved-places/${id}/pin`,
        cookies: { auth_token: token },
        payload: { pinned: true },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
