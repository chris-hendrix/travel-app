import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

/**
 * The root HTML shell for the web export.
 *
 * Only ever runs in Node during the static render, so it holds no app
 * state and imports no CSS: the manifest link, the touch icon and the
 * theme colour belong to the document, and the app's own providers
 * belong to `app/_layout.tsx`.
 *
 * There is deliberately no service worker here. The export caches no
 * data (everything comes from the API at runtime), so a worker would
 * buy a bundle-staleness problem and nothing else; the manifest alone
 * is what makes Chrome offer Install.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
