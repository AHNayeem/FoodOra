"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PermissionAction,
  PermissionResource,
  PlatformPermission,
  User,
} from "@/types";
import { signOutEverywhere } from "@/services/auth";
import {
  can as canDo,
  hasAnyPermission,
  hasPermission,
  permissionsFor,
} from "@/lib/rbac";

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

// ---------------------------------------------------------------------------
// Authorization (Phase 14, G31)
// ---------------------------------------------------------------------------

/**
 * The signed-in account, outside React.
 *
 * For the store guards: an admin-desk mutation asks *who is doing this* without a
 * component having to thread the user through a signature that a dozen call sites
 * already fill with a display label. The rule itself still lives in `lib/rbac` —
 * nothing below decides a permission, it only asks.
 */
export function currentUser(): User | null {
  return useAuth.getState().user;
}

/**
 * May the current session do this? The guard every admin-only store action opens
 * with, and the reason a hidden button is a courtesy rather than the rule.
 */
export function sessionCan(permission: PlatformPermission): boolean {
  return hasPermission(currentUser(), permission);
}

/** `hasPermission`, as a hook. Re-renders only when the answer changes. */
export function useHasPermission(permission: PlatformPermission): boolean {
  return useAuth((s) => hasPermission(s.user, permission));
}

/** `can`, as a hook — `useCan("payouts", "manage")`. */
export function useCan<R extends PermissionResource>(
  resource: R,
  action: PermissionAction<R>,
): boolean {
  return useAuth((s) => canDo(s.user, resource, action));
}

/** Any one of them — for a control reachable by more than one desk. */
export function useHasAnyPermission(
  permissions: readonly PlatformPermission[],
): boolean {
  return useAuth((s) => hasAnyPermission(s.user, permissions));
}

/**
 * Everything the session holds — the permission reference on the audit screen.
 *
 * Returns a fresh array each call, so it is read through `useMemo` at the one
 * place that needs the list rather than subscribed to directly.
 */
export function permissionsOfSession(): PlatformPermission[] {
  return permissionsFor(currentUser());
}
