/**
 * E3's verification harness.
 *
 *   bun run verify:core
 *
 * This machine has no PostgreSQL and no Redis, so the parts of E3 that can be proved are proved
 * here rather than described as working. The things worth proving are not the CRUD — they are the
 * **pure decision functions**, because those are where a subtle mistake has consequences that
 * nothing else would catch:
 *
 * - the **escalation policy**, where being wrong means a moderator can make themselves a
 *   super-admin;
 * - **setting resolution**, where being wrong means a `false` silently loses to a `true` default;
 * - the **required-notification rule**, where being wrong means a customer stops getting receipts;
 * - the **language-set invariant**, where being wrong means a market renders in a language it does
 *   not read.
 *
 * Each of those is pure by design, so each can be exercised with a handful of literals and no
 * container. The repositories are in-memory fakes behind the real ports, which is what
 * ports-and-adapters buys: `UserDirectoryService`'s rank check is a decision about orderings and
 * invalidation, and it can be tested without a database precisely because it never mentions one.
 *
 * What is **not** proved here is the SQL: the `where` builders, the conditional writes, the unique
 * indexes with nullable members. Those need Postgres, and E11 is where they get it.
 *
 * Deliberately not a test framework — E11 owns the committed suite. This is a script with
 * assertions, in the shape of E1's extension harness and E2's `verify-auth.ts`.
 */
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/foodora';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OTP_PEPPER ??= 'harness-pepper';

import { IdService } from '../src/common/ids';
import { PERMISSION_WILDCARD } from '../src/shared/contracts';
import { FakeClock, isOk } from '../src/shared/kernel';
import {
  isPermissionSlug,
  PERMISSION_CATALOGUE,
  PERMISSION_RESOURCES,
  PERMISSION_SLUGS,
} from '../src/shared/permissions';
import {
  BUILTIN_ROLES,
  canAdministerRank,
  canGrantPermissions,
  checkExpiry,
  highestRank,
  isValidRoleSlug,
  notSelf,
  rankOf,
  type RbacActor,
  resolveAuthorization,
} from '../src/modules/rbac/domain';
import {
  catalogueDefaults,
  resolveAll,
  resolveOne,
  scopeAllowed,
  SETTINGS_CATALOGUE,
  type SettingRecord,
  valueMatchesType,
} from '../src/modules/settings/domain';
import {
  attemptedRequiredOptOut,
  canAdminister,
  defaultSettings,
  enforceRequiredChannels,
  isSuperAdminRole,
  mergeSettings,
  statusEndsSessions,
  type UserProfile,
  type UserRepositoryPort,
} from '../src/modules/users/domain';
import {
  defaultLanguageOf,
  isCountryCode,
  isCurrencyCode,
  isDialCode,
  isLocaleCode,
  isTimezone,
  normaliseCountryCode,
  normaliseLanguageSet,
} from '../src/modules/regions/domain';
import { RegionsService } from '../src/modules/regions/application/regions.service';
import { UserDirectoryService } from '../src/modules/users/application/user-directory.service';
import { AccountSettingsService } from '../src/modules/users/application/account-settings.service';
import { NOTIFICATION_TOPICS, USER_ROLES } from '../src/shared/enums';
import { assertVocabularyMatches, enumCodec } from '../src/infrastructure/prisma';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(label);
  console.error(`  ✗ ${label}`);
}

function equal<T>(label: string, actual: T, expected: T): void {
  check(
    `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`,
    actual === expected,
  );
}

function section(title: string): void {
  console.log(`\n${title}`);
}

const NOW = Date.parse('2026-08-03T10:00:00.000Z');

// ---------------------------------------------------------------------------
// Fakes. Each implements a real port, so a signature change breaks this file.
// ---------------------------------------------------------------------------

class FakeUsers implements UserRepositoryPort {
  rows = new Map<string, UserProfile>();

  seed(user: Partial<UserProfile> & { id: string }): UserProfile {
    const full: UserProfile = {
      name: 'Seed User',
      email: `${user.id}@example.test`,
      phone: null,
      avatar: '',
      primaryRole: 'customer',
      status: 'active',
      countryCode: 'BD',
      currency: 'BDT',
      locale: 'en',
      timezone: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      isVerified: false,
      lastLoginAt: null,
      marketingOptIn: false,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
      deletedAt: null,
      ...user,
    };
    this.rows.set(full.id, full);
    return full;
  }

  async findById(userId: string, includeDeleted = false) {
    const row = this.rows.get(userId);
    if (!row) return null;
    return row.deletedAt && !includeDeleted ? null : row;
  }

  async list() {
    const items = [...this.rows.values()].filter((row) => row.deletedAt === null);
    return { items, total: items.length, page: 1, pageSize: 12, hasMore: false };
  }

  async updateProfile(userId: string, patch: Record<string, unknown>) {
    const row = this.rows.get(userId);
    if (!row) throw new Error('no such user');
    const next = { ...row, ...patch };
    this.rows.set(userId, next);
    return next;
  }

  async phoneTaken() {
    return false;
  }

  async setStatus(userId: string, status: UserProfile['status']) {
    return this.updateProfile(userId, { status });
  }

  async setPrimaryRole(userId: string, role: UserProfile['primaryRole']) {
    return this.updateProfile(userId, { primaryRole: role });
  }

  async close(userId: string) {
    const row = this.rows.get(userId);
    if (!row || row.deletedAt) return false;
    this.rows.set(userId, { ...row, deletedAt: new Date(NOW) });
    return true;
  }

  async reopen(userId: string) {
    const row = this.rows.get(userId);
    if (!row?.deletedAt) return false;
    this.rows.set(userId, { ...row, deletedAt: null });
    return true;
  }
}

/** Records what was asked of it, so the harness can assert side effects rather than guess. */
class FakeSessionControl {
  calls: Array<{ userId: string; reason: string }> = [];

  async revokeAllSessions(userId: string, reason: string) {
    this.calls.push({ userId, reason });
    return 2;
  }
}

class FakePermissions {
  invalidated: string[] = [];
  roles = new Map<string, string[]>();

  async resolve(userId: string) {
    const roles = this.roles.get(userId) ?? ['customer'];
    return {
      userId,
      status: 'active' as const,
      roles,
      permissions: [],
      vendorIds: [],
      permHash: '00000000',
    };
  }

  async invalidate(userId: string) {
    this.invalidated.push(userId);
  }
}

const fakeUnitOfWork = {
  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  },
};

async function main(): Promise<void> {
  const clock = new FakeClock(NOW);
  void new IdService(clock);

  // =========================================================================
  section('Permission catalogue');

  equal('catalogue has no duplicate slugs', new Set(PERMISSION_SLUGS).size, PERMISSION_SLUGS.length);
  check('every slug is resource:action', PERMISSION_CATALOGUE.every((p) => p.slug === `${p.resource}:${p.action}`));
  check('every slug is recognised by isPermissionSlug', PERMISSION_SLUGS.every(isPermissionSlug));
  equal('an unknown slug is refused', isPermissionSlug('users:wirte'), false);
  check('resources are de-duplicated', new Set(PERMISSION_RESOURCES).size === PERMISSION_RESOURCES.length);
  check('every permission carries a description', PERMISSION_CATALOGUE.every((p) => p.description.length > 10));

  /**
   * The Phase C demo accounts display `["vendor:manage", "menu:edit", "orders:view"]` and
   * `["deliveries:accept", "earnings:view"]`. If the catalogue were not a superset of those, the
   * cutover would quietly shorten what the account page shows.
   */
  for (const slug of ['vendor:manage', 'menu:edit', 'orders:view', 'deliveries:accept', 'earnings:view']) {
    check(`Phase C's "${slug}" is in the catalogue`, isPermissionSlug(slug));
  }

  // =========================================================================
  section('Built-in roles and rank');

  const ranked = new Set(BUILTIN_ROLES.map((role) => role.slug));
  check('every UserRole has a rank', USER_ROLES.every((slug) => ranked.has(slug)));
  equal('super-admin is the top of the ladder', Math.max(...BUILTIN_ROLES.map((r) => r.rank)), rankOf('super-admin'));
  equal('guest is the bottom', rankOf('guest'), 0);
  equal('an unrecognised role ranks 0', rankOf('not-a-role'), 0);
  check(
    'every built-in role only grants catalogue permissions',
    BUILTIN_ROLES.every((role) => role.permissions.every(isPermissionSlug)),
  );
  equal(
    'super-admin grants nothing explicitly — the wildcard does it',
    BUILTIN_ROLES.find((r) => r.slug === 'super-admin')?.permissions.length,
    0,
  );
  equal('highestRank picks the maximum', highestRank(['customer', 'moderator', 'guest']), rankOf('moderator'));
  equal('highestRank of nothing is 0', highestRank([]), 0);

  // =========================================================================
  section('Escalation policy — the rules that stop self-promotion');

  const moderator: RbacActor = { id: 'usr_mod', roles: ['moderator'], permissions: ['users:read', 'users:status'] };
  const superAdmin: RbacActor = { id: 'usr_root', roles: ['super-admin'], permissions: [PERMISSION_WILDCARD] };

  check('a moderator may administer a role below them', isOk(canAdministerRank(moderator, rankOf('customer'))));
  equal(
    'a moderator may NOT administer super-admin',
    isOk(canAdministerRank(moderator, rankOf('super-admin'))),
    false,
  );
  equal(
    'a moderator may NOT administer their own rank (no lateral moves)',
    isOk(canAdministerRank(moderator, rankOf('moderator'))),
    false,
  );
  check('a super-admin may administer any rank', isOk(canAdministerRank(superAdmin, 100)));

  check('a moderator may grant a permission they hold', isOk(canGrantPermissions(moderator, ['users:read'])));
  equal(
    'a moderator may NOT grant a permission they lack',
    isOk(canGrantPermissions(moderator, ['settings:write'])),
    false,
  );
  const unheld = canGrantPermissions(moderator, ['settings:write', 'users:read', 'roles:delete']);
  check(
    'every unheld permission is reported, not just the first',
    !unheld.ok && Array.isArray(unheld.error.params?.permissions) &&
      (unheld.error.params.permissions as string[]).length === 2,
  );
  check('the wildcard grants everything', isOk(canGrantPermissions(superAdmin, [...PERMISSION_SLUGS])));

  equal('nobody may administer themselves', isOk(notSelf(moderator, 'usr_mod')), false);
  equal('not even a super-admin', isOk(notSelf(superAdmin, 'usr_root')), false);
  check('administering somebody else is fine', isOk(notSelf(moderator, 'usr_other')));

  check('a valid custom slug passes', isValidRoleSlug('weekend-supervisor'));
  equal('an uppercase slug is refused', isValidRoleSlug('Weekend'), false);
  equal('a trailing dash is refused', isValidRoleSlug('weekend-'), false);
  equal('a leading digit is refused', isValidRoleSlug('1st-shift'), false);

  check('a null expiry is fine', isOk(checkExpiry(null, clock.date())));
  check('a future expiry is fine', isOk(checkExpiry(new Date(NOW + 60_000), clock.date())));
  equal('a past expiry is refused', isOk(checkExpiry(new Date(NOW - 1), clock.date())), false);
  equal('an expiry of exactly now is refused', isOk(checkExpiry(new Date(NOW), clock.date())), false);

  // =========================================================================
  section('Authorization resolution still holds (E2 algebra, E3 inputs)');

  const withCustomRole = resolveAuthorization({
    userId: 'usr_1',
    status: 'active',
    primaryRole: 'customer',
    roleGrants: [
      { roleSlug: 'weekend-supervisor', vendorId: 'ven_1', expiresAt: null, permissions: ['menu:edit'] },
    ],
    directGrants: [{ permissionSlug: 'menu:edit', effect: false, vendorId: null, expiresAt: null }],
    now: clock.date(),
  });
  equal('a direct denial beats a custom role grant', withCustomRole.permissions.includes('menu:edit'), false);
  check('primaryRole is always in the resolved set', withCustomRole.roles.includes('customer'));
  check('a custom role appears alongside it', withCustomRole.roles.includes('weekend-supervisor'));
  check('vendor scope is collected', withCustomRole.vendorIds.includes('ven_1'));

  // =========================================================================
  section('Settings catalogue and resolution');

  const keys = SETTINGS_CATALOGUE.map((d) => d.key);
  equal('no duplicate setting keys', new Set(keys).size, keys.length);
  check(
    'every default matches its declared type',
    SETTINGS_CATALOGUE.every((d) => valueMatchesType(d.defaultValue, d.valueType)),
  );
  check('every catalogue key resolves against an EMPTY table', keys.every((key) => resolveOne(key, { rows: [] }) !== null));
  check(
    'and resolves to its declared default',
    SETTINGS_CATALOGUE.every((d) => resolveOne(d.key, { rows: [] })?.value === d.defaultValue),
  );
  equal('an undeclared key resolves to null', resolveOne('not.a.key', { rows: [] }), null);
  equal('catalogueDefaults covers every key', Object.keys(catalogueDefaults()).length, keys.length);

  const row = (
    scope: SettingRecord['scope'],
    scopeId: string | null,
    key: string,
    value: unknown,
  ): SettingRecord => ({
    id: `set_${scope}_${key}`,
    scope,
    scopeId,
    key,
    valueType: SETTINGS_CATALOGUE.find((d) => d.key === key)?.valueType ?? 'string',
    value,
    isPublic: true,
    description: null,
    updatedAt: new Date(NOW),
    updatedBy: null,
  });

  const layered = [
    row('platform', null, 'orders.cancelWindowMinutes', 5),
    row('country', 'BD', 'orders.cancelWindowMinutes', 10),
    row('vendor', 'ven_1', 'orders.cancelWindowMinutes', 2),
  ];

  equal(
    'vendor beats country beats platform',
    resolveOne('orders.cancelWindowMinutes', { rows: layered, countryCode: 'BD', vendorId: 'ven_1' })?.value,
    2,
  );
  equal(
    'country beats platform when there is no vendor row',
    resolveOne('orders.cancelWindowMinutes', { rows: layered, countryCode: 'BD' })?.value,
    10,
  );
  equal(
    'platform answers when neither matches',
    resolveOne('orders.cancelWindowMinutes', { rows: layered, countryCode: 'DE' })?.value,
    5,
  );
  equal(
    'a vendor row for a DIFFERENT vendor does not leak',
    resolveOne('orders.cancelWindowMinutes', { rows: layered, vendorId: 'ven_other' })?.value,
    5,
  );
  equal(
    'provenance is reported',
    resolveOne('orders.cancelWindowMinutes', { rows: layered, countryCode: 'BD' })?.scope,
    'country',
  );
  equal(
    'isDefault is false when a row answered',
    resolveOne('orders.cancelWindowMinutes', { rows: layered })?.isDefault,
    false,
  );
  equal('isDefault is true when the catalogue answered', resolveOne('platform.name', { rows: [] })?.isDefault, true);

  /**
   * The two cases a naive `||` chain gets wrong. A configured `false` must beat a `true` default,
   * and a configured `0` must beat a non-zero one — both are values, not absences.
   */
  equal(
    'a configured FALSE overrides a true default',
    resolveOne('accounts.allowRegistration', { rows: [row('platform', null, 'accounts.allowRegistration', false)] })
      ?.value,
    false,
  );
  equal(
    'a configured ZERO overrides a non-zero default',
    resolveOne('orders.cancelWindowMinutes', { rows: [row('platform', null, 'orders.cancelWindowMinutes', 0)] })?.value,
    0,
  );

  /** A row whose stored value no longer matches the declared type is skipped, not thrown on. */
  const mistyped = [row('country', 'BD', 'orders.cancelWindowMinutes', 'ten'), layered[0]];
  equal(
    'a type-mismatched row is skipped and the next layer answers',
    resolveOne('orders.cancelWindowMinutes', { rows: mistyped, countryCode: 'BD' })?.value,
    5,
  );

  equal('resolveAll covers the whole catalogue', resolveAll({ rows: [] }).length, SETTINGS_CATALOGUE.length);
  check(
    'operator-only keys exist and are marked',
    resolveAll({ rows: [] }).some((r) => !r.isPublic),
  );

  equal('platform scope is always allowed', scopeAllowed('accounts.retentionDaysAfterClose', 'platform'), true);
  equal(
    'a platform-only key refuses country scope',
    scopeAllowed('accounts.retentionDaysAfterClose', 'country'),
    false,
  );
  equal('a per-vendor key allows vendor scope', scopeAllowed('orders.cancelWindowMinutes', 'vendor'), true);
  equal('an unknown key allows nothing', scopeAllowed('not.a.key', 'platform'), false);

  equal('null matches no type, including json', valueMatchesType(null, 'json'), false);
  equal('NaN is not a number', valueMatchesType(Number.NaN, 'number'), false);
  equal('Infinity is not a number', valueMatchesType(Number.POSITIVE_INFINITY, 'number'), false);
  equal('a bare scalar is not json', valueMatchesType('x', 'json'), false);
  check('an object is json', valueMatchesType({ a: 1 }, 'json'));
  check('an array is json', valueMatchesType([1], 'json'));

  // =========================================================================
  section('Region code policies');

  check('BD is a country code', isCountryCode('BD'));
  equal('bd is not (codes are stored uppercase)', isCountryCode('bd'), false);
  equal('BGD is not alpha-2', isCountryCode('BGD'), false);
  check('normalisation makes "bd" usable', isCountryCode(normaliseCountryCode(' bd ')));
  check('BDT is a currency code', isCurrencyCode('BDT'));
  equal('BD is not a currency code', isCurrencyCode('BD'), false);
  check('"en" is a locale', isLocaleCode('en'));
  check('"pt-BR" is a locale', isLocaleCode('pt-BR'));
  check('"zh-Hant" is a locale', isLocaleCode('zh-Hant'));
  equal('"EN" is not (locales keep their conventional casing)', isLocaleCode('EN'), false);
  equal('an over-long locale is refused', isLocaleCode('en-GB-oed-x'), false);
  check('"+880" is a dial code', isDialCode('+880'));
  equal('"880" is not', isDialCode('880'), false);
  equal('"+0" is not', isDialCode('+0'), false);
  check('"Asia/Dhaka" is a zone', isTimezone('Asia/Dhaka'));
  check('"UTC" is a zone', isTimezone('UTC'));
  check('a three-part zone is a zone', isTimezone('America/Argentina/Buenos_Aires'));
  equal('an injection attempt is not a zone', isTimezone("Asia/Dhaka'; DROP"), false);

  // =========================================================================
  section('Language sets — exactly one default');

  const single = normaliseLanguageSet([{ languageCode: 'bn', isDefault: false, sort: 0 }]);
  check('a single language defaults itself', single.ok && single.data[0].isDefault);

  const two = normaliseLanguageSet([
    { languageCode: 'en', isDefault: false, sort: 1 },
    { languageCode: 'bn', isDefault: true, sort: 0 },
  ]);
  check('the declared default is honoured', two.ok && defaultLanguageOf(two.data) === 'bn');
  check('and sorts first', two.ok && two.data[0].languageCode === 'bn');
  check('sort is renumbered densely', two.ok && two.data.every((entry, index) => entry.sort === index));

  const ambiguous = normaliseLanguageSet([
    { languageCode: 'en', isDefault: true, sort: 0 },
    { languageCode: 'bn', isDefault: true, sort: 1 },
  ]);
  equal('two claimed defaults is refused, not guessed', ambiguous.ok, false);

  const duplicated = normaliseLanguageSet([
    { languageCode: 'en', isDefault: false, sort: 0 },
    { languageCode: 'en', isDefault: true, sort: 1 },
  ]);
  check('a duplicate collapses to one entry', duplicated.ok && duplicated.data.length === 1);
  check('and last-write-wins on its flags', duplicated.ok && duplicated.data[0].isDefault);

  equal('an empty set is refused', normaliseLanguageSet([]).ok, false);
  equal('defaultLanguageOf finds nothing in an empty set', defaultLanguageOf([]), null);

  // =========================================================================
  section('Customer settings — merge, and what cannot be switched off');

  const defaults = defaultSettings();
  check('order receipts are on by default', defaults.notifications.orderUpdates.email);
  equal('promotions are OFF by default', defaults.notifications.promotions.email, false);
  equal('order activity is not shared by default', defaults.privacy.shareOrderActivity, false);
  equal('every topic has a default', Object.keys(defaults.notifications).length, NOTIFICATION_TOPICS.length);

  const oneToggle = mergeSettings(defaults, { notifications: { promotions: { email: true } } });
  check('a single toggle is applied', oneToggle.notifications.promotions.email);
  equal('and its siblings are untouched', oneToggle.notifications.promotions.push, false);
  equal('and other topics are untouched', oneToggle.notifications.deliveryAlerts.push, true);
  equal('and privacy is untouched', oneToggle.privacy.saveSearchHistory, true);

  const partialPrivacy = mergeSettings(defaults, { privacy: { shareOrderActivity: true } });
  check('a partial privacy write merges', partialPrivacy.privacy.shareOrderActivity);
  check('leaving the rest alone', partialPrivacy.privacy.saveSearchHistory);

  const optOut = mergeSettings(defaults, { notifications: { orderUpdates: { email: false } } });
  check('a required channel cannot be switched off by a merge', optOut.notifications.orderUpdates.email);
  check(
    'and the attempt is detectable for logging',
    attemptedRequiredOptOut({ notifications: { orderUpdates: { email: false } } }).length === 1,
  );
  equal(
    'switching off a non-required channel is not flagged',
    attemptedRequiredOptOut({ notifications: { promotions: { email: false } } }).length,
    0,
  );
  check(
    'a required channel is forced on even when read from a bad row',
    enforceRequiredChannels({
      ...defaults.notifications,
      orderUpdates: { email: false, push: false, sms: false },
    }).orderUpdates.email,
  );
  equal(
    'and enforcement does not turn on anything else',
    enforceRequiredChannels({
      ...defaults.notifications,
      orderUpdates: { email: false, push: false, sms: false },
    }).orderUpdates.push,
    false,
  );

  // =========================================================================
  section('Administration policy');

  const admin = { id: 'usr_mod', rank: rankOf('moderator'), isSuperAdmin: false };
  const customerTarget = { id: 'usr_1', rank: rankOf('customer'), status: 'active' as const, isDeleted: false };
  const financeTarget = { id: 'usr_2', rank: rankOf('finance-manager'), status: 'active' as const, isDeleted: false };

  check('a moderator may administer a customer', isOk(canAdminister(admin, customerTarget)));
  equal('but not a finance manager', isOk(canAdminister(admin, financeTarget)), false);
  equal('and never themselves', isOk(canAdminister(admin, { ...customerTarget, id: 'usr_mod' })), false);
  check(
    'a super-admin may administer another super-admin',
    isOk(
      canAdminister(
        { id: 'usr_root', rank: 100, isSuperAdmin: true },
        { id: 'usr_root2', rank: 100, status: 'active', isDeleted: false },
      ),
    ),
  );
  equal(
    'but still not themselves',
    isOk(
      canAdminister(
        { id: 'usr_root', rank: 100, isSuperAdmin: true },
        { id: 'usr_root', rank: 100, status: 'active', isDeleted: false },
      ),
    ),
    false,
  );

  check('suspended ends sessions', statusEndsSessions('suspended'));
  check('banned ends sessions', statusEndsSessions('banned'));
  equal('pending does not', statusEndsSessions('pending'), false);
  equal('active does not', statusEndsSessions('active'), false);
  check('super-admin is detected in a role set', isSuperAdminRole(['customer', 'super-admin']));
  equal('and not hallucinated', isSuperAdminRole(['customer', 'moderator']), false);

  // =========================================================================
  section('UserDirectoryService — side effects, through the real ports');

  const users = new FakeUsers();
  const sessionControl = new FakeSessionControl();
  const permissions = new FakePermissions();

  users.seed({ id: 'usr_customer' });
  users.seed({ id: 'usr_finance', primaryRole: 'finance-manager' });
  permissions.roles.set('usr_customer', ['customer']);
  permissions.roles.set('usr_finance', ['finance-manager']);

  const directory = new UserDirectoryService(
    users,
    permissions,
    sessionControl,
    fakeUnitOfWork,
  );
  const actor = { id: 'usr_mod', roles: ['moderator'], permissions: ['users:status', 'users:delete'] };

  const suspend = await directory.setStatus(actor, 'usr_customer', 'suspended');
  check('suspending a customer succeeds', suspend.ok);
  equal('and ends every session', sessionControl.calls.length, 1);
  equal('with reason "admin"', sessionControl.calls[0]?.reason, 'admin');
  check('and drops the cached authorization', permissions.invalidated.includes('usr_customer'));

  const again = await directory.setStatus(actor, 'usr_customer', 'suspended');
  equal('re-suspending is refused as unchanged', again.ok, false);
  equal('and does not revoke again', sessionControl.calls.length, 1);

  const overReach = await directory.setStatus(actor, 'usr_finance', 'banned');
  equal('a moderator cannot ban a finance manager', overReach.ok, false);
  equal('and nothing was revoked', sessionControl.calls.length, 1);

  const reinstate = await directory.setStatus(actor, 'usr_customer', 'active');
  check('reinstating succeeds', reinstate.ok);
  equal('and does NOT revoke sessions (nobody is being cut off)', sessionControl.calls.length, 1);

  /**
   * A role change must invalidate the permission cache but must NOT sign the person out — a rider
   * promoted mid-shift keeps working, and E2's per-request resolution is what makes the new role
   * apply on their next call.
   */
  permissions.invalidated = [];
  const promote = await directory.setPrimaryRole(actor, 'usr_customer', 'delivery-rider');
  check('a moderator may promote a customer to rider', promote.ok);
  check('the cache is invalidated', permissions.invalidated.includes('usr_customer'));
  equal('and no session was revoked', sessionControl.calls.length, 1);

  const selfPromote = await directory.setPrimaryRole(actor, 'usr_customer', 'super-admin');
  equal('but NOT to super-admin — the granted rank is checked too', selfPromote.ok, false);

  const closeOwn = await directory.closeAccount(actor, 'usr_mod');
  equal('an admin cannot close their own account through the directory', closeOwn.ok, false);

  const closed = await directory.closeAccount(actor, 'usr_customer');
  check('closing a customer succeeds', closed.ok);
  equal('and ends their sessions', sessionControl.calls.length, 2);
  equal('a closed account is invisible to a normal read', await users.findById('usr_customer'), null);
  check('but visible with includeDeleted', (await users.findById('usr_customer', true)) !== null);

  const reopened = await directory.reopenAccount(actor, 'usr_customer');
  check('reopening a closed account succeeds', reopened.ok);
  check('and it is visible again', (await users.findById('usr_customer')) !== null);
  equal('reopening a live account is refused', (await directory.reopenAccount(actor, 'usr_customer')).ok, false);

  // =========================================================================
  section('AccountSettingsService — closing your own account');

  const settingsStore = new Map<string, ReturnType<typeof defaultSettings>>();
  const fakeSettingsRepo = {
    async read(userId: string) {
      return settingsStore.get(userId) ?? defaultSettings();
    },
    async write(userId: string, value: ReturnType<typeof defaultSettings>) {
      settingsStore.set(userId, value);
      return value;
    },
  };

  const selfSessions = new FakeSessionControl();
  const selfPermissions = new FakePermissions();
  users.seed({ id: 'usr_self' });

  const account = new AccountSettingsService(
    fakeSettingsRepo,
    users,
    selfSessions,
    selfPermissions,
  );

  const saved = await account.update('usr_self', { notifications: { orderUpdates: { email: false } } });
  check('saving settings succeeds', saved.ok);
  check('and the required channel comes back ON', saved.ok && saved.data.notifications.orderUpdates.email);
  check('the stored copy is corrected too', (await account.read('usr_self')).notifications.orderUpdates.email);

  const selfClose = await account.closeAccount('usr_self', 'moving away');
  check('closing your own account succeeds', selfClose.ok);
  equal('sessions end with reason "logout", not "admin"', selfSessions.calls[0]?.reason, 'logout');
  check('and the cached authorization is dropped', selfPermissions.invalidated.includes('usr_self'));
  equal('closing twice is refused', (await account.closeAccount('usr_self', '')).ok, false);

  // =========================================================================
  section('RegionsService — degradation when reference data is unreachable');

  const brokenRepository = {
    async listCurrencies(): Promise<never> {
      throw new Error('database down');
    },
    async listCountries(): Promise<never> {
      throw new Error('database down');
    },
    async listLanguages(): Promise<never> {
      throw new Error('database down');
    },
    async listCountryLanguages(): Promise<never> {
      throw new Error('database down');
    },
  };
  const missCache = {
    async read() {
      return null;
    },
    async write() {},
    async invalidate() {},
  };
  const platformDefaults = {
    defaults: { countryCode: 'BD', currency: 'BDT', locale: 'en', timezone: 'Asia/Dhaka' },
  };

  const degraded = new RegionsService(brokenRepository as never, missCache, platformDefaults as never);
  const fallback = await degraded.defaultsFor('BD');
  equal('a signup still gets a currency with the DB down', fallback.currency, 'BDT');
  equal('and a timezone', fallback.timezone, 'Asia/Dhaka');
  equal('and defaultsFor(null) is the platform default', (await degraded.defaultsFor(null)).countryCode, 'BD');

  const healthyCache = {
    async read() {
      return {
        currencies: [
          { code: 'BDT', symbol: '৳', formatLocale: 'bn-BD', fractionDigits: 0, isActive: true, sort: 0 },
        ],
        countries: [
          {
            code: 'BD',
            name: 'Bangladesh',
            currencyCode: 'BDT',
            timezone: 'Asia/Dhaka',
            dialCode: '+880',
            defaultLocale: 'bn',
            isActive: true,
            sort: 0,
          },
        ],
        languages: [
          { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'ltr' as const, isActive: true, sort: 0 },
        ],
        countryLanguages: [{ countryCode: 'BD', languageCode: 'bn', isDefault: true, sort: 0 }],
      };
    },
    async write() {},
    async invalidate() {},
  };

  const healthy = new RegionsService(brokenRepository as never, healthyCache, platformDefaults as never);
  const bdDefaults = await healthy.defaultsFor('BD');
  equal('a country row supplies the locale, not the env default', bdDefaults.locale, 'bn');
  equal('and the currency', bdDefaults.currency, 'BDT');
  equal('lookup is case-insensitive', (await healthy.activeCountry('bd'))?.code, 'BD');
  equal('an unknown country is null', await healthy.activeCountry('ZZ'), null);
  equal('an unknown country falls back to the platform locale', (await healthy.defaultsFor('ZZ')).locale, 'en');

  const detail = await healthy.countryDetail('BD');
  check('countryDetail attaches the currency', detail?.currency.code === 'BDT');
  check('and the languages', detail?.languages[0]?.code === 'bn');

  // =========================================================================
  section('Enum codecs for the E3 vocabularies');

  const directions = enumCodec('TextDirection');
  equal('LTR ↔ "ltr"', directions.toWire('LTR'), 'ltr');
  equal('"rtl" ↔ RTL', directions.toDb('rtl'), 'RTL');

  const topicCodec = enumCodec('NotificationTopicKey');
  equal('ORDER_UPDATES ↔ "orderUpdates"', topicCodec.toWire('ORDER_UPDATES'), 'orderUpdates');
  equal('camelCase survives the round trip', topicCodec.toDb('weeklyDigest'), 'WEEKLY_DIGEST');

  const scopeCodec = enumCodec('SettingScope');
  equal('PLATFORM ↔ "platform"', scopeCodec.toWire('PLATFORM'), 'platform');

  try {
    assertVocabularyMatches('TextDirection', ['ltr', 'rtl']);
    assertVocabularyMatches('NotificationTopicKey', NOTIFICATION_TOPICS);
    assertVocabularyMatches('SettingScope', ['vendor', 'country', 'platform']);
    assertVocabularyMatches('SettingValueType', ['string', 'number', 'boolean', 'json']);
    check('every E3 vocabulary matches its Postgres enum', true);
  } catch (error) {
    check(`vocabulary drift: ${error instanceof Error ? error.message : String(error)}`, false);
  }

  try {
    assertVocabularyMatches('TextDirection', ['ltr']);
    check('drift detection actually fails on a mismatch', false);
  } catch {
    check('drift detection actually fails on a mismatch', true);
  }

  // =========================================================================
  console.log(
    failures.length === 0
      ? `\n✓ ${passed} assertions passed, 0 failed.`
      : `\n✗ ${passed} passed, ${failures.length} FAILED.`,
  );
  if (failures.length > 0) process.exit(1);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
