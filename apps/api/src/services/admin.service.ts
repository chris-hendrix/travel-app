import { randomUUID } from "node:crypto";
import { users, members, blacklistedTokens, type User } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import { eq, ilike, count, and } from "drizzle-orm";
import { auditLog } from "@/utils/audit.js";
import type { FastifyRequest, FastifyInstance } from "fastify";

export interface AdminUserDetail extends User {
  tripCount: number;
}

export interface IAdminService {
  listUsers(params: {
    search?: string | undefined;
    status?: string | undefined;
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
  constructor(
    private db: AppDatabase,
    private fastify: FastifyInstance,
  ) {}

  async listUsers(params: {
    search?: string | undefined;
    status?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ users: User[]; total: number }> {
    const { search, status, page, limit } = params;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(ilike(users.displayName, `%${search}%`));
    }
    if (status) {
      conditions.push(eq(users.status, status));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const [userResults, countResult] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(whereClause)
        .orderBy(users.createdAt)
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
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
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

    const result = await this.db
      .update(users)
      .set({ status: "banned", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!result[0]) {
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
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
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
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
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
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
      throw Object.assign(new Error("Cannot demote yourself"), {
        statusCode: 400,
      });
    }

    const result = await this.db
      .update(users)
      .set({ role: "user", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!result[0]) {
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
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
      throw Object.assign(new Error("User not found"), { statusCode: 404 });
    }

    // Cannot impersonate another admin
    if (target.role === "admin") {
      throw Object.assign(new Error("Cannot impersonate an admin user"), {
        statusCode: 403,
      });
    }

    const jti = randomUUID();

    // Generate impersonation JWT with 1-hour expiry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = this.fastify.jwt.sign({
      sub: targetUserId,
      adminId,
      impersonating: true,
      jti,
    } as any, { expiresIn: "1h" });

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
      throw Object.assign(new Error("Admin user not found"), {
        statusCode: 404,
      });
    }

    const jti = randomUUID();

    // Generate standard admin JWT with 7-day expiry (default)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = this.fastify.jwt.sign({
      sub: admin.id,
      jti,
      ...(admin.displayName && { name: admin.displayName }),
    } as any);

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

    // Blacklist the current impersonation token if it targets this user
    if (request.user.jti && request.user.impersonating && request.user.sub === targetUserId) {
      await this.db
        .insert(blacklistedTokens)
        .values({
          jti: request.user.jti,
          userId: targetUserId,
          expiresAt: new Date(request.user.exp * 1000),
        })
        .onConflictDoNothing();
    }

    auditLog(request, "impersonation.revoke", {
      resourceType: "user",
      resourceId: targetUserId,
      metadata: { adminId },
    });
  }
}
