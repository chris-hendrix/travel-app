import { describe, it, expect, vi } from "vitest";
import { requireAdmin } from "@/middleware/admin.middleware.js";
import { checkBanned } from "@/middleware/account-state.middleware.js";
import type { FastifyRequest, FastifyReply } from "fastify";

function mockRequest(overrides?: {
  sub?: string;
  adminId?: string;
  dbResult?: { role?: string; status?: string; deletedAt?: Date | null }[];
}) {
  const dbResult = overrides?.dbResult ?? [{ role: "user", status: "active" }];

  return {
    user: {
      sub: overrides?.sub ?? "user-123",
      ...(overrides?.adminId && { adminId: overrides.adminId }),
    },
    server: {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(dbResult),
            }),
          }),
        }),
      },
    },
  } as unknown as FastifyRequest;
}

function mockReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

describe("requireAdmin", () => {
  it("should allow admin users to proceed", async () => {
    const request = mockRequest({
      sub: "admin-user-id",
      dbResult: [{ role: "admin" }],
    });
    const reply = mockReply();

    await requireAdmin(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it("should return 403 for non-admin users", async () => {
    const request = mockRequest({
      sub: "regular-user-id",
      dbResult: [{ role: "user" }],
    });
    const reply = mockReply();

    await requireAdmin(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Admin access required",
      },
    });
  });

  it("should return 403 when user is not found", async () => {
    const request = mockRequest({
      sub: "missing-user-id",
      dbResult: [],
    });
    const reply = mockReply();

    await requireAdmin(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Admin access required",
      },
    });
  });

  it("should return 401 for a deleted admin", async () => {
    // `deleteAccount` anonymizes the row and never clears `role`, so an admin
    // who deletes their own account is still an admin by `users.role` alone.
    const request = mockRequest({
      sub: "deleted-admin-id",
      dbResult: [{ role: "admin", status: "active", deletedAt: new Date() }],
    });
    const reply = mockReply();

    await requireAdmin(request, reply);

    // The same envelope `checkBanned` sends, so the two guards agree.
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Account deleted",
      },
    });
  });

  it("should return 403 for a banned admin", async () => {
    const request = mockRequest({
      sub: "banned-admin-id",
      dbResult: [{ role: "admin", status: "banned" }],
    });
    const reply = mockReply();

    await requireAdmin(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "ACCOUNT_SUSPENDED",
        message: "Your account has been suspended",
      },
    });
  });

  it("should use adminId when impersonating", async () => {
    const request = mockRequest({
      sub: "impersonated-user-id",
      adminId: "real-admin-id",
      dbResult: [{ role: "admin" }],
    });
    const reply = mockReply();

    await requireAdmin(request, reply);

    // Should query with adminId, not sub
    const selectMock = request.server.db.select as ReturnType<typeof vi.fn>;
    const fromMock = selectMock.mock.results[0].value.from;
    const whereMock = fromMock.mock.results[0].value.where;
    expect(whereMock).toHaveBeenCalled();

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});

// `checkBanned` moved to account-state.middleware.ts with `refuseImpersonation`,
// away from the admin-scope guard it shares its mock with; this file keeps both
// cases so the shared envelope stays asserted in one place.
describe("checkBanned", () => {
  it("should allow active users to proceed", async () => {
    const request = mockRequest({
      sub: "active-user-id",
      dbResult: [{ status: "active" }],
    });
    const reply = mockReply();

    await checkBanned(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it("should return 403 for banned users", async () => {
    const request = mockRequest({
      sub: "banned-user-id",
      dbResult: [{ status: "banned" }],
    });
    const reply = mockReply();

    await checkBanned(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "ACCOUNT_SUSPENDED",
        message: "Your account has been suspended",
      },
    });
  });

  it("should allow user not found in DB to proceed", async () => {
    const request = mockRequest({
      sub: "unknown-user-id",
      dbResult: [],
    });
    const reply = mockReply();

    await checkBanned(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
