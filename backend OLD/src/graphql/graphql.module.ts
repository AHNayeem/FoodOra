import { join } from 'node:path';

import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import {
  ApolloServerPluginLandingPageLocalDefault,
} from '@apollo/server/plugin/landingPage/default';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { appConfig, type AppConfig, ConfigModule, graphqlConfig, type GraphqlConfig } from '../config';
import { ComplexityPlugin } from './complexity.plugin';
import { depthLimit } from './depth-limit.rule';
import { formatGraphQLError } from './error-formatter';

/**
 * Schema assembly (D5).
 *
 * **Code-first**, so the TypeScript types and the schema cannot drift, with the
 * SDL emitted to `schema.gql` and committed — the diff on that file is what CI
 * checks to catch a breaking change before the frontend meets it.
 */
@Module({
  imports: [
    NestGraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule],
      inject: [appConfig.KEY, graphqlConfig.KEY],
      useFactory: (app: AppConfig, config: GraphqlConfig): ApolloDriverConfig => ({
        path: config.path,

        /**
         * `true` means "build the schema in memory"; a path means "build it and write
         * the SDL there".
         *
         * Writing is now opt-in via `GRAPHQL_SCHEMA_EMIT`, which only `schema:emit`
         * and `schema:check` set. Two reasons, and the second is the one that bit:
         *
         * 1. In production the SDL is baked into the image and the filesystem is
         *    read-only, so writing at boot is at best pointless.
         * 2. **The two writers did not agree.** `nest start` compiles through the
         *    `@nestjs/graphql` CLI plugin, whose `introspectComments` option lifts
         *    JSDoc into schema descriptions; `schema:emit` runs under bun with no
         *    such transform, so it emits the same schema *without* them. Whichever
         *    ran last won, `schema:check` then failed, and a developer with the dev
         *    server up got a dirty working tree they did not cause. Boot no longer
         *    writes at all, so the committed file has exactly one author.
         *
         * `introspectComments` is off in `nest-cli.json` for the same reason: its
         * `typeFileNameSuffix` list (`.input.ts`, `.model.ts`) does not match this
         * project's plural convention (`cart.inputs.ts`, `cart.models.ts`), so it was
         * lifting JSDoc from exactly one accidental file and leaving ninety others
         * alone. Descriptions that belong in the API are written explicitly, which is
         * both consistent and reviewable.
         */
        autoSchemaFile:
          config.emitSchemaFile && !app.isProduction
            ? join(process.cwd(), config.schemaFile)
            : true,
        sortSchema: true,

        introspection: config.introspection,
        // Apollo Server 4+ has no built-in playground; the landing page plugin
        // below is the replacement, and it is off wherever introspection is.
        playground: false,
        plugins: [
          config.playground
            ? ApolloServerPluginLandingPageLocalDefault({ footer: false })
            : ApolloServerPluginLandingPageDisabled(),
        ],

        /** Depth is checked during validation, before a resolver can run. */
        validationRules: [depthLimit(config.maxDepth)],

        formatError: formatGraphQLError(app.isProduction),

        /**
         * Note there is no `resolvers: { DateTime, Money, … }` map here.
         *
         * That is an SDL-first mechanism. Code-first embeds the
         * `GraphQLScalarType` instance directly from `@Field(() =>
         * DateTimeScalar)`, and listing a scalar in `resolvers` that no field
         * references fails schema assembly with "defined in resolvers, but not
         * in schema". `scalars.registry.ts` remains the single catalogue of
         * what the API speaks; fields reference the instances from it.
         */
        buildSchemaOptions: {
          // `Money` is a Float-serialised Decimal; leaving the default `Int`
          // mode would silently truncate ৳12.50 to 12.
          numberScalarMode: 'float',
        },

        /**
         * Guards and interceptors run on field resolvers too — that is what
         * makes `@Sensitive()` field middleware and per-field authorization
         * possible. Pipes are excluded deliberately: validating the same input
         * once per field is pure overhead (D5 §Performance).
         */
        fieldResolverEnhancers: ['guards', 'interceptors'],

        /**
         * Rejects requests that a browser could have sent from another origin
         * with a simple form post. Clients must send `content-type:
         * application/json`, which a cross-origin form cannot.
         */
        csrfPrevention: true,

        /**
         * The request and the reply, under the names the rest of the codebase reads
         * (`common/guards/execution-request.ts`).
         *
         * **Two positional arguments, not one object.** `@nestjs/apollo` hands this
         * function straight to `fastifyApolloHandler`, whose contract is
         * `ApolloFastifyContextFunctionArgument = [request, reply]` — so a factory
         * written as `({ req, reply }) => …` destructures off the *FastifyRequest*
         * and yields two `undefined`s. Fastify v4 dropped `request.req` (it is
         * `request.raw` now) and never had `request.reply`, so nothing throws at the
         * boundary; the failure surfaces much later, as `undefined.header(...)` in
         * `auth/presentation/cookies.ts` on sign-in, and as a guard that reads
         * headers off `undefined` on every authenticated operation. That was V1 Unit
         * 2's blocking defect, and it went unnoticed because everything integrated
         * up to that point was `@Public()` and read no cookies.
         *
         * The Express driver *does* pass `{ req, res }`, which is where the object
         * shape comes from and why the mistake is easy to make on Fastify.
         */
        context: (request: FastifyRequest, reply: FastifyReply) => ({ req: request, reply }),
      }),
    }),
  ],
  providers: [ComplexityPlugin],
})
export class GraphqlModule {}
