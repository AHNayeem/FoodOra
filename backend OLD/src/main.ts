import 'reflect-metadata';

import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { appConfig, type AppConfig, graphqlConfig, type GraphqlConfig } from './config';

/**
 * Fastify rather than Express (D1): roughly twice the requests per second on
 * the JSON workload this API almost entirely is, a schema-based serialiser, and
 * a plugin model that keeps webhook raw-body handling honest.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Nginx sets the real client IP; without this every rate limit and audit
      // row is attributed to the load balancer (D10 §Nginx).
      trustProxy: true,
      // 20 MB. Uploads go direct to object storage by presigned POST, so
      // nothing legitimate arrives through here that is larger.
      bodyLimit: 20 * 1024 * 1024,
      genReqId: () => '', // pino-http owns request ids; see logger.module.ts
    }),
    // Buffer the boot logs until Pino is up, so early lines are structured too
    // and a config validation failure is not printed in a different format.
    { bufferLogs: true },
  );

  app.useLogger(app.get(PinoLogger));

  const config = app.get<AppConfig>(appConfig.KEY);
  const graphql = app.get<GraphqlConfig>(graphqlConfig.KEY);

  await app.register(helmet, {
    // The GraphQL landing page loads its assets from a CDN, so CSP has to be
    // relaxed exactly where the playground is enabled — and nowhere else.
    contentSecurityPolicy: graphql.playground ? false : undefined,
    crossOriginEmbedderPolicy: false,
  });

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true, // refresh tokens travel in an httpOnly cookie (E2)
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-request-id',
      'x-country-code',
      'x-currency',
      'x-timezone',
      'apollo-require-preflight',
      // The double-submit half of the CSRF defence on `/auth/refresh` and
      // `/auth/logout`. Omitting it made both endpoints unreachable from the web
      // app: the preflight rejects the header, so the request the cookie exists
      // for is the one request that cannot be sent (V1 Unit 0).
      'x-csrf-token',
    ],
    exposedHeaders: ['x-request-id'],
    maxAge: 86_400,
  });

  /**
   * Drain rather than drop: stop accepting connections, finish in-flight
   * requests, close the Prisma pool and the three Redis connections, then exit.
   * `terminationGracePeriodSeconds` must exceed the longest expected job so a
   * deploy cannot kill a payment capture mid-flight (D10 §Health checks).
   */
  app.enableShutdownHooks();

  await app.listen({ port: config.port, host: config.host });

  const logger = app.get(PinoLogger);
  logger.log(
    {
      url: await app.getUrl(),
      env: config.env,
      graphql: graphql.path,
      playground: graphql.playground,
      introspection: graphql.introspection,
    },
    'FoodOra API is listening',
  );
}

void bootstrap().catch((error: unknown) => {
  // The one place a bare console is correct: the logger may not exist yet, and
  // a silent exit here is the worst possible failure mode.
  console.error('Failed to start the FoodOra API:', error);
  process.exit(1);
});
