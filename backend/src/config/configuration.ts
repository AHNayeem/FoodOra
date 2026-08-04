import { appConfig } from './app.config';
import { cartConfig } from './cart.config';
import { catalogConfig } from './catalog.config';
import { checkoutConfig } from './checkout.config';
import { databaseConfig } from './database.config';
import { graphqlConfig } from './graphql.config';
import { jwtConfig } from './jwt.config';
import { notificationConfig } from './notification.config';
import { observabilityConfig } from './observability.config';
import { paymentConfig } from './payment.config';
import { redisConfig } from './redis.config';
import { routingConfig } from './routing.config';
import { storageConfig } from './storage.config';

/**
 * The whole configuration tree, in load order. Adding a namespace means adding
 * it here and nowhere else.
 */
export const configurations = [
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  storageConfig,
  paymentConfig,
  notificationConfig,
  graphqlConfig,
  observabilityConfig,
  catalogConfig,
  routingConfig,
  cartConfig,
  checkoutConfig,
] as const;

/**
 * Configuration is read-only once the process is up. Freezing makes an
 * accidental `config.app.port = …` a `TypeError` in development instead of a
 * mystery in production.
 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      // Skip getters — reading them here would defeat their laziness.
      if (descriptor && 'value' in descriptor) {
        deepFreeze(descriptor.value);
      }
    }
  }
  return value;
}
