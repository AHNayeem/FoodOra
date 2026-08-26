export const SETTINGS_READER = Symbol('SETTINGS_READER');

/** Where a setting is being read for. Omitted fields simply widen the resolution. */
export interface SettingScopeRef {
  countryCode?: string | null;
  vendorId?: string | null;
}

/**
 * Read a configured value, resolved vendor → country → platform.
 *
 * Published as a contract because settings are read by nearly every later module —
 * E5 wants `orders.cancelWindowMinutes`, E7 the payment toggles, E6 the dispatch
 * radius — and none of them should import `SettingsModule`'s application layer to get
 * one number.
 *
 * The important guarantee is the fallback: a key in the catalogue always resolves,
 * even against an empty `settings` table and an unreachable Redis, because the
 * catalogue's default is the last layer. Configuration that only works once somebody
 * has configured it is a deployment landmine — the first request after a fresh
 * migration would fail on a missing row.
 */
export interface SettingsReaderPort {
  /**
   * The typed value for one catalogue key. Never throws for a missing row; throws for
   * a key that is not in the catalogue, which is a programming error.
   */
  read<T>(key: string, scope?: SettingScopeRef): Promise<T>;
  /** Every key marked public, resolved for this scope — what a client may be handed. */
  readPublic(scope?: SettingScopeRef): Promise<Record<string, unknown>>;
}
