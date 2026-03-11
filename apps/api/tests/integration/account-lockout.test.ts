import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, authAttempts } from "@/db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

describe("Account Lockout Integration", () => {
  let app: FastifyInstance;
  const testPhones: string[] = [];

  function newPhone(): string {
    const phone = generateUniquePhone();
    testPhones.push(phone);
    return phone;
  }

  async function requestCode(phoneNumber: string) {
    await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      payload: { phoneNumber },
    });
  }

  async function verifyCode(phoneNumber: string, code: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/verify-code",
      payload: { phoneNumber, code },
    });
  }

  afterEach(async () => {
    // Clean up auth attempts, users, and rate limit entries for test phones
    for (const phone of testPhones) {
      await db.delete(authAttempts).where(eq(authAttempts.phoneNumber, phone));
      await db.delete(users).where(eq(users.phoneNumber, phone));
      await db.execute(
        sql`DELETE FROM rate_limit_entries WHERE key = ${phone}`,
      );
    }
    testPhones.length = 0;
    if (app) {
      await app.close();
    }
  });

  it("failed verification increments attempt counter", async () => {
    app = await buildApp();
    const phone = newPhone();

    await requestCode(phone);
    await verifyCode(phone, "000000");

    const rows = await db
      .select()
      .from(authAttempts)
      .where(eq(authAttempts.phoneNumber, phone))
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].failedCount).toBe(1);
  });

  it("5 failed verifications lock the account", async () => {
    app = await buildApp();
    const phone = newPhone();

    await requestCode(phone);

    // Send 5 wrong codes
    for (let i = 0; i < 5; i++) {
      await verifyCode(phone, "000000");
    }

    // 6th attempt should get 429
    const response = await verifyCode(phone, "000000");

    expect(response.statusCode).toBe(429);

    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "ACCOUNT_LOCKED",
      },
    });
  });

  it("locked account returns 429 even with correct code", async () => {
    app = await buildApp();
    const phone = newPhone();

    await requestCode(phone);

    // Lock the account with 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await verifyCode(phone, "000000");
    }

    // Try with correct code - should still get 429
    const response = await verifyCode(phone, "123456");

    expect(response.statusCode).toBe(429);

    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "ACCOUNT_LOCKED",
      },
    });
  });

  it("successful verification resets counter", async () => {
    app = await buildApp();
    const phone = newPhone();

    await requestCode(phone);

    // Send 3 wrong codes (not enough to lock)
    for (let i = 0; i < 3; i++) {
      await verifyCode(phone, "000000");
    }

    // Verify counter is at 3
    const beforeRows = await db
      .select()
      .from(authAttempts)
      .where(eq(authAttempts.phoneNumber, phone))
      .limit(1);
    expect(beforeRows).toHaveLength(1);
    expect(beforeRows[0].failedCount).toBe(3);

    // Send correct code
    const successResponse = await verifyCode(phone, "123456");
    expect(successResponse.statusCode).toBe(200);

    // Counter should be reset (row deleted)
    const afterRows = await db
      .select()
      .from(authAttempts)
      .where(eq(authAttempts.phoneNumber, phone))
      .limit(1);
    expect(afterRows).toHaveLength(0);

    // Send 3 more wrong codes - should NOT be locked
    for (let i = 0; i < 3; i++) {
      await verifyCode(phone, "000000");
    }

    const finalRows = await db
      .select()
      .from(authAttempts)
      .where(eq(authAttempts.phoneNumber, phone))
      .limit(1);
    expect(finalRows).toHaveLength(1);
    expect(finalRows[0].failedCount).toBe(3);
    expect(finalRows[0].lockedUntil).toBeNull();
  });

  it("locked account includes Retry-After header", async () => {
    app = await buildApp();
    const phone = newPhone();

    await requestCode(phone);

    // Lock the account with 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await verifyCode(phone, "000000");
    }

    // Next attempt should include Retry-After header
    const response = await verifyCode(phone, "000000");

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("900");
  });

  it("re-locks immediately if wrong code is submitted after lockout expires", async () => {
    app = await buildApp();
    const phone = newPhone();

    await requestCode(phone);

    // Lock the account with 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await verifyCode(phone, "000000");
    }

    // Verify it's locked
    const lockedResponse = await verifyCode(phone, "000000");
    expect(lockedResponse.statusCode).toBe(429);

    // Simulate lockout expiry by setting lockedUntil to the past
    await db
      .update(authAttempts)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(authAttempts.phoneNumber, phone));

    // Submit wrong code after expiry — should immediately re-lock
    const response = await verifyCode(phone, "000000");
    expect(response.statusCode).toBe(429);

    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      success: false,
      error: { code: "ACCOUNT_LOCKED" },
    });
    expect(response.headers["retry-after"]).toBe("900");
  });

  it("lockout expires and allows correct code after lockedUntil passes", async () => {
    app = await buildApp();
    const phone = newPhone();

    await requestCode(phone);

    // Lock the account with 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await verifyCode(phone, "000000");
    }

    // Manually set lockedUntil to the past to simulate expiry
    await db
      .update(authAttempts)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(authAttempts.phoneNumber, phone));

    // Now correct code should work
    const response = await verifyCode(phone, "123456");
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});
