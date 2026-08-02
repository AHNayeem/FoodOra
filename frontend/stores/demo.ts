"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * demo store — the controls a person running a demonstration needs.
 *
 * The lifecycle work made every state real, which created a presentation
 * problem: a real lifecycle needs three people to drive it, and a demo has one.
 * The autopilot plays whichever actors the presenter is not, so the story can be
 * told from a single screen — and can be switched off the moment they want to
 * drive a step themselves (a manual action always wins, because the autopilot
 * only fires after a dwell period).
 *
 * `speed` scales those dwell times. At 1× a demo order takes a couple of minutes
 * to walk the whole lifecycle, which reads as plausible on a shared screen; 3×
 * is for when somebody wants to see the end.
 */
interface DemoState {
  /** Play the other actors on a timer. */
  autopilot: boolean;
  /** Dwell-time multiplier — higher is faster. */
  speed: number;
  /** Whether the floating control bar is shown at all. */
  barVisible: boolean;
  hydrated: boolean;
  setAutopilot: (on: boolean) => void;
  setSpeed: (speed: number) => void;
  setBarVisible: (visible: boolean) => void;
  setHydrated: () => void;
}

export const SPEED_OPTIONS = [1, 2, 3] as const;

export const useDemo = create<DemoState>()(
  persist(
    (set) => ({
      autopilot: true,
      speed: 1,
      barVisible: true,
      hydrated: false,
      setAutopilot: (autopilot) => set({ autopilot }),
      setSpeed: (speed) => set({ speed }),
      setBarVisible: (barVisible) => set({ barVisible }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "foodora-demo",
      partialize: (s) => ({
        autopilot: s.autopilot,
        speed: s.speed,
        barVisible: s.barVisible,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
