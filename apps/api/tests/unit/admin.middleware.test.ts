import { describe, it, expect, vi } from "vitest";
import { requireAdmin, checkBanned } from "@/middleware/admin.middleware.js";
import type { FastifyRequest, FastifyReply } from "fastify";

function mockRequest(overrides?: {
  sub?: string;
  adminId?: string;
  dbResult?: { role?: string; status?: string }[];
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
