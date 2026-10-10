import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, inArray, eq } from "drizzle-orm";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, userBlocks, userReports } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * `/api/blocks` and `/api/reports` — the two doors a user walks through to
 * stop seeing somebody, and the admin's window onto the reports.
 *
 * The properties worth pinning here are the ones a plausible edit could
 * quietly break:
 *
 * 1. Blocking is idempotent and answers `201` both times. The service's
 *    `ON CONFLICT DO NOTHING` swallows the repeat, and the route does not
 *    turn that into a complaint — a second press of Block should not be a
 *    different outcome from the first.
 * 2. Unblocking puts the pair back on speaking terms, which is observable
 *    through `GET /api/blocks`: the row leaves the list.
 * 3. A report is visible to an admin on the user detail screen's own
 *    payload (`GET /api/admin/users/:id`), because that is the response
 *    the screen renders. A report written and never surfaced is a report
 *    nobody reads.
 *
 * 4. A target id that exists nowhere is a 404, not the catch-all 500 the
 *    FK used to produce — and not a 400, because the request is
 *    well-formed and the target is what is missing. The old answer also
 *    made the call an existence oracle: 201 meant the id was real.
 *
 * 5. A token carrying `impersonating: true` writes nothing here. Its `sub`
 *    is the impersonated user, so a report filed under it is attributed to
 *    somebody who did not file it, and a block written under it is one they
 *    never wrote but the server honours — the same reason `DELETE
 *    /api/users/me` refuses that token.
 */

function tokenFor(app: FastifyInstance, userId: string, name: string) {
  return app.jwt.sign({ sub: userId, name });
}

/** A well-formed uuid no test ever inserts — the "target does not exist" case. */
const GHOST_USER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("Moderation routes", () => {
  let app: FastifyInstance;
  const phones: string[] = [];

  // The suite shares one database, so this file's rows go with it: a
  // block left behind here is a block another file's whole-table count
  // would then trip over.
  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (phones.length === 0) return;
    const mine = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.phoneNumber, phones));
    const ids = mine.map((u) => u.id);
    if (ids.length > 0) {
      await db.delete(userReports).where(inArray(userReports.reporterId, ids));
      await db
        .delete(userReports)
        .where(inArray(userReports.reportedId, ids));
      await db.delete(userBlocks).where(inArray(userBlocks.blockerId, ids));
      await db.delete(userBlocks).where(inArray(userBlocks.blockedId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    phones.length = 0;
  });

  async function createUser(
    overrides?: Partial<{
      displayName: string;
      role: string;
      status: string;
      profilePhotoUrl: string | null;
    }>,
  ) {
    const phoneNumber = generateUniquePhone();
    phones.push(phoneNumber);
    const result = await db
      .insert(users)
      .values({
        phoneNumber,
        displayName: overrides?.displayName ?? "Test User",
        role: overrides?.role ?? "user",
        status: overrides?.status ?? "active",
        profilePhotoUrl: overrides?.profilePhotoUrl ?? null,
      })
      .returning();
    return result[0];
  }

  describe("POST /api/blocks", () => {
    it("should return 201 and list the blocked user", async () => {
      app = await buildApp();
      const blocker = await createUser({ displayName: "Blocker" });
      const blocked = await createUser({
        displayName: "Blocked",
        profilePhotoUrl: "https://example.test/blocked.png",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/blocks",
        cookies: { auth_token: tokenFor(app, blocker.id, blocker.displayName) },
        payload: { userId: blocked.id },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual({ success: true });

      const list = await app.inject({
        method: "GET",
        url: "/api/blocks",
        cookies: { auth_token: tokenFor(app, blocker.id, blocker.displayName) },
      });

      expect(list.statusCode).toBe(200);
      const body = JSON.parse(list.body);
      expect(body.success).toBe(true);
      expect(body.blocks).toHaveLength(1);
      expect(body.blocks[0]).toEqual({
        userId: blocked.id,
        displayName: "Blocked",
        profilePhotoUrl: "https://example.test/blocked.png",
      });
    });

    it("should be idempotent — a repeat is 201 and writes no second row", async () => {
      app = await buildApp();
      const blocker = await createUser({ displayName: "Repeat Blocker" });
      const blocked = await createUser({ displayName: "Repeat Blocked" });
      const cookies = {
        auth_token: tokenFor(app, blocker.id, blocker.displayName),
      };

      const first = await app.inject({
        method: "POST",
        url: "/api/blocks",
        cookies,
        payload: { userId: blocked.id },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: "/api/blocks",
        cookies,
        payload: { userId: blocked.id },
      });
      // The same answer, not a 409: the ordered pair is unique and the
      // insert is `ON CONFLICT DO NOTHING`.
      expect(second.statusCode).toBe(201);
      expect(JSON.parse(second.body)).toEqual({ success: true });

      const list = await app.inject({
        method: "GET",
        url: "/api/blocks",
        cookies,
      });
      expect(JSON.parse(list.body).blocks).toHaveLength(1);
    });

    it("should return 400 when blocking yourself", async () => {
      app = await buildApp();
      const self = await createUser({ displayName: "Self Blocker" });

      const response = await app.inject({
        method: "POST",
        url: "/api/blocks",
        cookies: { auth_token: tokenFor(app, self.id, self.displayName) },
        payload: { userId: self.id },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("CANNOT_MODERATE_SELF");
    });

    it("should return 404, not 500, for a user id that exists nowhere", async () => {
      app = await buildApp();
      const blocker = await createUser({ displayName: "Ghost Blocker" });

      // A well-formed uuid nobody ever inserted. The body is valid, so the
      // answer is about the target: without the guard the insert reaches the
      // FK, the controller's catch-all turns it into a 500, and the status
      // tells the caller whether the id is real.
      const response = await app.inject({
        method: "POST",
        url: "/api/blocks",
        cookies: {
          auth_token: tokenFor(app, blocker.id, blocker.displayName),
        },
        payload: { userId: GHOST_USER_ID },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");

      // Refused means nothing written, not a row pointing at a phantom.
      const rows = await db
        .select()
        .from(userBlocks)
        .where(eq(userBlocks.blockerId, blocker.id));
      expect(rows).toHaveLength(0);
    });

    it("should return 401 without a token", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/blocks",
        payload: { userId: "00000000-0000-0000-0000-000000000000" },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("DELETE /api/blocks/:userId", () => {
    it("should return 200 and make the pair visible again", async () => {
      app = await buildApp();
      const blocker = await createUser({ displayName: "Unblocking Blocker" });
      const blocked = await createUser({ displayName: "Unblocking Blocked" });
      const cookies = {
        auth_token: tokenFor(app, blocker.id, blocker.displayName),
      };

      await app.inject({
        method: "POST",
        url: "/api/blocks",
        cookies,
        payload: { userId: blocked.id },
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/blocks/${blocked.id}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ success: true });

      const list = await app.inject({
        method: "GET",
        url: "/api/blocks",
        cookies,
      });
      expect(JSON.parse(list.body).blocks).toHaveLength(0);
    });

    it("should be idempotent — unblocking an unblocked pair is still 200", async () => {
      app = await buildApp();
      const blocker = await createUser({ displayName: "Never Blocker" });
      const other = await createUser({ displayName: "Never Blocked" });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/blocks/${other.id}`,
        cookies: {
          auth_token: tokenFor(app, blocker.id, blocker.displayName),
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ success: true });
    });

    it("should return 400 when unblocking yourself", async () => {
      app = await buildApp();
      const self = await createUser({ displayName: "Self Unblocker" });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/blocks/${self.id}`,
        cookies: { auth_token: tokenFor(app, self.id, self.displayName) },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.code).toBe(
        "CANNOT_MODERATE_SELF",
      );
    });

    it("should reject a non-uuid path segment", async () => {
      app = await buildApp();
      const blocker = await createUser({ displayName: "Bad Path Blocker" });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/blocks/not-a-uuid",
        cookies: {
          auth_token: tokenFor(app, blocker.id, blocker.displayName),
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/reports", () => {
    it("should return 201 and store the report", async () => {
      app = await buildApp();
      const reporter = await createUser({ displayName: "Reporter" });
      const reported = await createUser({ displayName: "Reported" });

      const response = await app.inject({
        method: "POST",
        url: "/api/reports",
        cookies: {
          auth_token: tokenFor(app, reporter.id, reporter.displayName),
        },
        payload: {
          userId: reported.id,
          reason: "spam",
          note: "Posting links in every event.",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual({ success: true });

      const stored = await db
        .select()
        .from(userReports)
        .where(eq(userReports.reportedId, reported.id));

      expect(stored).toHaveLength(1);
      expect(stored[0].reporterId).toBe(reporter.id);
      expect(stored[0].reason).toBe("spam");
      expect(stored[0].note).toBe("Posting links in every event.");
      expect(stored[0].status).toBe("open");
    });

    it("should reject a reason outside the vocabulary", async () => {
      app = await buildApp();
      const reporter = await createUser({ displayName: "Bad Reason" });
      const reported = await createUser({ displayName: "Bad Reason Target" });

      const response = await app.inject({
        method: "POST",
        url: "/api/reports",
        cookies: {
          auth_token: tokenFor(app, reporter.id, reporter.displayName),
        },
        payload: { userId: reported.id, reason: "because" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 when reporting yourself", async () => {
      app = await buildApp();
      const self = await createUser({ displayName: "Self Reporter" });

      const response = await app.inject({
        method: "POST",
        url: "/api/reports",
        cookies: { auth_token: tokenFor(app, self.id, self.displayName) },
        payload: { userId: self.id, reason: "spam" },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.code).toBe(
        "CANNOT_MODERATE_SELF",
      );
    });

    it("should return 404, not 500, for a user id that exists nowhere", async () => {
      app = await buildApp();
      const reporter = await createUser({ displayName: "Ghost Reporter" });

      const response = await app.inject({
        method: "POST",
        url: "/api/reports",
        cookies: {
          auth_token: tokenFor(app, reporter.id, reporter.displayName),
        },
        payload: { userId: GHOST_USER_ID, reason: "spam" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");

      // No report is left naming a reporter and a phantom target.
      const rows = await db
        .select()
        .from(userReports)
        .where(eq(userReports.reporterId, reporter.id));
      expect(rows).toHaveLength(0);
    });

    it("should return 404, not 500, for a trip id that exists nowhere", async () => {
      app = await buildApp();
      const reporter = await createUser({ displayName: "Trip Ghost Reporter" });
      const reported = await createUser({ displayName: "Trip Ghost Reported" });

      // The trip is optional, so the target check above does not cover it: a
      // nonexistent trip reached the foreign key and answered 500, the same
      // bad-input-is-a-server-error shape the user check exists to avoid.
      const response = await app.inject({
        method: "POST",
        url: "/api/reports",
        cookies: {
          auth_token: tokenFor(app, reporter.id, reporter.displayName),
        },
        payload: {
          userId: reported.id,
          tripId: GHOST_USER_ID,
          reason: "harassment",
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      // The code is shared with the missing-user answer; the message is what
      // says which of the two was missing.
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Trip not found");

      const rows = await db
        .select()
        .from(userReports)
        .where(eq(userReports.reporterId, reporter.id));
      expect(rows).toHaveLength(0);
    });

    it("should return 401 without a token", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/reports",
        payload: {
          userId: "00000000-0000-0000-0000-000000000000",
          reason: "spam",
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("impersonation", () => {
    it("should refuse all three moderation writes and leave the tables alone", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Moderating Admin" });
      const impersonated = await createUser({ displayName: "Impersonated" });
      const contact = await createUser({ displayName: "Impersonated Contact" });

      // A block the impersonated user really did write, so the DELETE below
      // has something it must leave standing.
      await db
        .insert(userBlocks)
        .values({ blockerId: impersonated.id, blockedId: contact.id });

      // Shaped as `adminService.startImpersonation` mints it: `sub` is the
      // impersonated user, `adminId` the admin holding the token.
      const token = app.jwt.sign({
        sub: impersonated.id,
        name: impersonated.displayName,
        adminId: admin.id,
        impersonating: true,
        jti: "moderation-impersonation-test",
      });
      const cookies = { auth_token: token };

      const responses = await Promise.all([
        app.inject({
          method: "POST",
          url: "/api/blocks",
          cookies,
          payload: { userId: contact.id },
        }),
        app.inject({
          method: "POST",
          url: "/api/reports",
          cookies,
          payload: { userId: contact.id, reason: "harassment" },
        }),
        app.inject({
          method: "DELETE",
          url: `/api/blocks/${contact.id}`,
          cookies,
        }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("FORBIDDEN");
      }

      // No block and no report under the impersonated user's name...
      const blocks = await db
        .select()
        .from(userBlocks)
        .where(eq(userBlocks.blockerId, impersonated.id));
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.blockedId).toBe(contact.id);

      const reports = await db
        .select()
        .from(userReports)
        .where(eq(userReports.reporterId, impersonated.id));
      expect(reports).toHaveLength(0);

      // ...and the sub-moderated target is still on the list, not blocked by
      // an admin who was wearing somebody else's name.
      const blockedByTarget = await db
        .select()
        .from(userBlocks)
        .where(
          and(
            eq(userBlocks.blockerId, contact.id),
            eq(userBlocks.blockedId, impersonated.id),
          ),
        );
      expect(blockedByTarget).toHaveLength(0);
    });
  });

  describe("GET /api/admin/users/:id — open reports", () => {
    it("should carry the reported user's open reports", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const reporter = await createUser({ displayName: "Open Reporter" });
      const reported = await createUser({ displayName: "Open Reported" });

      await app.inject({
        method: "POST",
        url: "/api/reports",
        cookies: {
          auth_token: tokenFor(app, reporter.id, reporter.displayName),
        },
        payload: { userId: reported.id, reason: "harassment" },
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/admin/users/${reported.id}`,
        cookies: { auth_token: tokenFor(app, admin.id, admin.displayName) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.openReports).toHaveLength(1);
      expect(body.user.openReports[0]).toMatchObject({
        reporterId: reporter.id,
        reason: "harassment",
        status: "open",
      });
      expect(typeof body.user.openReports[0].createdAt).toBe("string");
    });

    it("should leave out a report that is no longer open", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const reporter = await createUser({ displayName: "Dismissed Reporter" });
      const reported = await createUser({ displayName: "Dismissed Reported" });

      await app.inject({
        method: "POST",
        url: "/api/reports",
        cookies: {
          auth_token: tokenFor(app, reporter.id, reporter.displayName),
        },
        payload: { userId: reported.id, reason: "other" },
      });

      await db
        .update(userReports)
        .set({ status: "dismissed" })
        .where(eq(userReports.reportedId, reported.id));

      const response = await app.inject({
        method: "GET",
        url: `/api/admin/users/${reported.id}`,
        cookies: { auth_token: tokenFor(app, admin.id, admin.displayName) },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).user.openReports).toHaveLength(0);
    });

    it("should not put reports on the list rows", async () => {
      // The list is a paged scan; fetching a report per row would turn
      // one query per page into one per user.
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const reporter = await createUser({ displayName: "List Reporter" });
      const reported = await createUser({ displayName: "List Reported" });

      await app.inject({
        method: "POST",
        url: "/api/reports",
        cookies: {
          auth_token: tokenFor(app, reporter.id, reporter.displayName),
        },
        payload: { userId: reported.id, reason: "impersonation" },
      });

      // Searched by the exact id, not just paged to. The suite shares one
      // database and it accumulates users across files, so "the seeded row
      // is on page 1" is an assumption that holds on a clean database and
      // fails on a used one — this test flaked exactly that way. The list
      // search matches an exact UUID, so the row is the only result and the
      // assertion is about the list's row shape rather than about ordering.
      const response = await app.inject({
        method: "GET",
        url: `/api/admin/users?page=1&limit=5&search=${reported.id}`,
        cookies: { auth_token: tokenFor(app, admin.id, admin.displayName) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const row = body.users.find(
        (u: { id: string }) => u.id === reported.id,
      );
      expect(row).toBeDefined();
      expect(row.openReports).toBeUndefined();
    });
  });
});
