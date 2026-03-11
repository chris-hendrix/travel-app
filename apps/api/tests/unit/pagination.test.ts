import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  encodeCursor,
  decodeCursor,
  decodeCursorAs,
} from "@/utils/pagination.js";
import { InvalidCursorError } from "@/errors.js";

describe("pagination utils", () => {
  describe("encodeCursor / decodeCursor round-trip", () => {
    it("should encode and decode a simple object", () => {
      const data = { id: "abc-123", createdAt: "2026-01-01T00:00:00.000Z" };
      const encoded = encodeCursor(data);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(data);
    });

    it("should handle UUIDs", () => {
      const data = { id: "550e8400-e29b-41d4-a716-446655440000" };
      const encoded = encodeCursor(data);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(data);
    });

    it("should handle null values", () => {
      const data = { startDate: null, id: "some-id" };
      const encoded = encodeCursor(data);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(data);
    });

    it("should handle numeric values", () => {
      const data = { count: 42, name: "test", id: "abc" };
      const encoded = encodeCursor(data);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(data);
    });

    it("should handle timestamps", () => {
      const data = {
        createdAt: "2026-02-25T23:45:00.123Z",
        id: "notification-id",
      };
      const encoded = encodeCursor(data);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(data);
    });

    it("should produce URL-safe base64url strings", () => {
      const data = { id: "test-value", createdAt: "2026-01-01T00:00:00Z" };
      const encoded = encodeCursor(data);
      // base64url should not contain +, /, or = characters
      expect(encoded).not.toMatch(/[+/=]/);
    });
  });

  describe("decodeCursor error handling", () => {
    it("should throw InvalidCursorError for malformed base64", () => {
      expect(() => decodeCursor("!!!not-base64!!!")).toThrow(
        InvalidCursorError,
      );
    });

    it("should throw InvalidCursorError with 400 status code", () => {
      try {
        decodeCursor("!!!not-base64!!!");
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidCursorError);
        expect((e as { statusCode: number }).statusCode).toBe(400);
      }
    });

    it("should throw InvalidCursorError for valid base64 but non-JSON", () => {
      const notJson = Buffer.from("not json at all").toString("base64url");
      expect(() => decodeCursor(notJson)).toThrow(InvalidCursorError);
    });

    it("should throw InvalidCursorError for valid JSON string (not object)", () => {
      const jsonString = Buffer.from('"just a string"').toString("base64url");
      expect(() => decodeCursor(jsonString)).toThrow(InvalidCursorError);
    });

    it("should throw InvalidCursorError for valid JSON number", () => {
      const jsonNumber = Buffer.from("42").toString("base64url");
      expect(() => decodeCursor(jsonNumber)).toThrow(InvalidCursorError);
    });

    it("should throw InvalidCursorError for valid JSON array", () => {
      const jsonArray = Buffer.from("[1,2,3]").toString("base64url");
      expect(() => decodeCursor(jsonArray)).toThrow(InvalidCursorError);
    });

    it("should throw InvalidCursorError for valid JSON null", () => {
      const jsonNull = Buffer.from("null").toString("base64url");
      expect(() => decodeCursor(jsonNull)).toThrow(InvalidCursorError);
    });

    it("should throw InvalidCursorError for empty string", () => {
      expect(() => decodeCursor("")).toThrow(InvalidCursorError);
    });
  });

  describe("decodeCursorAs", () => {
    const schema = z.object({
      id: z.string(),
      createdAt: z.string(),
    });

    it("should decode and validate a matching cursor", () => {
      const data = { id: "abc-123", createdAt: "2026-01-01T00:00:00.000Z" };
      const encoded = encodeCursor(data);
      const decoded = decodeCursorAs(encoded, schema);
      expect(decoded).toEqual(data);
    });

    it("should throw InvalidCursorError when cursor is missing required fields", () => {
      const encoded = encodeCursor({ id: "abc-123" }); // missing createdAt
      expect(() => decodeCursorAs(encoded, schema)).toThrow(InvalidCursorError);
    });

    it("should throw InvalidCursorError when cursor fields have wrong types", () => {
      const encoded = encodeCursor({ id: 123, createdAt: "2026-01-01" });
      expect(() => decodeCursorAs(encoded, schema)).toThrow(InvalidCursorError);
    });

    it("should strip extra fields via schema parsing", () => {
      const encoded = encodeCursor({
        id: "abc",
        createdAt: "2026-01-01",
        extra: "field",
      });
      const decoded = decodeCursorAs(encoded, schema);
      expect(decoded).toEqual({ id: "abc", createdAt: "2026-01-01" });
      expect(decoded).not.toHaveProperty("extra");
    });

    it("should support nullable fields in schema", () => {
      const nullableSchema = z.object({
        id: z.string(),
        startDate: z.string().nullable(),
      });
      const encoded = encodeCursor({ id: "abc", startDate: null });
      const decoded = decodeCursorAs(encoded, nullableSchema);
      expect(decoded).toEqual({ id: "abc", startDate: null });
    });

    it("should propagate InvalidCursorError for malformed base64", () => {
      expect(() => decodeCursorAs("!!!bad!!!", schema)).toThrow(
        InvalidCursorError,
      );
    });
  });
});
