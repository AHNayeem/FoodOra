import type { CustomerSettings } from "@/frontend/types";

/**
 * Default account settings for a new customer (Phase C28).
 *
 * Opinionated defaults, not all-on: everything transactional is enabled because
 * the customer asked for the order, and everything promotional starts off,
 * because opting people into marketing by default is the behaviour the privacy
 * page promises we don't have.
 */
export const defaultCustomerSettings: CustomerSettings = {
  notifications: {
    // Receipts and status changes — email is locked on (see REQUIRED_NOTIFICATIONS).
    orderUpdates: { email: true, push: true, sms: false },
    // "Rider is 2 minutes away" — push only, since SMS for this is noisy.
    deliveryAlerts: { email: false, push: true, sms: false },
    promotions: { email: false, push: false, sms: false },
    newVendors: { email: false, push: false, sms: false },
    weeklyDigest: { email: false, push: false, sms: false },
  },
  privacy: {
    personalizedRecommendations: true,
    shareOrderActivity: false,
    saveSearchHistory: true,
  },
  security: {
    loginAlerts: true,
    twoFactor: false,
  },
};
