/**
 * The **browser-side** surface of the GraphQL layer.
 *
 * `./client` is a `"use client"` module, so anything importing this barrel drags it
 * into the graph — which is fine for a client component and wrong for a Server
 * Component. `services/catalog.ts` therefore imports `./execute` and
 * `./catalog.operations` directly, and this barrel deliberately does not re-export
 * them: a convenience export here would silently pull Apollo into the server bundle for
 * whichever page imported it next.
 */
export { getClient, resetClient } from "./client";
export { CSRF_COOKIE, CSRF_HEADER } from "./cookies";
export {
  attempt,
  fromPayload,
  GENERIC_ERROR,
  refuse,
  renderableKey,
  toErrorKey,
  type MutationPayloadLike,
} from "./result";
export {
  bootstrap,
  clearSession,
  currentSession,
  ensureAccessToken,
  onSessionLost,
  refresh,
  reportSessionLost,
  revokeSession,
  setSession,
  type Session,
} from "./session";
