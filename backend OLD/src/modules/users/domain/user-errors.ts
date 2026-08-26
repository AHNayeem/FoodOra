export const UserError = {
  notFound: 'users.errors.notFound',
  /** The phone is already on another account. `phone` is unique when present. */
  phoneTaken: 'errors.phoneTaken',
  invalidPhone: 'errors.phoneInvalid',
  /** The locale or currency is not one the platform currently offers. */
  unknownLocale: 'users.errors.unknownLocale',
  unknownCurrency: 'users.errors.unknownCurrency',
  unknownCountry: 'users.errors.unknownCountry',

  /** An administrator acting on an account at or above their own authority. */
  cannotAdminister: 'users.errors.cannotAdminister',
  cannotAdministerSelf: 'users.errors.cannotAdministerSelf',
  /** Setting a status the account is already in. */
  statusUnchanged: 'users.errors.statusUnchanged',
  /** Closing an account that is already closed, or restoring one that is not. */
  alreadyClosed: 'users.errors.alreadyClosed',
  notClosed: 'users.errors.notClosed',

  /**
   * A channel the customer is not allowed to switch off, because it carries the
   * transactional record of an order.
   *
   * Reusing the frontend's existing `errors.*` namespace for the two keys the Phase C forms
   * already render (`errors.phoneTaken`, `errors.phoneInvalid`) and adding `users.errors.*`
   * for the rest, so no key the prototype already translates has to move.
   */
  requiredChannel: 'users.errors.requiredChannel',
} as const;

export type UserErrorKey = (typeof UserError)[keyof typeof UserError];
