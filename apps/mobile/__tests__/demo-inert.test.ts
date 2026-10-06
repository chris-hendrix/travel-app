import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The demo's inertness guarantee: the /demo route renders fixture
 * props through presentational components only, and this test fails
 * the build if a network reach creeps into its transitive import
 * graph.
 *
 * Permitted set (each verified to reach no banned specifier):
 * Screen, Column, Section, EventRow, StayRow, ArrivalBoard,
 * RosterList, RsvpControl, ScheduleRow, Badge, PlaceholderImage,
 * RunLocked, lib/itinerary, lib/travelBoard, lib/members, lib/roster,
 * lib/rsvp, lib/demo. (Band, TripActions and the ui primitives they
 * pull in were measured clean too, but the demo does not mount them.)
 *
 * The walk skips `import type` specifiers, which carry no runtime
 * reach. Three type-only lines reach otherwise-banned specifiers and
 * are clean by construction — do not "fix" them into value imports:
 *   lib/travelBoard.ts:3  import type { MockTravel } from "@/mocks/travel"
 *   lib/roster.ts:18      import type { TripInvitationRow } from "@/lib/queries/invitations"
 *   lib/roster.ts:20      import type { RsvpStatus } from "@/lib/rsvp"
 *
 * Known-excluded module: components/trip/Itinerary.tsx composes the
 * run through live queries and must never render in the demo — the
 * demo composes its EventRow/StayRow rows itself. Its four offending
 * value imports:
 *   :7  @/lib/queries/events       (reaches lib/api.ts, the fetch( boundary)
 *   :14 @/lib/staysStore
 *   :15 @/lib/queries/stays        (reaches lib/api.ts, the fetch( boundary)
 *   :16 @/lib/tripSettingsStore
 * (lib/uploads.ts, reached by the rows, is a pure URL module — the
 * network boundary is lib/api.ts alone.)
 */
const ROOT = resolve(__dirname, "..");

const BANNED_PREFIXES = [
  "@/lib/api",
  "@/lib/queries/",
  "@/lib/flights",
  "@/mocks",
];

const BANNED_TOKENS = ["fetch(", "useQuery", "useMutation", "useQueryClient"];

function localTarget(specifier: string, fromFile: string): string | null {
  const raw = specifier.startsWith("@/")
    ? resolve(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (!raw) return null;
  for (const candidate of [
    `${raw}.tsx`,
    `${raw}.ts`,
    `${raw}/index.tsx`,
    `${raw}/index.ts`,
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function valueImports(source: string): string[] {
  const found: string[] = [];
  for (const line of source.split("\n")) {
    // Type-only imports carry no runtime reach (AGENTS.md permits
    // them; lib/travelBoard.ts:3 relies on it).
    if (/^\s*import\s+type\b/.test(line)) continue;
    const match = /\bfrom\s+["']([^"']+)["']/.exec(line);
    if (match) found.push(match[1]!);
    const bare = /^\s*import\s+["']([^"']+)["']/.exec(line);
    if (bare) found.push(bare[1]!);
  }
  return found;
}

function walk(entry: string): { files: string[]; violations: string[] } {
  const seen = new Set<string>();
  const violations: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const specifier of valueImports(source)) {
      if (
        BANNED_PREFIXES.some(
          (prefix) =>
            specifier === prefix.replace(/\/$/, "") ||
            specifier.startsWith(prefix),
        )
      ) {
        violations.push(`${file} value-imports banned ${specifier}`);
      }
      const target = localTarget(specifier, file);
      if (target && !seen.has(target)) queue.push(target);
    }
    for (const token of BANNED_TOKENS) {
      if (source.includes(token)) {
        violations.push(`${file} contains banned token ${token}`);
      }
    }
  }
  return { files: [...seen], violations };
}

describe("the demo makes no network calls", () => {
  it("reaches no query, store, flight, mock or fetch from app/demo.tsx", () => {
    const entry = resolve(ROOT, "app/demo.tsx");
    expect(existsSync(entry), "app/demo.tsx exists").toBe(true);
    const { files, violations } = walk(entry);
    expect(files.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
