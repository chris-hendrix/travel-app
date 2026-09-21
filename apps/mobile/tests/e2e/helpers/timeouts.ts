/**
 * Named constants for mobile E2E tests.
 * Ported from apps/web/tests/e2e/helpers/timeouts.ts — same values so
 * the two suites read alike. Metro cold start (first bundle compile)
 * is covered by the webServer timeout in playwright.config.ts, not here.
 */

/**
 * Base URL for the API server used in E2E test setup (user seeding, etc.).
 */
export const API_BASE = "http://localhost:8000/api";

/**
 * Timeout for page navigation — waiting for URL changes, heading
 * visibility after route transition. Set to 15s to accommodate Metro
 * bundle serving + React hydration + TanStack Query initial data fetch.
 */
export const NAVIGATION_TIMEOUT = 15_000;

/**
 * Timeout for UI element visibility — waiting for elements to appear
 * after user actions (e.g., code accepted, profile saved).
 */
export const ELEMENT_TIMEOUT = 10_000;

/**
 * Extended navigation timeout for multi-step server operations
 * (signup chain spans three screens plus two token writes).
 */
export const SLOW_NAVIGATION_TIMEOUT = 20_000;
