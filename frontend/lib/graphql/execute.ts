import { print, type DocumentNode } from "graphql";
import type { ApolloClient, TypedDocumentNode } from "@apollo/client";

import { BACKEND_TIMEOUT_MS, GRAPHQL_URL } from "@/config/backend";

/**
 * Run one operation, from wherever the caller happens to be.
 *
 * ## Why there are two transports and not one
 *
 * The catalog's callers are mostly **Server Components** — the landing page, the
 * restaurant directory, a restaurant's detail page, the QR menu — with two client
 * components (`admin/live-ops`, `dashboard/menu-manager`) fetching into local state.
 * One `services/catalog.ts` serves both, so this seam has to work in both places, and
 * the right answer is different on each side:
 *
 * - **In the browser: Apollo.** That is the Unit 0 decision holding — Apollo owns
 *   server state, Zustand owns UI state — and it buys request dedup and a normalised
 *   cache that a component using `useQuery` later will share.
 * - **On the server: `fetch`.** A module-scope Apollo client on the server is shared
 *   between concurrent requests, so its cache would leak one visitor's data into
 *   another's response. `fetch` has no cache to leak, and Next's own request-scoped
 *   deduplication is the layer that should be doing this work anyway.
 *
 * `./client` is a `"use client"` module, so it is reached through a lazy `import()`
 * that only ever runs in the browser. Importing it statically would drag a client
 * reference into the server bundle, where calling it throws.
 *
 * ## Deadlines
 *
 * Every operation carries one, on both transports. Without it a Server Component that is
 * waiting on an unreachable API holds its segment open forever: the shell has already
 * streamed, so the visitor gets a header, a footer and a permanent gap — no error, no
 * spinner, nothing to retry. `AbortSignal.timeout` turns that into a thrown
 * `GraphqlTransportError`, which is a thing the app above can decide what to do about
 * (`services/catalog.ts` falls back to the mock layer; `app/error.tsx` catches whatever
 * reaches it).
 *
 * ## Caching
 *
 * Deliberately none here. These are POST requests, which Next neither memoizes nor
 * caches, and that is the behaviour to want: `Vendor.isOpen` is derived per request in
 * the branch's own timezone, so a cached listing is a listing that lies about which
 * kitchens are taking orders. The cache that *is* worth having sits in the API, where
 * `catalog:rails` holds the cuisine and category lists for fifteen minutes — one cache,
 * server-side, shared by every reader.
 */

interface GraphQLResponse<Data> {
  data?: Data | null;
  errors?: { message: string; path?: readonly (string | number)[] }[];
}

/**
 * A transport or contract failure, thrown rather than swallowed.
 *
 * The mock layer cannot fail, so the catalog services have no error channel in their
 * signatures — `getVendors()` returns a page, not a `Result`. Inventing one would change
 * every call site, which is the thing V1 must not do. So a live catalog that cannot be
 * read is an exception, and for a Server Component that means Next's error handling
 * rather than a page that renders "no restaurants found" when the truth is "the API is
 * unreachable". The message names the flag, because the first question on seeing it is
 * always which cutover switched this on.
 */
export class GraphqlTransportError extends Error {
  constructor(operation: string, detail: string) {
    super(
      `GraphQL "${operation}" failed against ${GRAPHQL_URL}: ${detail}. ` +
        `The backend slice is on (config/backend.ts::LIVE) — check the API is running, ` +
        `or unset the flag to fall back to the mock layer.`,
    );
    this.name = "GraphqlTransportError";
  }
}

/** The operation name, for an error message worth reading. */
function operationName(document: DocumentNode): string {
  for (const definition of document.definitions) {
    if (definition.kind === "OperationDefinition" && definition.name) return definition.name.value;
  }
  return "anonymous";
}

export async function execute<Data, Variables extends Record<string, unknown>>(
  document: TypedDocumentNode<Data, Variables>,
  variables?: Variables,
): Promise<Data> {
  const name = operationName(document);

  if (typeof window !== "undefined") {
    const { getClient } = await import("./client");
    /**
     * The two casts are one gap, and it is a typing gap rather than a safety one.
     *
     * Apollo v4 threads `variables` through a conditional type (`VariablesOption`) that
     * decides whether the key is required by looking at whether `TVariables` has
     * required members. Inside a generic wrapper the compiler cannot resolve that — it
     * does not yet know what `Variables` is — so no call satisfies the overload. The
     * document itself still carries the real types, and the result is narrowed back to
     * `Data` on the way out, which is where the guarantee actually comes from.
     */
    const result = (await getClient().query({
      query: document,
      variables,
      // Apollo forwards `fetchOptions` to the terminating link's `fetch`, which is the
      // only place a deadline can be applied on this side — the client has no timeout of
      // its own, and a hung request would otherwise leave a `useQuery` loading forever.
      context: { fetchOptions: { signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS) } },
      // The rails barely change and a directory page is revisited constantly, so the
      // cache is worth reading. `isOpen` staleness is bounded by the tab's lifetime,
      // which is the same bargain any client-side cache makes.
      fetchPolicy: "cache-first",
    } as unknown as Parameters<ApolloClient["query"]>[0])) as {
      data?: Data | null;
      error?: { message: string };
    };

    if (result.error) throw new GraphqlTransportError(name, result.error.message);
    if (!result.data) throw new GraphqlTransportError(name, "the response carried no data");
    return result.data;
  }

  let response: Response;
  try {
    response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: print(document), variables: variables ?? {} }),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (cause) {
    // `AbortSignal.timeout` rejects with a `TimeoutError`, which reads as "the request
    // never completed (signal timed out)" — true but unhelpful. Name the deadline, since
    // the first question is always whether the API is slow or absent.
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new GraphqlTransportError(
      name,
      timedOut
        ? `no response within ${BACKEND_TIMEOUT_MS}ms (NEXT_PUBLIC_BACKEND_TIMEOUT_MS)`
        : `the request never completed (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  if (!response.ok) {
    throw new GraphqlTransportError(name, `HTTP ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as GraphQLResponse<Data>;

  if (body.errors?.length) {
    // Every error, not just the first: a validation failure against a renamed field
    // reports one per selection, and seeing one of six is how the wrong field gets
    // renamed twice.
    throw new GraphqlTransportError(name, body.errors.map((error) => error.message).join("; "));
  }
  if (!body.data) throw new GraphqlTransportError(name, "the response carried no data");

  return body.data;
}
