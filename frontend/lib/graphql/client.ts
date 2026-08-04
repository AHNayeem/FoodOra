"use client";

import { ApolloClient, InMemoryCache } from "@apollo/client";
import { ApolloLink } from "@apollo/client/link";
import { SetContextLink } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { HttpLink } from "@apollo/client/link/http";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { Observable } from "rxjs";

import { GRAPHQL_URL } from "@/config/backend";
import { ensureAccessToken, refresh, reportSessionLost } from "./session";

/**
 * The Apollo client, and the three links that make it speak this API.
 *
 * **Apollo owns server state; Zustand owns UI and local state.** That split is the
 * decision this file exists to enforce — the normalised cache is the single copy of
 * anything the server sent, and the stores stop holding duplicates of it as each
 * cutover unit lands. Two caches that disagree is the failure mode being avoided.
 *
 * Client-side only. Nothing in the app fetches from a Server Component today, and
 * when something does it will want `@apollo/client-integration-nextjs` rather than
 * this instance — a client created at module scope would be shared between requests
 * on the server, which leaks one user's cache into another's response.
 */

/**
 * Attach the bearer token, refreshing first if it is about to expire.
 *
 * Proactive rather than reactive: renewing 60s early means the retry link below is
 * a backstop for clock skew, not the normal path. `ensureAccessToken` is
 * single-flight, so a screen firing six queries at once causes one refresh.
 */
const authLink = new SetContextLink(async (prevContext) => {
  const token = await ensureAccessToken();
  if (!token) return prevContext;
  return {
    ...prevContext,
    headers: { ...prevContext.headers, authorization: `Bearer ${token}` },
  };
});

/**
 * Refresh and retry exactly once on `UNAUTHENTICATED`.
 *
 * The API's error contract names this behaviour explicitly ("the client refreshes
 * and retries once"). Once, not in a loop: if a fresh token is also rejected the
 * session is genuinely gone, and retrying would spin against a 401.
 *
 * `retried` is set on the operation context, so the second attempt goes through
 * `authLink` again — picking up the token the refresh just installed — and cannot
 * re-enter this branch.
 */
const retryUnauthenticatedLink = new ErrorLink(({ error, operation, forward }) => {
  if (!CombinedGraphQLErrors.is(error)) return;
  if (!error.errors.some((e) => e.extensions?.code === "UNAUTHENTICATED")) return;
  if (operation.getContext().retried) return;

  return new Observable((observer) => {
    let cancelled = false;
    let inner: { unsubscribe: () => void } | undefined;

    void refresh().then((session) => {
      if (cancelled) return;
      if (!session) {
        // No usable refresh cookie. The server has spoken; stop pretending.
        reportSessionLost();
        observer.error(error);
        return;
      }
      operation.setContext({ retried: true });
      inner = forward(operation).subscribe(observer);
    });

    return () => {
      cancelled = true;
      inner?.unsubscribe();
    };
  });
});

const httpLink = new HttpLink({
  uri: GRAPHQL_URL,
  // The refresh cookie is scoped to /auth, so it is never sent here — that is what
  // keeps /graphql non-cookie-authenticated and therefore not CSRF-able. `include`
  // is set anyway so that a future same-origin deployment behaves identically.
  credentials: "include",
});

let client: ApolloClient | null = null;

/** One client per browser tab, created lazily on first use. */
export function getClient(): ApolloClient {
  client ??= new ApolloClient({
    link: ApolloLink.from([retryUnauthenticatedLink, authLink, httpLink]),
    cache: new InMemoryCache(),
    devtools: { enabled: process.env.NODE_ENV === "development", name: "FoodOra" },
    defaultOptions: {
      watchQuery: { fetchPolicy: "cache-and-network" },
    },
  });
  return client;
}

/**
 * Drop every cached result. Called on sign-out, because the cache is keyed by
 * entity id and not by viewer — the next account would otherwise read the previous
 * one's orders out of it.
 */
export async function resetClient(): Promise<void> {
  await client?.clearStore();
}
