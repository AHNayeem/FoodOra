import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

export const graphqlConfig = registerAs('graphql', () => {
  const env = loadEnvironment();
  const isProduction = env.NODE_ENV === 'production';
  return {
    path: env.GRAPHQL_PATH,
    /**
     * Belt and braces: `validation.schema.ts` already refuses to boot a
     * production process with either of these on, and they are forced off here
     * too, so a future change to the validator cannot quietly expose the schema.
     */
    playground: env.GRAPHQL_PLAYGROUND && !isProduction,
    introspection: env.GRAPHQL_INTROSPECTION && !isProduction,
    maxDepth: env.GRAPHQL_MAX_DEPTH,
    maxComplexity: env.GRAPHQL_MAX_COMPLEXITY,
    maxComplexityAnonymous: env.GRAPHQL_MAX_COMPLEXITY_ANONYMOUS,
    schemaFile: env.GRAPHQL_SCHEMA_FILE,
    /** See `validation.schema.ts`: only the emit scripts may write the committed SDL. */
    emitSchemaFile: env.GRAPHQL_SCHEMA_EMIT,
    rateLimit: {
      authenticated: env.RATE_LIMIT_AUTHENTICATED,
      anonymous: env.RATE_LIMIT_ANONYMOUS,
    },
  } as const;
});

export type GraphqlConfig = ReturnType<typeof graphqlConfig>;
