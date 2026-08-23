"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, X } from "lucide-react";
import type { DietaryTag, MenuBoardSection, OptionGroupDraft } from "@/types";
import {
  emptyMenuItemDraft,
  emptyOptionGroupDraft,
  optionGroupDraftFrom,
  putOptionGroup,
  removeOptionGroup,
  type MenuError,
  type MenuItemDraft,
} from "@/lib/menu";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const DIETARY: readonly DietaryTag[] = [
  "halal",
  "vegetarian",
  "vegan",
  "gluten-free",
  "keto",
  "healthy",
  "spicy",
];

const SPICY: readonly (0 | 1 | 2 | 3)[] = [0, 1, 2, 3];

/**
 * ItemEditor — the dish form (Phase 9, G19/G20).
 *
 * One dialog for creating and for editing, because they are the same form over the
 * same record: a create starts from `emptyMenuItemDraft` and an edit from
 * `itemDraftFrom`, and everything after that is identical. Two dialogs would be two
 * places for a field to be forgotten.
 *
 * The option-group builder lives inside it rather than on a screen of its own, and
 * that is the important decision. A group is not an entity a restaurant manages —
 * it is part of the dish, it is meaningless without it, and its `min`/`max` only make
 * sense against the options listed beside them. Editing it here also means **cancel
 * means cancel**: an abandoned dialog leaves no half-built group attached to a live
 * item, because the group is only committed when the item is saved.
 *
 * Validation is `lib/menu`'s (`menuItemErrors`, `optionGroupError`) and never this
 * component's, so the form cannot accept a dish the store would refuse — nor build a
 * required group with a minimum of zero, which would render in the customiser as a
 * control the customer cannot satisfy.
 *
 * Mounted only while it is open, and keyed by the dish it is editing. The draft is
 * therefore initialised once, by `useState`, rather than reset by an effect watching
 * an `open` flag — which is what stops a parent re-render (the board re-folds on every
 * store write) from throwing away half-typed input.
 */
export function ItemEditor({
  onClose,
  onSubmit,
  sections,
  initial,
  initialSectionId,
  errors,
  title,
}: {
  onClose: () => void;
  onSubmit: (draft: MenuItemDraft) => void;
  /** Every section the dish could live in — moving it is a field, not a drag. */
  sections: MenuBoardSection[];
  /** The dish being edited, or undefined when creating. */
  initial?: MenuItemDraft;
  initialSectionId?: string;
  /** Field errors from the last submit, keyed as `lib/menu` keys them. */
  errors: Record<string, MenuError>;
  title: string;
}) {
  const t = useTranslations("menuBuilder");
  const td = useTranslations("dietary");

  const [draft, setDraft] = useState<MenuItemDraft>(
    () => initial ?? emptyMenuItemDraft(initialSectionId),
  );
  const [group, setGroup] = useState<OptionGroupDraft | null>(null);
  const [groupError, setGroupError] = useState<MenuError | null>(null);

  function toggleDietary(tag: DietaryTag) {
    setDraft((d) => ({
      ...d,
      dietary: d.dietary.includes(tag)
        ? d.dietary.filter((x) => x !== tag)
        : [...d.dietary, tag],
    }));
  }

  function saveGroup() {
    if (!group) return;
    const result = putOptionGroup(draft, group, Date.now());
    if (result.error) {
      setGroupError(result.error);
      return;
    }
    setDraft(result.item);
    setGroup(null);
    setGroupError(null);
  }

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="item-editor-title"
      className="p-5 sm:max-w-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="item-editor-title" className="text-h3 text-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-8 items-center justify-center rounded-pill text-muted hover:bg-surface-muted"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="item-name"
            label={t("fieldName")}
            error={errors.name ? t(errors.name) : undefined}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.name)}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={t("fieldNamePlaceholder")}
              />
            )}
          </Field>
          <Field
            id="item-section"
            label={t("fieldSection")}
            error={errors.sectionId ? t(errors.sectionId) : undefined}
            hint={t("fieldSectionHint")}
          >
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.sectionId)}
                value={draft.sectionId}
                onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })}
                className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <option value="">{t("fieldSectionEmpty")}</option>
                {sections.map((s) => (
                  <option key={s.section.id} value={s.section.id}>
                    {s.section.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <Field id="item-description" label={t("fieldDescription")}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder={t("fieldDescriptionPlaceholder")}
              className="w-full rounded-field border border-line bg-surface p-3 text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            id="item-price"
            label={t("fieldPrice")}
            error={errors.price ? t(errors.price) : undefined}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.price)}
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.price || ""}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field
            id="item-compare"
            label={t("fieldCompareAt")}
            hint={t("fieldCompareAtHint")}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.compareAtPrice ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    compareAtPrice: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            )}
          </Field>
          <Field id="item-calories" label={t("fieldCalories")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.calories ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    calories: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            )}
          </Field>
        </div>

        {/* A URL rather than a file picker: there is no file storage in the
            prototype, and a picker that appears to accept a photo and keeps
            nothing is the decoration Phase 6 refused for documents. */}
        <Field id="item-image" label={t("fieldImage")} hint={t("fieldImageHint")}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="url"
              value={draft.image}
              onChange={(e) => setDraft({ ...draft, image: e.target.value })}
              placeholder="https://…"
            />
          )}
        </Field>

        <fieldset>
          <legend className="mb-2 block text-sm font-semibold text-ink">
            {t("fieldDietary")}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {DIETARY.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={draft.dietary.includes(tag)}
                onClick={() => toggleDietary(tag)}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
                  draft.dietary.includes(tag)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-line text-body hover:bg-surface-muted",
                )}
              >
                {td(tag)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 block text-sm font-semibold text-ink">
              {t("fieldSpicy")}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {SPICY.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={draft.spicyLevel === level}
                  onClick={() => setDraft({ ...draft, spicyLevel: level })}
                  className={cn(
                    "rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
                    draft.spicyLevel === level
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-line text-body hover:bg-surface-muted",
                  )}
                >
                  {level === 0 ? t("spicyNone") : "🌶".repeat(level)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2.5 self-end text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={draft.isPopular}
              onChange={(e) => setDraft({ ...draft, isPopular: e.target.checked })}
              className="size-4 rounded border-line accent-primary"
            />
            {t("fieldPopular")}
          </label>
        </div>

        {/* Option groups (G20) */}
        <section className="rounded-card border border-line p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">{t("optionsTitle")}</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setGroup(emptyOptionGroupDraft());
                setGroupError(null);
              }}
            >
              <Plus className="size-4" aria-hidden />
              {t("optionsAdd")}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted">{t("optionsHint")}</p>

          {draft.optionGroups.length === 0 ? (
            <p className="mt-3 rounded-field bg-surface-muted p-3 text-xs text-muted">
              {t("optionsEmpty")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {draft.optionGroups.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{g.name}</span>
                      <span
                        className={cn(
                          "rounded-pill px-2 py-0.5 text-[11px] font-bold",
                          g.required
                            ? "bg-primary/10 text-primary"
                            : "bg-surface-muted text-muted",
                        )}
                      >
                        {g.required ? t("optionsRequired") : t("optionsOptional")}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t("optionsMeta", { count: g.options.length, min: g.min, max: g.max })}
                      {": "}
                      {g.options.map((o) => o.name).join(", ")}
                    </span>
                    {errors[`optionGroups.${g.id}`] && (
                      <span className="mt-0.5 block text-xs font-medium text-danger">
                        {t(errors[`optionGroups.${g.id}`]!)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setGroup(optionGroupDraftFrom(g));
                      setGroupError(null);
                    }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft(removeOptionGroup(draft, g.id))}
                    aria-label={t("optionsDelete", { name: g.name })}
                    className="inline-flex size-8 items-center justify-center rounded-pill text-danger hover:bg-danger/5"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {group && (
            <OptionGroupForm
              group={group}
              error={groupError}
              onChange={setGroup}
              onCancel={() => setGroup(null)}
              onSave={saveGroup}
            />
          )}
        </section>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={() => onSubmit(draft)}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * The group builder, inline.
 *
 * `min`/`max` are numbers rather than a "choose one / choose many" toggle because
 * the customiser genuinely reads both, and hiding them behind a preset would make
 * "pick 2 of 5 toppings" unexpressible. `required` and `min` are separate controls
 * for the same reason they are separate fields — and `optionGroupError` is what
 * stops the two being set to a contradiction.
 */
function OptionGroupForm({
  group,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  group: OptionGroupDraft;
  error: MenuError | null;
  onChange: (next: OptionGroupDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("menuBuilder");

  function setOption(index: number, patch: { name?: string; priceDelta?: number }) {
    onChange({
      ...group,
      options: group.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-field bg-surface-muted p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="group-name" label={t("groupName")}>
          {({ id }) => (
            <Input
              id={id}
              value={group.name}
              onChange={(e) => onChange({ ...group, name: e.target.value })}
              placeholder={t("groupNamePlaceholder")}
            />
          )}
        </Field>
        <div className="flex items-end gap-3">
          <Field id="group-min" label={t("groupMin")} className="flex-1">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                value={group.min}
                onChange={(e) => onChange({ ...group, min: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field id="group-max" label={t("groupMax")} className="flex-1">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                value={group.max}
                onChange={(e) => onChange({ ...group, max: Number(e.target.value) })}
              />
            )}
          </Field>
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          checked={group.required}
          onChange={(e) =>
            onChange({
              ...group,
              required: e.target.checked,
              // A required group with a minimum of zero is not required, so the
              // minimum comes with it rather than leaving the two contradicting.
              min: e.target.checked ? Math.max(1, group.min) : group.min,
            })
          }
          className="size-4 rounded border-line accent-primary"
        />
        {t("groupRequired")}
      </label>

      <div className="space-y-2">
        {group.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={option.name}
              onChange={(e) => setOption(index, { name: e.target.value })}
              placeholder={t("optionName")}
              aria-label={t("optionName")}
            />
            <Input
              type="number"
              value={option.priceDelta}
              onChange={(e) => setOption(index, { priceDelta: Number(e.target.value) })}
              aria-label={t("optionPrice")}
              className="w-28"
            />
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...group,
                  options: group.options.filter((_, i) => i !== index),
                })
              }
              aria-label={t("optionRemove")}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-danger hover:bg-danger/5"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange({
              ...group,
              options: [...group.options, { id: "", name: "", priceDelta: 0 }],
            })
          }
        >
          <Plus className="size-4" aria-hidden />
          {t("optionAdd")}
        </Button>
      </div>

      {error && <p className="text-xs font-medium text-danger">{t(error)}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={onSave}>
          {t("groupSave")}
        </Button>
      </div>
    </div>
  );
}
