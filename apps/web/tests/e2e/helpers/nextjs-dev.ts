/* global document, MutationObserver, localStorage */
import type { Page } from "@playwright/test";

/**
 * Remove Next.js dev overlay that can intercept pointer events during E2E tests.
 * This is only relevant in development mode.
 *
 * Uses addInitScript to inject a MutationObserver that removes the nextjs-portal
 * element as soon as it appears in the DOM. The observer starts watching once
 * the document body is available.
 */
export async function removeNextjsDevOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    function removePortal() {
      document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
      const scripts = document.querySelectorAll(
        'script[data-nextjs-dev-overlay="true"]',
      );
      scripts.forEach((el) => el.remove());
    }

    function startObserving() {
      removePortal();
      const observer = new MutationObserver(() => {
        removePortal();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.body) {
      startObserving();
    } else {
      document.addEventListener("DOMContentLoaded", startObserving);
    }
  });
}

/**
 * Dismiss PWA install prompts (iOS install guide and standard install banner)
 * so they don't intercept pointer events during E2E tests.
 *
 * Sets the localStorage keys that the PWA components check before showing.
 */
export async function dismissPwaPrompts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("pwa-ios-guide-dismissed", "1");
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
  });
}
