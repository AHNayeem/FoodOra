/**
 * controller.js — HTTP, and nothing that could be called a rule.
 *
 * Each handler does the same four things: read the request into a plain input
 * object, call the service, put the cookies on the reply if a session was
 * created or rotated, and wrap the answer in the envelope. There is no branch in
 * this file that decides whether somebody may sign in — that is `service.js`,
 * and keeping the two apart is what makes the security review a read of one
 * file rather than a search through nine.
 *
 * The envelope choice is the only judgement here, and it is F1 §5's:
 *
 *  - the service returned `{ refusal }` → **200** `refuse(key)`. A wrong
 *    password is an answer;
 *  - the service returned `{ payload }` → **200** `ok(payload)`;
 *  - the service threw → the global error handler, in the error contract.
 */
import { ok, refuse } from "../../shared/errors/envelope.js";
import { assertCsrf, clearSessionCookies, readRefreshCookie, newCsrfToken, setSessionCookies } from "./utils/cookies.js";

/** What every service call needs to know about the caller. */
const contextOf = (request) => ({ ip: request.ip, userAgent: request.headers["user-agent"] });

/**
 * `{ refusal }` → 200 refusal; `{ payload }` → 200 success.
 *
 * `result.payload` may legitimately be `null` (a completed password reset has
 * nothing to say), so the branch is on `refusal` rather than on the truthiness
 * of the payload.
 */
const envelope = (result) => (result.refusal ? refuse(result.refusal) : ok(result.payload ?? null));

/**
 * A session was created or rotated: set both cookies and return the payload.
 *
 * The refresh token is deliberately *not* in the body. It goes into an
 * `HttpOnly` cookie and nowhere else, which is what makes an XSS unable to steal
 * it — and it is the contract `lib/graphql/session.ts` is already written
 * against ("the refresh token never touches JavaScript").
 */
function sendSession(reply, result) {
  if (result.refusal) return refuse(result.refusal);
  setSessionCookies(reply, {
    refreshToken: result.refreshToken,
    csrfToken: newCsrfToken(),
    expiresAt: result.expiresAt,
  });
  return ok(result.payload);
}

export function createController({ service }) {
  return {
    register: async (request, reply) => sendSession(reply, await service.register(request.body, contextOf(request))),

    login: async (request, reply) => sendSession(reply, await service.login(request.body, contextOf(request))),

    requestOtp: async (request) => envelope(await service.requestOtp(request.body, contextOf(request))),

    /**
     * A code for `login`/`register`/`phone-verify` produces a session; any other
     * purpose produces a yes. Only the first gets cookies.
     */
    verifyOtp: async (request, reply) => {
      const result = await service.verifyOtp(request.body, contextOf(request));
      return result.refreshToken ? sendSession(reply, result) : envelope(result);
    },

    forgotPassword: async (request) => envelope(await service.requestPasswordReset(request.body, contextOf(request))),

    /**
     * A completed reset revokes every session, this one included, so the cookies
     * are cleared: leaving a refresh cookie that the server has already revoked
     * would make the next page load look like a mysterious sign-out instead of
     * the deliberate one it is.
     */
    resetPassword: async (request, reply) => {
      const result = await service.resetPassword(request.body, contextOf(request));
      if (!result.refusal) clearSessionCookies(reply);
      return envelope(result);
    },

    /**
     * Spend the refresh cookie for a new access token.
     *
     * The token may come from the cookie (a browser) or the body (a CLI, a
     * test). CSRF is checked **only** in the cookie case, because CSRF is an
     * attack on ambient credentials and a body token is not one.
     *
     * Failure is a 401 thrown by the service, and the cookies are cleared on the
     * way out by the `onError`-equivalent below: a client holding a dead chain
     * should stop presenting it.
     */
    refresh: async (request, reply) => {
      const cookie = readRefreshCookie(request);
      const token = request.body?.refreshToken ?? cookie;
      if (cookie && !request.body?.refreshToken) assertCsrf(request);

      try {
        return sendSession(reply, await service.refresh({ token, ...contextOf(request) }));
      } catch (error) {
        clearSessionCookies(reply);
        throw error;
      }
    },

    /**
     * End the session. Always 200, always clears the cookies.
     *
     * Idempotent by design: `stores/auth.ts::signOut` clears the UI first and
     * calls this fire-and-forget, so a second call, an expired token or no
     * credential at all must not produce an error the client would log.
     */
    logout: async (request, reply) => {
      const cookie = readRefreshCookie(request);
      if (cookie) assertCsrf(request);

      // A bearer token is accepted as well, so "sign out everywhere" still works
      // from a client whose refresh cookie has already expired.
      let sessionId = null;
      let userId = null;
      if (request.headers.authorization) {
        try {
          await request.jwtVerify();
          if (request.user?.tokenType === "access") {
            sessionId = request.user.sessionId ?? null;
            userId = request.user.sub ?? null;
          }
        } catch {
          // An unusable token is not a reason to refuse to sign somebody out.
        }
      }

      const result = await service.logout({
        token: cookie,
        sessionId,
        userId,
        allDevices: Boolean(request.body?.allDevices),
      });

      clearSessionCookies(reply);
      return ok(result);
    },

    /**
     * The account as the server currently describes it. `requireUser` loaded it.
     *
     * `readModelFor` rather than `toUserReadModel`: the read model's
     * `permissions` is what `lib/rbac.ts::permissionsFor` reads on the client,
     * and module 3 resolves it from the database. See `service.js`'s header.
     */
    me: async (request) => ok(await service.readModelFor(request.account)),
  };
}

export default createController;
