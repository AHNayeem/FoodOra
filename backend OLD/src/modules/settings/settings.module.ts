import { Module, type OnModuleInit } from '@nestjs/common';

import { assertVocabularyMatches } from '../../infrastructure/prisma';
import { SETTINGS_READER } from '../../shared/contracts';
import { SETTING_SCOPES, SETTING_VALUE_TYPES } from '../../shared/enums';
import { RegionsModule } from '../regions/regions.module';
import { SettingsService } from './application/settings.service';
import { SETTINGS_CACHE, SETTINGS_REPOSITORY } from './domain';
import { PrismaSettingsRepository } from './infrastructure/prisma-settings.repository';
import { RedisSettingsCache } from './infrastructure/redis-settings-cache';
import { SettingsResolver } from './presentation/settings.resolver';

/**
 * Platform configuration.
 *
 * Imports `RegionsModule` for one reason: a `country`-scoped setting must name a country
 * that exists, and the database cannot check it — `Setting.scopeId` holds a country code
 * or a vendor id depending on `scope`, so there is no column to hang an FK on.
 *
 * Exports `SETTINGS_READER` rather than `SettingsService`, so every later module reads
 * configuration through a two-method contract and none of them ends up importing this
 * module's application layer to fetch one number.
 */
@Module({
  imports: [RegionsModule],
  providers: [
    SettingsService,
    SettingsResolver,
    { provide: SETTINGS_REPOSITORY, useClass: PrismaSettingsRepository },
    { provide: SETTINGS_CACHE, useClass: RedisSettingsCache },
    { provide: SETTINGS_READER, useExisting: SettingsService },
  ],
  exports: [SETTINGS_READER],
})
export class SettingsModule implements OnModuleInit {
  onModuleInit(): void {
    assertVocabularyMatches('SettingScope', SETTING_SCOPES);
    assertVocabularyMatches('SettingValueType', SETTING_VALUE_TYPES);
  }
}
