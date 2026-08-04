import { Module, type OnModuleInit } from '@nestjs/common';

import { assertVocabularyMatches } from '../../infrastructure/prisma';
import { TEXT_DIRECTIONS } from '../../shared/enums';
import { RegionsAdminService } from './application/regions-admin.service';
import { RegionsService } from './application/regions.service';
import { REGION_CATALOG, REGIONS_CACHE, REGIONS_REPOSITORY } from './domain';
import { PrismaRegionsRepository } from './infrastructure/prisma-regions.repository';
import { RedisRegionsCache } from './infrastructure/redis-regions-cache';
import { RegionsResolver } from './presentation/regions.resolver';

/**
 * Countries, languages and currencies — the reference data that makes "the platform is
 * global" a row rather than a redeploy.
 *
 * Imported *before* `AuthModule` in the composition root, because registration resolves
 * a new account's country, currency, locale and timezone through `REGION_CATALOG`.
 */
@Module({
  providers: [
    RegionsService,
    RegionsAdminService,
    RegionsResolver,
    { provide: REGIONS_REPOSITORY, useClass: PrismaRegionsRepository },
    { provide: REGIONS_CACHE, useClass: RedisRegionsCache },
    // The published contract. Other modules inject the token; only this line knows that
    // `RegionsService` is what answers it.
    { provide: REGION_CATALOG, useExisting: RegionsService },
  ],
  exports: [REGION_CATALOG],
})
export class RegionsModule implements OnModuleInit {
  onModuleInit(): void {
    assertVocabularyMatches('TextDirection', TEXT_DIRECTIONS);
  }
}
