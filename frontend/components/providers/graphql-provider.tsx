"use client";

import { useEffect } from "react";
import { ApolloProvider } from "@apollo/client/react";

import { LIVE } from "@/config/backend";
import { getClient, resetClient } from "@/lib/graphql/client";
import { onSessionLost } from "@/lib/graphql/session";
import { restoreSession } from "@/services/auth";
import { useAuth } from "@/stores/auth";

/**
 * Puts Apollo in scope and reconnects the session on load.
 *
 * Two jobs, both of which can only happen on the client:
 *
 * 1. **Restore.** The access token lives in memory, so a page reload starts with a
 *    persisted `user` in `localStorage` and nothing to authenticate with. Spending
 *    the refresh cookie once on mount is what that endpoint is for, and the account
 *    it returns is the *server's* current view of it — which is how a role change or
 *    a suspension reaches a tab that has been open since before it happened.
 *
 * 2. **Give up when the server says so.** A refused refresh has to drop the user
 *    from the store, or the header renders signed-in over an app whose every query
 *    401s.
 *
 * A restore that finds no cookie is silent, not a sign-out: the store rehydrates
 * from `localStorage` on its own schedule (`skipHydration`, see `SiteHeader`), and
 * signing out on "no cookie yet" would race it. Only an explicit refusal — which
 * `reportSessionLost` is the sole source of — clears the session.
 *
 * All of it is gated on `LIVE.auth`. With the flag off the app runs on the mock
 * layer exactly as before and never touches the network.
 */
export function GraphqlProvider({ children }: { children: React.ReactNode }) {
  const signIn = useAuth((s) => s.signIn);
  const signOut = useAuth((s) => s.signOut);

  useEffect(() => {
    if (!LIVE.auth) return;

    const stop = onSessionLost(() => {
      signOut();
      void resetClient();
    });

    void restoreSession().then((result) => {
      if (result.data) signIn(result.data);
    });

    return stop;
  }, [signIn, signOut]);

  return <ApolloProvider client={getClient()}>{children}</ApolloProvider>;
}
