import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  users,
  blacklistedTokens,
  authAttempts,
  type User,
} from "@/db/schema/index.js";
import type { JWTPayload, AppDatabase } from "@/types/index.js";
import { eq, sql, getTableColumns } from "drizzle-orm";
import { AccountLockedError } from "../errors.js";

/**
 * Authentication Service Interface
 * Handles user management and JWT token operations.
 * Verification code logic is now handled by IVerificationService.
 */
export interface IAuthService {
  /**
   * Gets an existing user by phone number or creates a new one
   * @param phoneNumber - The phone number to look up or create (E.164 format)
   * @returns Promise that resolves to the user record
   */
  getOrCreateUser(phoneNumber: string): Promise<User>;

  /**
   * Gets a user by their ID
   * @param userId - The UUID of the user to retrieve
   * @returns Promise that resolves to the user record or null if not found
   */
  getUserById(userId: string): Promise<User | null>;

  /**
   * Updates a user's profile information
   * @param userId - The UUID of the user to update
   * @param data - The profile data to update (displayName and/or timezone)
   * @returns Promise that resolves to the updated user record
   */
  updateProfile(
    userId: string,
    data: {
      displayName?: string;
      timezone?: string | null;
      profilePhotoUrl?: string | null;
      handles?: Record<string, string> | null;
    },
  ): Promise<User>;

  /**
   * Generates a JWT token for a user
   * @param user - The user to generate a token for
   * @returns The signed JWT token string
   */
  generateToken(user: User): string;

  /**
   * Verifies a JWT token and returns the decoded payload
   * @param token - The JWT token string to verify
   * @returns The decoded JWT payload
   * @throws Error if token is invalid or expired
   */
  verifyToken(token: string): JWTPayload;

  /**
   * Blacklists a token by its JTI claim so it can no longer be used
   * @param jti - The JWT ID to blacklist
   * @param userId - The user ID who owns the token
   * @param expiresAt - When the token would naturally expire (for cleanup)
   */
  blacklistToken(jti: string, userId: string, expiresAt: Date): Promise<void>;

  /**
   * Checks if a token has been blacklisted
   * @param jti - The JWT ID to check
   * @returns True if the token is blacklisted, false otherwise
   */
  isBlacklisted(jti: string): Promise<boolean>;

  /**
   * Checks if an account is locked due to too many failed attempts
   * @param phoneNumber - The phone number to check (E.164 format)
   * @throws AccountLockedError if the account is currently locked
   */
  checkAccountLocked(phoneNumber: string): Promise<void>;

  /**
   * Records a failed verification attempt and locks the account after 5 failures
   * @param phoneNumber - The phone number that failed verification (E.164 format)
   * @returns Object indicating if the account is now locked and the current failure count
   */
  recordFailedAttempt(
    phoneNumber: string,
  ): Promise<{ locked: boolean; failedCount: number }>;

  /**
   * Resets the failed attempt counter after a successful verification
   * @param phoneNumber - The phone number to reset (E.164 format)
   */
  resetFailedAttempts(phoneNumber: string): Promise<void>;
}

/** Maximum number of failed verification attempts before lockout */
const MAX_FAILED_ATTEMPTS = 5;

/** Duration of account lockout in minutes after exceeding max failed attempts */
export const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Authentication Service Implementation
 * Handles user management and JWT token operations.
 * Verification code logic is now handled by IVerificationService.
 */
export class AuthService implements IAuthService {
  private fastify: FastifyInstance | undefined;

  constructor(
    private db: AppDatabase,
    fastify?: FastifyInstance,
  ) {
    this.fastify = fastify;
  }

  /**
   * Gets an existing user by phone number or creates a new one
   * If user exists, returns existing record
   * If user doesn't exist, creates new user with default values
   * @param phoneNumber - The phone number to look up or create
   * @returns The user record (existing or newly created)
   */
  async getOrCreateUser(phoneNumber: string): Promise<User> {
    // Try to find existing user
    const existingResult = await this.db
      .select(getTableColumns(users))
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .limit(1);

    const existingUser = existingResult[0];

    if (existingUser) {
      return existingUser;
    }

    // Create new user with default values
    const newUserResult = await this.db
      .insert(users)
      .values({
        phoneNumber,
        displayName: "", // Empty string by default
      })
      .returning();

    if (!newUserResult[0]) {
      throw new Error("Failed to create user");
    }

    return newUserResult[0];
  }

  /**
   * Gets a user by their ID
   * @param userId - The UUID of the user to retrieve
   * @returns The user record or null if not found
   */
  async getUserById(userId: string): Promise<User | null> {
    const result = await this.db
      .select(getTableColumns(users))
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Updates a user's profile information
   * Updates displayName and/or timezone, and sets updatedAt timestamp
   * @param userId - The UUID of the user to update
   * @param data - The profile data to update
   * @returns The updated user record
   * @throws Error if user not found (from database constraint)
   */
  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      timezone?: string | null;
      profilePhotoUrl?: string | null;
      handles?: Record<string, string> | null;
    },
  ): Promise<User> {
    const updateData: Partial<User> = {
      ...data,
      updatedAt: new Date(),
    };

    const result = await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (!result[0]) {
      throw new Error("User not found");
    }

    return result[0];
  }

  /**
   * Generates a JWT token for a user with 7-day expiry
   * Token payload includes user ID and optional display name
   * @param user - The user to generate a token for
   * @returns The signed JWT token string
   */
  generateToken(user: User): string {
    if (!this.fastify) {
      throw new Error("FastifyInstance not available");
    }

    const payload = {
      sub: user.id,
      jti: randomUUID(),
      ...(user.displayName && { name: user.displayName }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.fastify.jwt.sign(payload as any);
  }

  /**
   * Verifies a JWT token and returns the decoded payload
   * @param token - The JWT token string to verify
   * @returns The decoded JWT payload
   * @throws Error if token is invalid, expired, or malformed
   */
  verifyToken(token: string): JWTPayload {
    if (!this.fastify) {
      throw new Error("FastifyInstance not available");
    }

    try {
      return this.fastify.jwt.verify<JWTPayload>(token);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Token verification failed: ${error.message}`, { cause: error });
      }
      throw new Error("Token verification failed", { cause: error });
    }
  }

  /**
   * Blacklists a token by its JTI claim so it can no longer be used
   * Inserts a record into the blacklisted_tokens table
   * @param jti - The JWT ID to blacklist
   * @param userId - The user ID who owns the token
   * @param expiresAt - When the token would naturally expire (for cleanup)
   */
  async blacklistToken(
    jti: string,
    userId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.insert(blacklistedTokens).values({
      jti,
      userId,
      expiresAt,
    }).onConflictDoNothing();
  }

  /**
   * Checks if a token has been blacklisted
   * @param jti - The JWT ID to check
   * @returns True if the token is blacklisted, false otherwise
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    const result = await this.db
      .select({ jti: blacklistedTokens.jti })
      .from(blacklistedTokens)
      .where(eq(blacklistedTokens.jti, jti))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Checks if an account is locked due to too many failed verification attempts
   * Queries the authAttempts table and throws if lockedUntil is in the future
   * @param phoneNumber - The phone number to check (E.164 format)
   * @throws AccountLockedError if the account is currently locked
   */
  async checkAccountLocked(phoneNumber: string): Promise<void> {
    const result = await this.db
      .select({ lockedUntil: authAttempts.lockedUntil })
      .from(authAttempts)
      .where(eq(authAttempts.phoneNumber, phoneNumber))
      .limit(1);

    const record = result[0];
    if (record?.lockedUntil && record.lockedUntil > new Date()) {
      const remainingMs = record.lockedUntil.getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      throw new AccountLockedError(
        `Account is locked. Try again in ${remainingMinutes} minute(s).`,
      );
    }
  }

  /**
   * Records a failed verification attempt using upsert
   * Locks the account after MAX_FAILED_ATTEMPTS (5) failures for LOCKOUT_DURATION_MINUTES (15)
   * @param phoneNumber - The phone number that failed verification (E.164 format)
   * @returns Object indicating if the account is now locked and the current failure count
   */
  async recordFailedAttempt(
    phoneNumber: string,
  ): Promise<{ locked: boolean; failedCount: number }> {
    const now = new Date();
    const lockedUntil = new Date(
      now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
    );

    // Single atomic upsert: increments the counter and conditionally sets lockout.
    // Refreshes lockout window on continued failures past threshold (intentional anti-abuse behavior)
    const result = await this.db
      .insert(authAttempts)
      .values({
        phoneNumber,
        failedCount: 1,
        lastFailedAt: now,
        lockedUntil: null,
      })
      .onConflictDoUpdate({
        target: authAttempts.phoneNumber,
        set: {
          failedCount: sql`${authAttempts.failedCount} + 1`,
          lastFailedAt: now,
          lockedUntil: sql`CASE WHEN ${authAttempts.failedCount} + 1 >= ${MAX_FAILED_ATTEMPTS} THEN ${lockedUntil}::timestamptz ELSE ${authAttempts.lockedUntil} END`,
        },
      })
      .returning();

    const record = result[0]!;
    const failedCount = record.failedCount;

    return { locked: failedCount >= MAX_FAILED_ATTEMPTS, failedCount };
  }

  /**
   * Resets the failed attempt counter after a successful verification
   * Deletes the row from authAttempts for the given phone number
   * @param phoneNumber - The phone number to reset (E.164 format)
   */
  async resetFailedAttempts(phoneNumber: string): Promise<void> {
    await this.db
      .delete(authAttempts)
      .where(eq(authAttempts.phoneNumber, phoneNumber));
  }
}
