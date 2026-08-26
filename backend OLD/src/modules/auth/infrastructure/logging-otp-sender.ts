import { Inject, Injectable, Logger } from '@nestjs/common';

import { jwtConfig, type JwtConfig } from '../../../config';
import type { OtpMessage, OtpSenderPort } from '../domain';

/**
 * Prints the code to the log instead of sending it.
 *
 * This is E2's honest position on delivery: the notifications module (E8) owns
 * transports, templates, retries and the per-topic preference matrix, and writing a
 * half version of that here would guarantee two implementations to reconcile later.
 * What E2 does own — the challenge itself: peppered hash, five-minute window, five
 * attempts, single use — is real.
 *
 * The flag that enables this is refused in production by `validateEnvironment`, so
 * "an OTP in the log" cannot become "an OTP in the log aggregator". With the flag
 * off, this adapter records that a code was issued and drops it, which is the right
 * failure mode: the flow still refuses wrong codes, it simply cannot complete until
 * a transport exists.
 */
@Injectable()
export class LoggingOtpSender implements OtpSenderPort {
  private readonly logger = new Logger('OtpSender');

  constructor(@Inject(jwtConfig.KEY) private readonly config: JwtConfig) {}

  async send(message: OtpMessage): Promise<void> {
    if (!this.config.otp.logCodes) {
      this.logger.log(
        { channel: message.channel, purpose: message.purpose },
        'one-time code issued but not delivered — no transport is configured (E8)',
      );
      return;
    }

    this.logger.warn(
      {
        destination: message.destination,
        channel: message.channel,
        purpose: message.purpose,
        code: message.code,
        expiresInSeconds: message.expiresInSeconds,
      },
      'one-time code (development only — this must never appear in production)',
    );
  }
}
