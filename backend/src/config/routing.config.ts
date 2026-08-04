import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

/**
 * Which routing provider answers "how far is it", and how it is reached.
 *
 * The list of names is deliberately longer than the list of implementations. Naming
 * `google`, `osrm`, `mapbox` and `openrouteservice` in the enum is what makes the
 * seam visible in the environment contract rather than only in the code, and it makes
 * selecting an unbuilt one a boot failure instead of a silent fall back to
 * great-circle distance. A fare computed from a straight line while the config says
 * `google` is the kind of defect that is discovered by a rider, in traffic.
 */
export const routingConfig = registerAs('routing', () => {
  const env = loadEnvironment();
  return {
    provider: env.ROUTING_PROVIDER,
    apiKey: env.ROUTING_API_KEY,
    /** Required by OSRM, which is normally self-hosted and therefore has no default host. */
    baseUrl: env.ROUTING_BASE_URL,
    timeoutMs: env.ROUTING_TIMEOUT_MS,
  } as const;
});

export type RoutingConfig = ReturnType<typeof routingConfig>;
