/**
 * auth.js — the authentication *foundation*. Not the authentication module.
 *
 * What is here: the JWT configuration, the two route guards, and the shape of
 * `request.user`. What is deliberately **not** here: registration, sign-in,
 * password reset, OTP, refresh rotation, devices, role management. Those are
 * module 2 and 3 in BACKEND-REQUIREMENTS §3, they need Argon2id, a session
 * table and reuse detection, and putting a half of any of them here would mean
 * the module that owns it starts by deleting code.
 *
 * The point of establishing this now is that every route written from here on
 * can say `preHandler: fastify.authenticate` and mean something definite, and
 * that `request.user` has one shape rather than one per module.
 *
 * ## `request.user`
 *
 * ```js
 * {
 *   id:          "usr_01J8…",     // sub
 *   roles:       ["customer"],     // kebab-case UserRoleSlug values
 *   permissions: ["orders.view"],  // PlatformPermission slugs, or ["*"]
 *   sessionId:   "ses_01J8…",
 *   tokenType:   "access",
 * }
 * ```
 *
 * The vocabulary is the frontend's: `types/user.ts::UserRole` is kebab-case and
 * `lib/rbac.ts::PLATFORM_PERMISSIONS` is the closed permission list, so a claim
 * is comparable to a frontend constant without translation. The `@map` layer in
 * `shared/utils/enums.js` is what puts it in that vocabulary on the way out of
 * Prisma; the token never carries a Prisma identifier.
 *
 * ## Where the permissions come from
 *
 * From the token, for now, and that is a stated limitation rather than the final
 * design. Module 3 resolves `role grants ∪ direct grants − denials` against the
 * database and this reads whatever it puts in the claim; until then nothing
 * mints a token, so nothing depends on the answer yet.
 */
import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import env from "../config/env.js";
import { forbidden, unauthenticated } from "../shared/errors/app-error.js";

/** `lib/rbac.ts::WILDCARD` — the slug that grants everything. */
export const WILDCARD = "*";

/**
 * Does this account hold the permission?
 *
 * Mirrors `lib/rbac.ts` exactly, including the resource wildcard: `orders.*`
 * grants `orders.view` and `orders.manage`. Two implementations of "may they"
 * that disagree is the failure this is copied to avoid — the frontend hides a
 * button and the API must refuse the request behind it for the same reason.
 */
export function hasPermission(user, permission) {
  const held = user?.permissions;
  if (!Array.isArray(held)) return false;
  if (held.includes(WILDCARD) || held.includes(permission)) return true;
  const [resource] = permission.split(".");
  return held.includes(`${resource}.*`);
}

async function authPlugin(fastify) {
  await fastify.register(jwt, {
    secret: env.jwtSecret,
    sign: {
      algorithm: "HS256",
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      expiresIn: env.jwtAccessTtl,
    },
    verify: { issuer: env.jwtIssuer, allowedAud: env.jwtAudience },
    /**
     * The bearer header only, for now. The refresh cookie is scoped to `/auth`
     * by `config/backend.ts` in the frontend and is read by the refresh route
     * the auth module owns — not by a global cookie extractor, which would make
     * every route accept a refresh token as if it were an access token.
     */
    decoratorName: "user",
  });

  if (!env.isProduction && env.jwtSecret.startsWith("dev-only")) {
    fastify.log.warn("JWT_SECRET is the built-in development value — set a real one before deploying");
  }

  /**
   * Require a valid access token. `preHandler: fastify.authenticate`.
   *
   * Rejects a refresh token presented as an access token: they are signed with
   * the same secret, so without the `tokenType` check a stolen refresh token
   * would be a bearer credential for the whole API.
   */
  fastify.decorate("authenticate", async function authenticate(request) {
    try {
      await request.jwtVerify();
    } catch (error) {
      throw unauthenticated("Invalid or missing access token", { cause: error });
    }
    if (request.user?.tokenType && request.user.tokenType !== "access") {
      throw unauthenticated("This endpoint requires an access token");
    }
  });

  /**
   * Populate `request.user` when a token is present, and carry on when it is not.
   *
   * For the routes that answer differently to a signed-in customer without
   * requiring one — a restaurant page that shows a favourite marker, a cart that
   * belongs to a `guestKey` until it belongs to an account.
   */
  fastify.decorate("optionalAuth", async function optionalAuth(request) {
    if (!request.headers.authorization) return;
    try {
      await request.jwtVerify();
    } catch {
      request.user = undefined;
    }
  });

  /**
   * Require permissions. `preHandler: [fastify.authenticate, fastify.authorize("orders.manage")]`.
   *
   * All of them, not any: a route that needs two rights needs both, and "any"
   * silently widens access the first time someone adds a second argument
   * expecting it to narrow.
   */
  fastify.decorate("authorize", function authorize(...permissions) {
    return async function authorizeHook(request) {
      if (!request.user) throw unauthenticated("Authentication required");
      const missing = permissions.filter((permission) => !hasPermission(request.user, permission));
      if (missing.length > 0) {
        throw forbidden(`Missing permission${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`, {
          details: { required: permissions },
        });
      }
    };
  });

  /** Sign an access token. The auth module decides *when*; this decides *how*. */
  fastify.decorate("signAccessToken", (claims) =>
    fastify.jwt.sign({ ...claims, tokenType: "access" }, { expiresIn: env.jwtAccessTtl }),
  );

  /** Signed with the same key but a different lifetime and type. */
  fastify.decorate("signRefreshToken", (claims) =>
    fastify.jwt.sign({ ...claims, tokenType: "refresh" }, { expiresIn: env.jwtRefreshTtl }),
  );

  fastify.decorate("hasPermission", hasPermission);
}

export default fp(authPlugin, { name: "auth" });
