import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { configurations } from './configuration';
import { validateAndCache } from './environment';

/**
 * The one place `process.env` is read (D1 §Config). Everything else injects a
 * typed namespace:
 *
 * ```ts
 * constructor(@Inject(appConfig.KEY) private readonly app: AppConfig) {}
 * ```
 *
 * ESLint's `no-restricted-properties` rule makes that a lint error to bypass.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      // `.env.local` wins locally; CI and containers inject real variables and
      // have no file at all, which is why `ignoreEnvFile` is never set.
      envFilePath: ['.env.local', '.env'],
      load: [...configurations],
      validate: validateAndCache,
    }),
  ],
})
export class ConfigModule {}
