import { describe, it, expect, vi, beforeEach } from "vitest";
import { PinoDrizzleLogger, instrumentPool } from "@/plugins/query-logger.js";

describe("PinoDrizzleLogger", () => {
  let logger: PinoDrizzleLogger;
  let mockPino: {
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new PinoDrizzleLogger();
    mockPino = {
      debug: vi.fn(),
      warn: vi.fn(),
    };
  });

  describe("logQuery", () => {
    it("should call debug with query and params when logger is set", () => {
      logger.setLogger(mockPino);

      logger.logQuery("SELECT * FROM users WHERE id = $1", ["user-123"]);

      expect(mockPino.debug).toHaveBeenCalledTimes(1);
      expect(mockPino.debug).toHaveBeenCalledWith(
        { query: "SELECT * FROM users WHERE id = $1", params: ["user-123"] },
        "db query",
      );
    });

    it("should do nothing when logger is not set", () => {
      // No setLogger call - logger remains null
      expect(() => {
        logger.logQuery("SELECT 1", []);
      }).not.toThrow();
    });
  });

  describe("warnSlowQuery", () => {
    it("should call warn with query string and duration_ms", () => {
      logger.setLogger(mockPino);

      logger.warnSlowQuery("SELECT * FROM trips", 750.4);

      expect(mockPino.warn).toHaveBeenCalledTimes(1);
      expect(mockPino.warn).toHaveBeenCalledWith(
        { query: "SELECT * FROM trips", duration_ms: 750 },
        "slow query detected",
      );
    });

    it("should handle object query input and extract .text", () => {
      logger.setLogger(mockPino);

      logger.warnSlowQuery({ text: "SELECT * FROM events" }, 600);

      expect(mockPino.warn).toHaveBeenCalledTimes(1);
      expect(mockPino.warn).toHaveBeenCalledWith(
        { query: "SELECT * FROM events", duration_ms: 600 },
        "slow query detected",
      );
    });

    it("should handle object query with no .text property", () => {
      logger.setLogger(mockPino);

      logger.warnSlowQuery({} as { text?: string }, 550);

      expect(mockPino.warn).toHaveBeenCalledTimes(1);
      expect(mockPino.warn).toHaveBeenCalledWith(
        { query: "unknown", duration_ms: 550 },
        "slow query detected",
      );
    });

    it("should handle null query gracefully", () => {
      logger.setLogger(mockPino);

      logger.warnSlowQuery(null as unknown as string, 500);

      expect(mockPino.warn).toHaveBeenCalledTimes(1);
      expect(mockPino.warn).toHaveBeenCalledWith(
        { query: "unknown", duration_ms: 500 },
        "slow query detected",
      );
    });

    it("should handle undefined query gracefully", () => {
      logger.setLogger(mockPino);

      logger.warnSlowQuery(undefined as unknown as string, 500);

      expect(mockPino.warn).toHaveBeenCalledTimes(1);
      expect(mockPino.warn).toHaveBeenCalledWith(
        { query: "unknown", duration_ms: 500 },
        "slow query detected",
      );
    });
  });
});

describe("instrumentPool", () => {
  let queryLogger: PinoDrizzleLogger;
  let mockPino: {
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryLogger = new PinoDrizzleLogger();
    mockPino = {
      debug: vi.fn(),
      warn: vi.fn(),
    };
    queryLogger.setLogger(mockPino);
  });

  it("should NOT warn for fast promise-based queries (under threshold)", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
    };

    instrumentPool(mockPool as never, queryLogger, 500);

    const result = await mockPool.query("SELECT 1");

    expect(result).toEqual({ rows: [{ id: 1 }] });
    expect(mockPino.warn).not.toHaveBeenCalled();
  });

  it("should warn for slow promise-based queries (over threshold)", async () => {
    const mockPool = {
      query: vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve({ rows: [] }), 60),
            ),
        ),
    };

    // Use a very low threshold to trigger slow query warning
    instrumentPool(mockPool as never, queryLogger, 10);

    const result = await mockPool.query("SELECT pg_sleep(1)");

    expect(result).toEqual({ rows: [] });
    expect(mockPino.warn).toHaveBeenCalledTimes(1);
    expect(mockPino.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "SELECT pg_sleep(1)",
        duration_ms: expect.any(Number),
      }),
      "slow query detected",
    );
  });

  it("should warn for slow callback-based queries", async () => {
    const mockPool = {
      query: vi.fn().mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (
          err: unknown,
          res: unknown,
        ) => void;
        setTimeout(() => cb(null, { rows: [{ ok: true }] }), 60);
      }),
    };

    instrumentPool(mockPool as never, queryLogger, 10);

    const result = await new Promise((resolve) => {
      mockPool.query("SELECT slow_callback()", (err: unknown, res: unknown) => {
        resolve(res);
      });
    });

    expect(result).toEqual({ rows: [{ ok: true }] });
    expect(mockPino.warn).toHaveBeenCalledTimes(1);
    expect(mockPino.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "SELECT slow_callback()",
        duration_ms: expect.any(Number),
      }),
      "slow query detected",
    );
  });

  it("should preserve the original query result", async () => {
    const expectedResult = { rows: [{ id: "abc", name: "Trip" }], rowCount: 1 };
    const mockPool = {
      query: vi.fn().mockResolvedValue(expectedResult),
    };

    instrumentPool(mockPool as never, queryLogger, 500);

    const result = await mockPool.query("SELECT * FROM trips WHERE id = $1", [
      "abc",
    ]);

    expect(result).toEqual(expectedResult);
    expect(result).toBe(expectedResult);
  });
});
