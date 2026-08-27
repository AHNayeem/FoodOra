/**
 * password.js — hashing, verification, and the one policy question.
 *
 * **Argon2id**, because `identity.prisma::Credential` says so: the column is
 * documented "Argon2id" and `algorithm` defaults to the string `"argon2id"`. The
 * library is `@node-rs/argon2` — a prebuilt native binding, so there is no
 * compiler in the install path — configured with OWASP's m=19456, t=2, p=1
 * profile. The parameters are stored *inside* the PHC-format hash, so raising
 * them later re-hashes on next sign-in rather than invalidating every password.
 *
 * Two properties this file exists to guarantee:
 *
 *  - **A hash never leaves.** Nothing here returns one to a caller that could
 *    serialise it; `repository.js` selects `Credential` explicitly and the read
 *    models in `service.js` are built field by field rather than spread.
 *  - **Verification takes the same time whether or not the account exists.**
 *    `verifyOrDummy` hashes against a fixed decoy when there is no credential,
 *    so the response time of "no such user" matches "wrong password". Without it
 *    the timing difference is a working account-enumeration oracle regardless of
 *    how carefully the *message* is kept identical.
 */
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import env from "../../../config/env.js";

const OPTIONS = Object.freeze({
  memoryCost: env.authArgonMemoryKib,
  timeCost: env.authArgonTimeCost,
  parallelism: env.authArgonParallelism,
});

/** The value written to `credentials.algorithm`. */
export const ALGORITHM = "argon2id";

/**
 * A real Argon2id hash of a value nobody knows, used only to burn the same CPU
 * time on the "no account" path. Computed once, lazily, on first need.
 */
let decoyHash = null;
async function decoy() {
  decoyHash ??= await argonHash("password-that-is-not-anybody's", OPTIONS);
  return decoyHash;
}

export async function hashPassword(plaintext) {
  return argonHash(plaintext, OPTIONS);
}

/**
 * Is this the password?
 *
 * Returns `false` rather than throwing on a malformed or foreign hash: a row
 * written by some other tool is a credential that cannot be verified, which is
 * indistinguishable from a wrong password as far as the caller is concerned, and
 * a 500 there would say "that account exists" out loud.
 */
export async function verifyPassword(storedHash, plaintext) {
  try {
    return await argonVerify(storedHash, plaintext, OPTIONS);
  } catch {
    return false;
  }
}

/** `verifyPassword`, plus the constant-time-ish path for "there is no credential". */
export async function verifyOrDummy(storedHash, plaintext) {
  if (!storedHash) {
    await argonVerify(await decoy(), plaintext, OPTIONS).catch(() => false);
    return false;
  }
  return verifyPassword(storedHash, plaintext);
}

/**
 * Is this password acceptable?
 *
 * Length only, and that is the whole policy on purpose. The three locale files
 * carry exactly one password complaint — `errors.passwordShort`, "at least 8
 * characters" — and the client-side zod schema enforces exactly that, so a
 * server rule the client does not know about would surface as a refusal the form
 * cannot explain or attach to a field. Composition rules (a digit, a symbol) are
 * also, on the current evidence, worse: they shrink the search space people
 * actually use. Length is the check that pays.
 */
export function passwordProblem(plaintext) {
  if (typeof plaintext !== "string" || plaintext.length < env.authPasswordMinLength) {
    return "passwordShort";
  }
  return null;
}
