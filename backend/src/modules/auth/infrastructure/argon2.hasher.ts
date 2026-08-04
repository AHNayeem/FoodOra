import { Algorithm, hash, verify } from '@node-rs/argon2';
import { Inject, Injectable } from '@nestjs/common';

import { jwtConfig, type JwtConfig } from '../../../config';
import { type PasswordHasherPort, UNUSABLE_PASSWORD_HASH } from '../domain';

/**
 * Argon2id, at the parameters D6 specifies: `m=19456 KiB, t=2, p=1`, tuned to
 * roughly 250 ms.
 *
 * Argon2id rather than bcrypt because bcrypt is memory-cheap, and memory is the
 * only cost a GPU cannot buy its way out of; `id` rather than `i` or `d` because it
 * is the hybrid that resists both side-channel and time-memory trade-off attacks,
 * which is why it is the variant RFC 9106 recommends for password hashing.
 *
 * `@node-rs/argon2` rather than the `argon2` npm package: it ships prebuilt
 * binaries, so the image builds without a C toolchain — and the reason E1 chose
 * Debian over Alpine (glibc, not musl) is what makes those binaries loadable at
 * runtime.
 */
@Injectable()
export class Argon2Hasher implements PasswordHasherPort {
  /**
   * A hash of a value nobody knows, computed once at construction and verified
   * against on every miss. Its whole job is to burn the same ~250 ms a real
   * verification would.
   */
  private readonly decoy: Promise<string>;

  constructor(@Inject(jwtConfig.KEY) private readonly config: JwtConfig) {
    this.decoy = this.hash('the-account-that-does-not-exist');
  }

  hash(plaintext: string): Promise<string> {
    return hash(plaintext, {
      algorithm: Algorithm.Argon2id,
      memoryCost: this.config.argon2.memoryCost,
      timeCost: this.config.argon2.timeCost,
      parallelism: 1,
    });
  }

  async verify(storedHash: string, plaintext: string): Promise<boolean> {
    // An unusable hash belongs to an account with no password at all. Refusing here
    // rather than handing it to Argon2 means the sentinel can never accidentally
    // become something that matches.
    if (!storedHash.startsWith('$argon2')) return false;

    try {
      return await verify(storedHash, plaintext);
    } catch {
      // A malformed hash is a corrupt row, not a correct password.
      return false;
    }
  }

  async verifyDummy(plaintext: string): Promise<void> {
    await this.verify(await this.decoy, plaintext);
  }

  /**
   * True when the stored hash was produced with weaker parameters than the ones now
   * configured.
   *
   * The parameters are in the hash string — `$argon2id$v=19$m=19456,t=2,p=1$…` — so
   * an upgrade needs no migration column, and only ever happens at the one moment
   * the plaintext is in hand: a successful sign-in.
   */
  needsRehash(storedHash: string): boolean {
    if (storedHash === UNUSABLE_PASSWORD_HASH) return false;
    const match = /\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
    // Not argon2id at all, or unparseable: re-hash it, whatever it is.
    if (!match) return true;

    const [, memory, time] = match;
    return (
      Number(memory) < this.config.argon2.memoryCost || Number(time) < this.config.argon2.timeCost
    );
  }
}
