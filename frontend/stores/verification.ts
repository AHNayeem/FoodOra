"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  challengeError,
  markVerified,
  recordFailure,
  resendInSeconds,
  type VerificationChallenge,
  type VerificationChannel,
  type VerificationError,
} from "@/lib/verification";
import { confirmVerification, requestVerification } from "@/services/verification";
import { useAuth } from "./auth";

/**
 * verification store — the challenge in flight (Phase 17, G43).
 *
 * One challenge at a time, per device, because that is what a verification step
 * is: a code was sent somewhere and the person is either typing it or is not.
 * Keeping a queue of them would only make it possible to answer the wrong one.
 *
 * Two rules, matching the other stores:
 *
 *  1. **Every decision goes through `lib/verification`.** Expiry, the attempt
 *     limit and the resend cooldown are the domain's; nothing here compares a
 *     timestamp itself. So the code field, the resend button and the submit guard
 *     cannot disagree about whether a challenge is still alive.
 *  2. **The account is written once, here.** A successful answer sets
 *     `user.isVerified` through the session store — the same field the account
 *     surfaces and the admin's customer table read — so there is one place a
 *     verification becomes a fact about somebody.
 */
interface VerificationState {
  challenge: VerificationChallenge | null;
  /** In flight — the forms disable on this rather than each holding a flag. */
  busy: boolean;
  hydrated: boolean;

  /** Send a code. Replaces any challenge already in flight. */
  request: (input: {
    destination: string;
    channel?: VerificationChannel;
  }) => Promise<{ error: string | null }>;
  /** Answer the current challenge. Marks the account verified on success. */
  confirm: (code: string) => Promise<{ error: VerificationError | string | null }>;
  /** Seconds before another code may be sent; 0 when one may. */
  resendIn: (now?: number) => number;
  /** Throw the challenge away — closing the dialog, or signing out. */
  reset: () => void;
  setHydrated: () => void;
}

export const useVerification = create<VerificationState>()(
  persist(
    (set, get) => ({
      challenge: null,
      busy: false,
      hydrated: false,

      request: async ({ destination, channel }) => {
        set({ busy: true });
        const result = await requestVerification({ destination, channel });
        set({ busy: false, challenge: result.data ?? get().challenge });
        return { error: result.error };
      },

      confirm: async (code) => {
        const challenge = get().challenge;
        /**
         * The domain's guards first, and the provider's only if they pass.
         *
         * An expired or exhausted challenge is refused without a round trip —
         * which is not an optimisation. Asking the provider to check a code
         * against a challenge this device has already closed would let a correct
         * answer to a dead challenge succeed, and the attempt limit would mean
         * nothing.
         */
        const guard = challengeError(challenge, Date.now());
        if (guard || !challenge) return { error: guard ?? "errors.noChallenge" };

        set({ busy: true });
        const result = await confirmVerification(challenge, code);
        if (result.error || !result.data) {
          const failed = recordFailure(challenge);
          set({ busy: false, challenge: failed });
          return { error: result.error ?? "errors.invalidCode" };
        }

        set({ busy: false, challenge: markVerified(challenge) });
        // The one write of `isVerified` — see the note on the store.
        useAuth.getState().updateUser({ isVerified: true });
        return { error: null };
      },

      resendIn: (now = Date.now()) => {
        const challenge = get().challenge;
        return challenge ? resendInSeconds(challenge, now) : 0;
      },

      reset: () => set({ challenge: null, busy: false }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-verification",
      // `busy` is a request that is no longer in flight once the page reloads;
      // persisting it would open the panel with its buttons already disabled.
      partialize: (s) => ({ challenge: s.challenge }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
