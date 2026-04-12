import { randomUUID } from "node:crypto";
import { users, members, blacklistedTokens, type User } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import { eq, or, ilike, count, and, desc } from "drizzle-orm";
import { auditLog } from "@/utils/audit.js";
import type { FastifyRequest, FastifyInstance } from "fastify";
import {
  AdminNotFoundError,
  AdminForbiddenError,
  AdminSelfActionError,
} from "../errors.js";

export interface AdminUserDetail extends User {
  tripCount: number;
}

export interface IAdminService {
  listUsers(params: {
    search?: string | undefined;
    status?: string | undefined;
    role?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ users: User[]; total: number }>;

  getUserDetail(userId: string): Promise<AdminUserDetail | null>;

  updateUser(
    request: FastifyRequest,
    userId: string,
    data: { displayName?: string | undefined; timezone?: string | undefined },
  ): Promise<User>;

  banUser(request: FastifyRequest, userId: string): Promise<void>;

  unbanUser(request: FastifyRequest, userId: string): Promise<void>;

  promoteAdmin(request: FastifyRequest, userId: string): Promise<void>;

  demoteAdmin(request: FastifyRequest, userId: string): Promise<void>;

  startImpersonation(
    request: FastifyRequest,
    targetUserId: string,
  ): Promise<string>;

  stopImpersonation(request: FastifyRequest): Promise<string>;

  revokeImpersonation(
    request: FastifyRequest,
    targetUserId: string,
  ): Promise<void>;
}

export class AdminService implements IAdminService {
  // Track active impersonation JTIs so revoke can find them
  // Map<targetUserId, { jti, expiresAt }>
  private activeImpersonations = new Map<
    string,
    { jti: string; expiresAt: Date }
  >();

  constructor(
    private db: AppDatabase,
    private fastify: FastifyInstance,
  ) {}

  async listUsers(params: {
    search?: string | undefined;
    status?: string | undefined;
    role?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ users: User[]; total: number }> {
    const { search, status, role, page, limit } = params;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      // Search by display name, phone number, or exact UUID match
      const pattern = `%${search}%`;
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search);
      const searchConditions = [
        ilike(users.displayName, pattern),
        ilike(users.phoneNumber, pattern),
      ];
      if (isUUID) {
        searchConditions.push(eq(users.id, search));
      }
      conditions.push(or(...searchConditions)!);
    }
    if (status) {
      conditions.push(eq(users.status, status));
    }
    if (role) {
      conditions.push(eq(users.role, role));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const [userResults, countResult] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(users)
        .where(whereClause),
    ]);

    return {
      users: userResults,
      total: countResult[0]?.total ?? 0,
    };
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = result[0];
    if (!user) return null;

    const tripCountResult = await this.db
      .select({ count: count() })
      .from(members)
      .where(eq(members.userId, userId));

    return {
      ...user,
      tripCount: tripCountResult[0]?.count ?? 0,
    };
  }

  async updateUser(
    request: FastifyRequest,
    userId: string,
    data: { displayName?: string | undefined; timezone?: string | undefined },
  ): Promise<User> {
    const adminId = request.user.adminId ?? request.user.sub;

    const result = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new AdminNotFoundError();
    }

    auditLog(request, "admin.user_updated", {
      resourceType: "user",
      resourceId: userId,
      metadata: { adminId, changes: Object.keys(data) },
    });

    return updated;
  }

  async banUser(request: FastifyRequest, userId: string): Promise<void> {
    const adminId = request.user.adminId ?? request.user.sub;

    if (userId === adminId) {
      throw new AdminSelfActionError("Cannot ban yourself");
    }

    const result = await this.db
      .update(users)
      .set({ status: "banned", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!result[0]) {
      throw new AdminNotFoundError();
    }

    auditLog(request, "admin.user_banned", {
      resourceType: "user",
      resourceId: userId,
      metadata: { adminId },
    });
  }

  async unbanUser(request: FastifyRequest, userId: string): Promise<void> {
    const adminId = request.user.adminId ?? request.user.sub;

    const result = await this.db
      .update(users)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!result[0]) {
      throw new AdminNotFoundError();
    }

    auditLog(request, "admin.user_unbanned", {
      resourceType: "user",
      resourceId: userId,
      metadata: { adminId },
    });
  }

  async promoteAdmin(request: FastifyRequest, userId: string): Promise<void> {
    const adminId = request.user.adminId ?? request.user.sub;

    const result = await this.db
      .update(users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!result[0]) {
      throw new AdminNotFoundError();
    }

    auditLog(request, "admin.user_promoted", {
      resourceType: "user",
      resourceId: userId,
      metadata: { adminId },
    });
  }

  async demoteAdmin(request: FastifyRequest, userId: string): Promise<void> {
    const adminId = request.user.adminId ?? request.user.sub;

    if (userId === adminId) {
      throw new AdminSelfActionError("Cannot demote yourself");
    }

    const result = await this.db
      .update(users)
      .set({ role: "user", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!result[0]) {
      throw new AdminNotFoundError();
    }

    auditLog(request, "admin.user_demoted", {
      resourceType: "user",
      resourceId: userId,
      metadata: { adminId },
    });
  }

  async startImpersonation(
    request: FastifyRequest,
    targetUserId: string,
  ): Promise<string> {
    const adminId = request.user.adminId ?? request.user.sub;

    // Verify target user exists
    const targetResult = await this.db
      .select({ id: users.id, role: users.role, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    const target = targetResult[0];
    if (!target) {
      throw new AdminNotFoundError();
    }

    // Cannot impersonate another admin
    if (target.role === "admin") {
      throw new AdminForbiddenError("Cannot impersonate an admin user");
    }

    const jti = randomUUID();

    // Generate impersonation JWT with 1-hour expiry
    const payload = { sub: targetUserId, adminId, impersonating: true, jti };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = this.fastify.jwt.sign(payload as any, { expiresIn: "1h" });

    // Track for revocation
    this.activeImpersonations.set(targetUserId, {
      jti,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    auditLog(request, "impersonation.start", {
      resourceType: "user",
      resourceId: targetUserId,
      metadata: { adminId, jti, targetDisplayName: target.displayName },
    });

    return token;
  }

  async stopImpersonation(request: FastifyRequest): Promise<string> {
    const adminId = request.user.adminId ?? request.user.sub;

    // Fetch admin user to generate proper token
    const adminResult = await this.db
      .select()
      .from(users)
      .where(eq(users.id, adminId))
      .limit(1);

    const admin = adminResult[0];
    if (!admin) {
      throw new AdminNotFoundError();
    }

    const jti = randomUUID();

    // Generate standard admin JWT with 7-day expiry (default)
    const adminPayload = { sub: admin.id, jti, ...(admin.displayName && { name: admin.displayName }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = this.fastify.jwt.sign(adminPayload as any);

    // Clean up tracked impersonation
    this.activeImpersonations.delete(request.user.sub);

    auditLog(request, "impersonation.stop", {
      resourceType: "user",
      resourceId: request.user.sub,
      metadata: { adminId },
    });

    return token;
  }

  async revokeImpersonation(
    request: FastifyRequest,
    targetUserId: string,
  ): Promise<void> {
    const adminId = request.user.adminId ?? request.user.sub;

    // Look up tracked impersonation JTI for this target
    const tracked = this.activeImpersonations.get(targetUserId);
    if (tracked && tracked.expiresAt > new Date()) {
      await this.db
        .insert(blacklistedTokens)
        .values({
          jti: tracked.jti,
          userId: targetUserId,
          expiresAt: tracked.expiresAt,
        })
        .onConflictDoNothing();
      this.activeImpersonations.delete(targetUserId);
    }

    auditLog(request, "impersonation.revoke", {
      resourceType: "user",
      resourceId: targetUserId,
      metadata: { adminId },
    });
  }
}
