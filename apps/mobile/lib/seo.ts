import { LEGAL_ROWS } from "@/lib/legal";

// Single source of truth for route-level SEO metadata; later phases
// render this into <head> and robots.txt without renegotiating copy.
export const SEO_ORIGIN = "https://journiful.app";
export const SEO_OG_IMAGE_PATH = "/og.png";

// Legal titles come from the published copy's own rows, so a rename
// in the document cannot leave the metadata saying something the page
// does not.
function legalTitle(href: string): string {
  const row = LEGAL_ROWS.find((candidate) => candidate.href === href);
  if (!row) throw new Error(`Missing legal row for ${href}`);
  return row.title;
}

export const SEO_ROUTES: Record<
  string,
  { title: string; description: string }
> = {
  "/": {
    title: "Journiful: an itinerary your friends will actually read",
    description:
      "Plan a trip with your group: invite everyone by text, keep one shared itinerary, and see who is coming.",
  },
  "/terms": {
    title: legalTitle("/terms"),
    description:
      "Journiful Terms of Service: the rules for using the app to plan trips together.",
  },
  "/privacy": {
    title: legalTitle("/privacy"),
    description:
      "Journiful Privacy Policy: what data the app collects and how it is used.",
  },
  "/sms-terms": {
    title: legalTitle("/sms-terms"),
    description:
      "Journiful SMS Terms: how trip text invites and updates work and how to opt out.",
  },
};

export interface SeoResult {
  title: string;
  description: string;
  indexable: boolean;
  robots: string | null;
  canonicalUrl: string;
  ogImageUrl: string;
}

export function seoFor(pathname: string): SeoResult {
  const entry = SEO_ROUTES[pathname];
  // The export prerenders every route, so unknown paths default to
  // noindex: this keeps private screens out of the index, and a future
  // route gets it without anyone remembering to add it. A root-level
  // noindex that individual routes opt out of would fail the other way
  // round: one missed opt-in deindexes the whole site with every check
  // still green.
  if (!entry)
    return {
      title: "Journiful",
      description: "",
      indexable: false,
      robots: "noindex, nofollow",
      canonicalUrl: SEO_ORIGIN + pathname,
      ogImageUrl: SEO_ORIGIN + SEO_OG_IMAGE_PATH,
    };
  return {
    title: entry.title,
    description: entry.description,
    indexable: true,
    robots: null,
    canonicalUrl: SEO_ORIGIN + pathname,
    ogImageUrl: SEO_ORIGIN + SEO_OG_IMAGE_PATH,
  };
}
