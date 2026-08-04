"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import { signOutEverywhere } from "@/services/auth";

/**
 * auth store — who is signed in, for the UI's benefit.
 *
 * The tokens are **not** here. The access token lives in memory in
 * `lib/graphql/session.ts` because it is short-lived and a copy in `localStorage`
 * is a copy an XSS can read; the refresh token is an `httpOnly` cookie that
 * JavaScript never sees. What persists is the `User`, so the chrome can render
 * signed-in on the first paint after a reload while
 * `components/providers/graphql-provider.tsx` re-establishes the session behind it.
 *
 * `hydrated` guards against SSR/client mismatch: server render always shows the
 * logged-out chrome, and components wait for rehydration before trusting `user`.
 */
interface AuthState {
  user: User | null;
  hydrated: boolean;
  signIn: (user: User) => void;
  /**
   * Clears the local session and revokes it server-side.
   *
   * Stays `void`-returning and synchronous from a caller's point of view, because a
   * dozen components already call it from a click handler. The revocation is
   * fire-and-forget on purpose: the user asked to be signed out, and they are —
   * locally, immediately — whether or not the network cooperates.
   */
  signOut: () => void;
  /** Merge a patch into the signed-in user (profile edits — Phase C3). */
  updateUser: (patch: Partial<User>) => void;
  setHydrated: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      signIn: (user) => set({ user }),
      signOut: () => {
        set({ user: null });
        void signOutEverywhere();
      },
      updateUser: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-session",
      partialize: (state) => ({ user: state.user }),
      // Rehydrate explicitly (see SiteHeader) so SSR and the first client render
      // both start logged-out and never mismatch.
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
