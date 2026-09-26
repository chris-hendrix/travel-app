/**
 * Export gate: asserts the shape of apps/mobile/dist/ after
 * `expo export --platform web`. Plain Node, no dependencies; paths
 * resolve from this file's directory so cwd does not matter.
 *
 * Deliberately asserts nothing about the manifest (a later task
 * creates it) or assetlinks.json — a check that demands a later
 * task's artifact is how a plan stops being able to go green.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "..", "dist");

let failures = 0;
function check(name, ok) {
  if (ok) console.log(`ok: ${name}`);
  else {
    failures += 1;
    console.error(`FAIL: ${name}`);
  }
}

if (!fs.existsSync(dist)) {
  console.error(`FAIL: dist/ absent at ${dist} — run pnpm export:web first`);
  process.exit(1);
}

check("dist/index.html exists", fs.existsSync(path.join(dist, "index.html")));

const jsDir = path.join(dist, "_expo", "static", "js", "web");
const hasBundle =
  fs.existsSync(jsDir) &&
  fs.readdirSync(jsDir).some((f) => f.endsWith(".js"));
check("hashed web bundle under _expo/static/js/web/", hasBundle);

const cssDir = path.join(dist, "_expo", "static", "css");
const hasCss =
  fs.existsSync(cssDir) &&
  fs.readdirSync(cssDir).some((f) => f.endsWith(".css"));
check("stylesheet under _expo/static/css/", hasCss);

const legalTitles = {
  "privacy.html": "Privacy",
  "terms.html": "Terms",
  "sms-terms.html": "SMS",
};
for (const [file, titlePart] of Object.entries(legalTitles)) {
  const full = path.join(dist, file);
  const exists = fs.existsSync(full);
  check(`${file} exists`, exists);
  if (!exists) continue;
  const html = fs.readFileSync(full, "utf8");
  check(`${file} is not an empty shell`, html.length > 20000);
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/);
  check(`${file} has a non-empty <title>`, !!title && title[1].trim().length > 0);
  check(`${file} contains its document text`, html.includes(titlePart));
}

check(
  "no legal/ directory (published paths only)",
  !fs.existsSync(path.join(dist, "legal")),
);

// App Links: Android fetches this over https://journiful.app, so a
// wrong or missing fingerprint fails autoVerify silently — quietly
// falling back to the browser with every other gate green.
const assetlinksPath = path.join(dist, ".well-known", "assetlinks.json");
const hasAssetlinks = fs.existsSync(assetlinksPath);
check(".well-known/assetlinks.json is in the export", hasAssetlinks);
if (hasAssetlinks) {
  let entries = null;
  try {
    entries = JSON.parse(fs.readFileSync(assetlinksPath, "utf8"));
  } catch {
    check("assetlinks.json parses as JSON", false);
  }
  if (Array.isArray(entries)) {
    const target = entries[0]?.target;
    check(
      "assetlinks package_name is com.journiful.app",
      target?.package_name === "com.journiful.app",
    );
    check(
      "assetlinks carries at least one signing fingerprint",
      Array.isArray(target?.sha256_cert_fingerprints) &&
        target.sha256_cert_fingerprints.length > 0,
    );
  } else {
    check("assetlinks.json is an array", false);
  }
}

// PWA: the manifest plus icons is the whole install story (no service
// worker, by decision — see the PWA section of apps/mobile/AGENTS.md).
const manifestPath = path.join(dist, "manifest.json");
const hasManifest = fs.existsSync(manifestPath);
check("manifest.json is in the export", hasManifest);
if (hasManifest) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  check("manifest name is Journiful", manifest.name === "Journiful");
  check("manifest start_url is /", manifest.start_url === "/");
  check("manifest display is standalone", manifest.display === "standalone");
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  check("manifest lists a 192 and a 512 icon",
    icons.some((i) => i.sizes === "192x192") &&
      icons.some((i) => i.sizes === "512x512"));
  check("manifest lists a maskable icon",
    icons.some((i) => String(i.purpose ?? "").includes("maskable")));
  for (const icon of icons) {
    const src = String(icon.src ?? "");
    if (!src) continue;
    check(
      `manifest icon ${src} resolves in the export`,
      fs.existsSync(path.join(dist, src.replace(/^\//, ""))),
    );
  }
  // Every emitted HTML document has to point at it, or Chrome never sees
  // the manifest on the routes a person actually lands on.
  const htmlFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) htmlFiles.push(full);
    }
  };
  walk(dist);
  const unreferenced = htmlFiles.filter(
    (file) => !fs.readFileSync(file, "utf8").includes("manifest.json"),
  );
  check(
    "every emitted HTML file references the manifest",
    unreferenced.length === 0,
  );
  if (unreferenced.length)
    console.error(
      `  unreferenced: ${unreferenced.map((f) => path.relative(dist, f)).join(", ")}`,
    );
}

const login = path.join(dist, "login.html");
if (fs.existsSync(login)) {
  const html = fs.readFileSync(login, "utf8");
  check("login.html renders the sign-in form", html.includes("Enter your phone number"));
} else {
  check("login.html exists", false);
}

process.exit(failures === 0 ? 0 : 1);
