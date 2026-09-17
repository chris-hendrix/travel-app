import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStorageService } from "@/services/storage.service.js";

function makeService(): { service: LocalStorageService; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "storage-test-"));
  return { service: new LocalStorageService(dir), dir };
}

describe("LocalStorageService blob API", () => {
  it("round-trips bytes + contentType via .meta sidecar", async () => {
    const { service } = makeService();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    await service.putObject("places-photos/ref1/400x280", bytes, "image/jpeg");

    const result = await service.getObjectBuffer("places-photos/ref1/400x280");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("image/jpeg");
    expect(Buffer.compare(result!.buffer, bytes)).toBe(0);
  });

  it("returns null for a missing key", async () => {
    const { service } = makeService();
    await expect(service.getObjectBuffer("places-photos/nope/100x100")).resolves.toBeNull();
  });

  it("listKeys returns only matching keys", async () => {
    const { service } = makeService();
    await service.putObject("places-photos/a/100x100", Buffer.from("a"), "image/jpeg");
    await service.putObject("places-photos/b/100x100", Buffer.from("b"), "image/jpeg");
    await service.putObject("other/c", Buffer.from("c"), "image/jpeg");

    const keys = await service.listKeys("places-photos/");
    expect(keys.sort()).toEqual(["places-photos/a/100x100", "places-photos/b/100x100"]);
  });

  it("deleteObject removes the object and its sidecar", async () => {
    const { service } = makeService();
    await service.putObject("places-photos/del/100x100", Buffer.from("x"), "image/jpeg");
    await service.deleteObject("places-photos/del/100x100");
    await expect(service.getObjectBuffer("places-photos/del/100x100")).resolves.toBeNull();
    await expect(service.listKeys("places-photos/")).resolves.toEqual([]);
  });
});
