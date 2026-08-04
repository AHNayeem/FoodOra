import { Controller, Get, Header, Inject } from '@nestjs/common';

import { Public } from '../../../common/decorators';
import { type JsonWebKey, TOKEN_SIGNER, type TokenSignerPort } from '../domain';

/**
 * `GET /.well-known/jwks.json` — the public half of the signing key.
 *
 * The whole reason for choosing RS256 over an HMAC. With a shared secret, anything that
 * can *verify* a token can also *mint* one, so the first additional service to need
 * authentication becomes a privilege boundary that does not hold. Publishing a JWKS
 * means a future service — an Nginx `auth_request`, an analytics reader, a webhook
 * gateway — verifies tokens with material that grants it nothing.
 *
 * Public by definition: a public key is public. What it does *not* contain is the
 * private exponent, and `exportJWK` on a public key cannot emit one.
 *
 * `Cache-Control` is five minutes rather than a day: it has to be short enough that a
 * key rotation propagates without a cache purge, and long enough that a verifier is not
 * fetching it per request. Both keys are published while a rotation is in flight, so a
 * consumer holding a five-minute-old copy still verifies every live token.
 */
@Controller()
export class JwksController {
  constructor(@Inject(TOKEN_SIGNER) private readonly signer: TokenSignerPort) {}

  @Public()
  @Get('.well-known/jwks.json')
  @Header('cache-control', 'public, max-age=300')
  async jwks(): Promise<{ keys: JsonWebKey[] }> {
    return { keys: await this.signer.publicKeys() };
  }
}
