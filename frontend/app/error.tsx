"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * The root error boundary.
 *
 * ## What breaks without it
 *
 * Next streams a Server Component's HTML. The shell — header, footer — flushes as soon as
 * it is ready, and the page's segments arrive after it. If a segment then throws and there
 * is no boundary above it, the response has *already* gone out as HTTP 200: the visitor
 * gets a header, a footer and nothing in between, and the status code says everything is
 * fine. It is loud in the server log and completely silent on screen, which is the worst
 * combination — monitoring sees 200s while customers see an empty page.
 *
 * A `error.tsx` at the root converts that into a rendered fallback. It is the reason this
 * file is resilience rather than design: it adds no feature and changes no layout, it makes
 * an existing failure mode visible.
 *
 * ## Why it is deliberately this plain
 *
 * An error boundary that can itself fail is not a boundary. So there is no `useTranslations`
 * (a missing provider is exactly the sort of thing that throws up here), no data fetching,
 * no store access, and no `next-intl` formatting — only the design system's button, which
 * is a styled anchor. The copy is English, and that is a knowing trade: a translated
 * message that depends on the provider that just crashed is worse than an untranslated one
 * that renders.
 *
 * With `LIVE.catalog` on, `services/catalog.ts` already falls back to the mock layer when
 * the API is unreachable, so most transport failures never reach this file. This catches
 * what that cannot — a fallback that is switched off, a bug in rendering, a failure in a
 * slice with no mock behind it.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The browser console is the only reporter this app has; Sentry is E13's. Logging here
    // rather than in render means it happens once, not on every re-render of the boundary.
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <main className="container-site flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <span className="text-7xl">🍳</span>
      <h1 className="mt-6 text-h1 text-ink">Something went wrong in the kitchen</h1>
      <p className="mt-3 max-w-md text-body">
        We couldn&apos;t load this page. It&apos;s usually temporary — try again, and if it
        keeps happening, head back to the homepage.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {/* `reset` re-renders the segment that threw. Worth offering first: a transient
            API failure or a blown request deadline recovers on the retry. */}
        <Button onClick={reset} size="lg">
          Try again
        </Button>
        <Button href="/" size="lg" variant="secondary">
          Back to home
        </Button>
      </div>

      {/* The digest is the only handle a support conversation has on a specific
          server-side failure — the message itself is withheld from the client in
          production, by design. */}
      {error.digest && (
        <p className="mt-6 text-xs text-muted">
          Reference: <code>{error.digest}</code>
        </p>
      )}
    </main>
  );
}
