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

const login = path.join(dist, "login.html");
if (fs.existsSync(login)) {
  const html = fs.readFileSync(login, "utf8");
  check("login.html renders the sign-in form", html.includes("Enter your phone number"));
} else {
  check("login.html exists", false);
}

process.exit(failures === 0 ? 0 : 1);
