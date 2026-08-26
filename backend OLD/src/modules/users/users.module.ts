import { Module, type OnModuleInit } from '@nestjs/common';

import { assertVocabularyMatches } from '../../infrastructure/prisma';
import { NOTIFICATION_TOPICS } from '../../shared/enums';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { RegionsModule } from '../regions/regions.module';
import { AccountSettingsService } from './application/account-settings.service';
import { ProfileService } from './application/profile.service';
import { UserDirectoryService } from './application/user-directory.service';
import { USER_REPOSITORY, USER_SETTINGS_REPOSITORY } from './domain';
import { PrismaUserSettingsRepository } from './infrastructure/prisma-user-settings.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { AccountResolver } from './presentation/account.resolver';
import { UsersResolver } from './presentation/users.resolver';

/**
 * Accounts: the customer's own profile and settings, and the administrative directory.
 *
 * Three imports, each for one published contract and nothing else:
 *
 * - `RegionsModule` → `REGION_CATALOG`, because a profile's locale, currency and country are
 *   references into reference data that no FK covers.
 * - `RbacModule` → `PERMISSION_RESOLUTION`, to read a target's rank and to invalidate a cached
 *   permission set after a role or status change.
 * - `AuthModule` → `SESSION_CONTROL`, because suspending, banning or closing an account has to
 *   end its sessions *now* rather than at token expiry.
 *
 * Importing `AuthModule` is worth a second look, since it is also where the global guard chain is
 * registered. Nest deduplicates a module instance, so this does not register the guards twice —
 * and the direction is right: authentication is a lower-level concern than user administration.
 */
@Module({
  imports: [RegionsModule, RbacModule, AuthModule],
  providers: [
    ProfileService,
    AccountSettingsService,
    UserDirectoryService,
    AccountResolver,
    UsersResolver,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: USER_SETTINGS_REPOSITORY, useClass: PrismaUserSettingsRepository },
  ],
})
export class UsersModule implements OnModuleInit {
  onModuleInit(): void {
    // The camelCase notification keys are a vocabulary like any other, and this is the seam where
    // the union and the Postgres enum could drift — a topic added to one and not the other would
    // be unmappable on the first customer who saved it.
    assertVocabularyMatches('NotificationTopicKey', NOTIFICATION_TOPICS);
  }
}
