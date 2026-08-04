import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters';
import { LoggingInterceptor, TimeoutInterceptor } from './common/interceptors';
import { ConfigModule } from './config';
import { GraphqlModule } from './graphql';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/prisma';
import { RedisModule } from './infrastructure/redis';
import { RoutingModule } from './infrastructure/routing';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RegionsModule } from './modules/regions/regions.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SystemModule } from './modules/system/system.module';
import { UsersModule } from './modules/users/users.module';

/**
 * The composition root.
 *
 * Import order is the boot order and it matters: configuration is validated
 * before anything can read it, and the logger exists before anything can log.
 * Feature modules go at the bottom — E2 adds `auth`, E3 `users`/`rbac`/
 * `regions`/`settings`, and so on through the 30 modules in D1.
 */
@Module({
  imports: [
    // --- foundation, in dependency order ---
    ConfigModule,
    LoggerModule,
    CommonModule,
    PrismaModule,
    RedisModule,
    /**
     * Global, and above the feature modules that inject `ROUTING_PROVIDER`: the catalog
     * needs it for a listing label and delivery will need it for fares. It also refuses
     * to boot when `ROUTING_PROVIDER` names a provider nobody has implemented, which is
     * a failure worth having early rather than at the first fare.
     */
    RoutingModule,
    GraphqlModule,
    HealthModule,

    // --- feature modules ---
    SystemModule,
    /**
     * `RegionsModule` comes before `AuthModule` because registration resolves a new
     * account's country, currency, locale and timezone through `REGION_CATALOG`.
     */
    RegionsModule,
    /**
     * `AuthModule` also registers the global guard chain, so every module imported
     * after it is protected by default. `RbacModule` is listed explicitly even though
     * `AuthModule` imports it: E3 gave it resolvers, and a module that owns HTTP
     * surface belongs in the composition root.
     */
    RbacModule,
    AuthModule,
    // --- E3 ---
    UsersModule,
    SettingsModule,
    /**
     * V1 Unit 1. Its queries are `@Public()`, which only means anything because the
     * guard chain `AuthModule` registered above is already in force.
     */
    CatalogModule,
    /**
     * V1 Unit 2. Also `@Public()` — a basket predates a customer — and it imports
     * `CatalogModule` for the two by-id lookups that let it price a line from stored
     * rows instead of from the request.
     */
    CartModule,
    /**
     * V1 Unit 3. `checkoutSummary` is public — pricing a basket needs no account — and
     * `placeOrder` is not, because `orders.userId` is the only owner column there is.
     */
    OrdersModule,
  ],
  providers: [
    /**
     * Global by provider rather than by `app.useGlobalFilters()`, because these
     * need injection — the filter reads config, and `useGlobalFilters` would
     * force manual construction outside the container.
     */
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
