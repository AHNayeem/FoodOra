"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

/**
 * auth store — the client-side session. In the prototype the "session" is just
 * the signed-in `User` persisted to localStorage; there is no token. When the
 * Phase E backend arrives, `signIn` will store tokens and this store becomes a
 * thin cache of the authenticated user — the component API stays the same.
 *
 * `hydrated` guards against SSR/client mismatch: server render always shows the
 * logged-out chrome, and components wait for rehydration before trusting `user`.
 */
interface AuthState {
  user: User | null;
  hydrated: boolean;
  signIn: (user: User) => void;
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
      signOut: () => set({ user: null }),
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
