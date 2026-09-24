import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mobileDir = path.resolve(__dirname, "..");
const distDir = path.join(mobileDir, "dist");

// The export is a build artifact (gitignored), so on a clean checkout there
// is nothing to assert against — CI's mobile-checks job runs the suite with
// no export. The shape assertion only runs after an export exists; Task 15's
// CI job builds the export first, which is where this test actually executes.
describe.skipIf(!fs.existsSync(distDir))("web export shape", () => {
  it("emits the root document", () => {
    expect(fs.existsSync(path.join(distDir, "index.html"))).toBe(true);
  });

  it("emits hashed JS and CSS bundles", () => {
    const jsDir = path.join(distDir, "_expo", "static", "js", "web");
    const cssDir = path.join(distDir, "_expo", "static", "css");
    const jsBundles = fs
      .readdirSync(jsDir)
      .filter((name) => name.endsWith(".js"));
    const cssFiles = fs
      .readdirSync(cssDir)
      .filter((name) => name.endsWith(".css"));
    expect(jsBundles.length).toBeGreaterThan(0);
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it("emits per-route HTML for the routes that exist today", () => {
    for (const rel of [
      "login.html",
      "trips/index.html",
      "invite.html",
      "legal/privacy.html",
    ]) {
      expect(fs.existsSync(path.join(distDir, rel)), rel).toBe(true);
    }
  });
});
