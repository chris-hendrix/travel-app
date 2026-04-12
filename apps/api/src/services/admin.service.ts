import { users, members, type User } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import { eq, ilike, count, and } from "drizzle-orm";
import { auditLog } from "@/utils/audit.js";
import type { FastifyRequest } from "fastify";

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
}

export class AdminService implements IAdminService {
  constructor(private db: AppDatabase) {}

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
}
