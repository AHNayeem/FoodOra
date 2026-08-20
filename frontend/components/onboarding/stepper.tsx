"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stepper — where the applicant is in a multi-step application (Phases 6–7).
 *
 * Steps already passed are clickable and steps ahead are not, deliberately: an
 * applicant needs to go back and fix something, but jumping forward past a step
 * whose fields are still empty produces a "next" button that reports errors for a
 * page the applicant has never seen. Validation is per-step (`vendorStepErrors` /
 * `riderStepErrors`) and this is the affordance that matches it.
 */
export function Stepper({
  steps,
  current,
  labelOf,
  onGo,
}: {
  steps: readonly string[];
  current: number;
  labelOf: (step: string) => string;
  onGo: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step}>
            <button
              type="button"
              disabled={index > current}
              aria-current={active ? "step" : undefined}
              onClick={() => onGo(index)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : done
                    ? "border-fresh/40 bg-fresh/10 text-fresh-600 hover:bg-fresh/15"
                    : "border-line text-muted",
              )}
            >
              {done ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <span className="tabular-nums">{index + 1}</span>
              )}
              {labelOf(step)}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
