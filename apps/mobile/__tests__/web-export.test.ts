import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { SEO_ORIGIN, SEO_ROUTES } from "@/lib/seo";

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
      "privacy.html",
      "terms.html",
      "sms-terms.html",
    ]) {
      expect(fs.existsSync(path.join(distDir, rel)), rel).toBe(true);
    }
    expect(fs.existsSync(path.join(distDir, "legal"))).toBe(false);
  });
});

// Attribute order in the emitted tags is the renderer's business, so these read
// attributes off whatever tags exist instead of matching a tag spelling: a
// reordered attribute is the same tag, and a regex pinned to one order would
// fail a working export and pass a broken one that happened to match.
function attrOf(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match?.[1] ?? null;
}

function tagsNamed(html: string, tag: string): string[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].map(
    (match) => match[0],
  );
}

// Every .html the export emitted, relative to dist/ so a failure names the
// document the way the export writes it.
function htmlFilesIn(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFilesIn(full));
    else if (entry.name.endsWith(".html"))
      out.push(path.relative(distDir, full).split(path.sep).join("/"));
  }
  return out;
}

// The static server's own naming rule, so the walk can ask which pathname
// serves this file at: index.html is /, <dir>/index.html is /<dir>, and
// anything else is /<name>.
function pathnameFor(rel: string): string {
  const withoutExtension = rel.slice(0, -".html".length);
  if (withoutExtension === "index") return "/";
  if (withoutExtension.endsWith("/index"))
    return `/${withoutExtension.slice(0, -"/index".length)}`;
  return `/${withoutExtension}`;
}

// dist/_sitemap.html is the one document the robots invariant cannot hold for,
// and the export says why on its own: expo-router emits it as a shell whose
// root div is empty, whose <title> is empty, and in which the root layout never
// mounts — no screen renders, so no robots tag can be emitted for it, and no
// page in the export links to it. Measured against this repo's export. The list
// is expected to stay exactly one filename long: anything else that fails the
// invariant is a finding to report, not a line to add here.
const NOT_PRERENDERED = new Set(["_sitemap.html"]);

// Phases 2 to 4 only exist once they are in the exported bytes, and the export
// is gitignored, so these are the assertions that read the artifact rather than
// the source. Same guard as the shape suite above: a clean checkout has no
// dist/ and the suite still has to pass.
describe.skipIf(!fs.existsSync(distDir))("web export SEO surface", () => {
  // Written out rather than imported from lib/seo.ts: a test that reads its
  // expectations from the table it is checking agrees with that table after
  // anyone mutates it, which is the one failure this file exists to catch.
  it("emits the landing description, its canonical and the og:image", () => {
    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
    expect(html).toContain(
      "Plan a trip with your group: invite everyone by text, keep one shared itinerary, and see who is coming.",
    );
    const canonicalHrefs = tagsNamed(html, "link")
      .filter((tag) => attrOf(tag, "rel") === "canonical")
      .map((tag) => attrOf(tag, "href"));
    expect(canonicalHrefs).toContain("https://journiful.app/");
    const ogImages = tagsNamed(html, "meta")
      .filter((tag) => attrOf(tag, "property") === "og:image")
      .map((tag) => attrOf(tag, "content"));
    expect(ogImages).toContain("https://journiful.app/og.png");
  });

  // public/ ships these three files; an export that loses one is a 404 on
  // journiful.app while every other check stays green.
  it("ships robots.txt, sitemap.xml and the link preview image", () => {
    for (const name of ["robots.txt", "sitemap.xml", "og.png"]) {
      const file = path.join(distDir, name);
      expect(fs.existsSync(file), name).toBe(true);
      expect(fs.statSync(file).size, name).toBeGreaterThan(0);
    }
  });

  // sitemap.xml is hand-written and nothing regenerates it, so this comparison
  // is the only thing keeping it from drifting from the table: add a route to
  // SEO_ROUTES, forget the sitemap, and every other check today stays green.
  it("lists exactly the indexable paths from the table", () => {
    const sitemap = fs.readFileSync(path.join(distDir, "sitemap.xml"), "utf8");
    const listed = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => {
      const loc = (match[1] ?? "").trim();
      expect(loc.startsWith(SEO_ORIGIN), `${loc} is not under ${SEO_ORIGIN}`).toBe(
        true,
      );
      return loc.slice(SEO_ORIGIN.length);
    });
    expect(listed.sort()).toEqual(Object.keys(SEO_ROUTES).sort());
  });

  // The indexable set is fail-closed, and this walks the bytes rather than
  // trusting that some screen rendered: a route nobody added to SEO_ROUTES
  // must carry noindex, or it is in the index with no title and no description.
  // Offenders are collected so one run names every offending document instead
  // of stopping at the first.
  it("emits noindex for every document the table does not index", () => {
    const offenders = htmlFilesIn(distDir)
      .filter((rel) => !NOT_PRERENDERED.has(rel))
      .filter((rel) => {
        const pathname = pathnameFor(rel);
        if (Object.prototype.hasOwnProperty.call(SEO_ROUTES, pathname)) return false;
        const html = fs.readFileSync(path.join(distDir, rel), "utf8");
        return !tagsNamed(html, "meta")
          .filter((tag) => attrOf(tag, "name") === "robots")
          .some((tag) => attrOf(tag, "content") === "noindex, nofollow");
      })
      .map((rel) => `${pathnameFor(rel)} (${rel})`);
    expect(offenders).toEqual([]);
  });
});
