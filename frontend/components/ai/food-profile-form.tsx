"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import type { Allergen, DietaryTag, FoodProfile, PlanGoal } from "@/frontend/types";
import { useAssistant } from "@/frontend/stores/assistant";
import { ALLERGENS, GOAL_CALORIES } from "@/frontend/lib/nutrition";
import { cn } from "@/frontend/lib/utils";

/** The dietary tags worth declaring standing — "spicy" is a mood, not a diet. */
const DIETARY_CHOICES: DietaryTag[] = ["halal", "vegetarian", "vegan", "gluten-free", "keto"];

const GOALS = Object.keys(GOAL_CALORIES) as PlanGoal[];

/**
 * FoodProfileForm — the assistant's memory, edited in place.
 *
 * It appears as a *block inside the conversation* (compact) and as a panel on
 * the `/ai` hub, because the moment a customer most wants to declare a nut
 * allergy is the moment the assistant just asked about one. Saving is
 * immediate — there is no submit button, because every field here is a toggle
 * whose effect the customer can see in the next answer.
 *
 * Allergies are listed first and styled as the serious thing they are: they are
 * the only preference in this app that is a hard filter rather than a ranking
 * signal, and the only one the privacy switch does not turn off.
 */
export function FoodProfileForm({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("ai");
  const profile = useAssistant((s) => s.profile);
  const setProfile = useAssistant((s) => s.setProfile);

  function update(patch: Partial<FoodProfile>, announce = true) {
    setProfile({ ...profile, ...patch });
    if (announce) toast.success(t("profile.saved"));
  }

  function toggleAllergen(allergen: Allergen) {
    const has = profile.allergies.includes(allergen);
    update({
      allergies: has
        ? profile.allergies.filter((a) => a !== allergen)
        : [...profile.allergies, allergen],
    });
  }

  function toggleDietary(tag: DietaryTag) {
    const has = profile.dietary.includes(tag);
    update({
      dietary: has ? profile.dietary.filter((d) => d !== tag) : [...profile.dietary, tag],
    });
  }

  return (
    <section
      className={cn(
        "rounded-card border border-line bg-surface",
        compact ? "p-3" : "p-4 sm:p-5",
      )}
    >
      <header className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h3 className={cn("font-semibold text-ink", compact ? "text-sm" : "text-h3")}>
            {t("profile.heading")}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{t("profile.subtitle")}</p>
        </div>
      </header>

      <Group label={t("profile.allergies")} hint={t("profile.allergiesHint")}>
        {ALLERGENS.map((allergen) => (
          <Chip
            key={allergen}
            active={profile.allergies.includes(allergen)}
            tone="danger"
            onClick={() => toggleAllergen(allergen)}
          >
            {t(`allergen.${allergen}`)}
          </Chip>
        ))}
      </Group>

      <Group label={t("profile.dietary")}>
        {DIETARY_CHOICES.map((tag) => (
          <Chip
            key={tag}
            active={profile.dietary.includes(tag)}
            onClick={() => toggleDietary(tag)}
          >
            {t(`dietary.${tag}`)}
          </Chip>
        ))}
      </Group>

      <Group label={t("profile.goal")}>
        {GOALS.map((goal) => (
          <Chip key={goal} active={profile.goal === goal} onClick={() => update({ goal })}>
            {t(`goal.${goal}`)}
          </Chip>
        ))}
      </Group>

      {!compact && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            id="ai-calorie-target"
            label={t("profile.calorieTarget")}
            hint={t("profile.calorieTargetHint", { value: GOAL_CALORIES[profile.goal] })}
            value={profile.calorieTarget}
            min={800}
            max={5000}
            onChange={(value) => update({ calorieTarget: value }, false)}
          />
          <NumberField
            id="ai-budget"
            label={t("profile.budget")}
            hint={t("profile.budgetHint")}
            value={profile.budget}
            min={50}
            max={10000}
            onChange={(value) => update({ budget: value }, false)}
          />
        </div>
      )}
    </section>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-3">
      <legend className="text-xs font-semibold text-ink">{label}</legend>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Chip({
  active,
  tone = "primary",
  onClick,
  children,
}: {
  active: boolean;
  tone?: "primary" | "danger";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? tone === "danger"
            ? "border-danger bg-danger/10 text-danger"
            : "border-primary bg-primary text-white"
          : "border-line bg-surface text-body hover:border-primary hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** A bounded number field that treats an empty box as "no preference". */
function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-xs font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChange(e.target.value === "" || !Number.isFinite(next) ? null : next);
        }}
        className="mt-1 h-10 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)]"
      />
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
