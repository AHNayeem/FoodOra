"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { Locale } from "@/config/i18n/config";
import type {
  CmsFieldDef,
  CmsLocalizedText,
  CmsRow,
  CmsScalar,
  CmsValue,
  CmsValues,
} from "@/types";
import { iconNames, DashIcon } from "@/components/directory/dash-icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * field-editors — one control per {@link CmsFieldDef} type, and one repeater that
 * composes them.
 *
 * This is the whole reason the CMS is schema-driven: nine collections, thirty-odd
 * document shapes and several hundred fields are edited by *this* file, so adding
 * a field to a document is a line in `lib/mock/cms.ts` rather than a new form.
 *
 * Localized fields edit **one locale at a time** — whichever the editor selected
 * above — because a page of three-up translation inputs is unusable and because
 * the resolution rule already makes a partially translated document safe:
 * an unauthored locale keeps its message-catalog string.
 */
const inputClass =
  "w-full rounded-field border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";

function localizedText(value: CmsValue | undefined): CmsLocalizedText {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as CmsLocalizedText;
  if (typeof value === "string") return { en: value };
  return {};
}

function scalarString(value: CmsValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

export interface FieldEditorProps {
  field: CmsFieldDef;
  value: CmsValue | undefined;
  locale: Locale;
  /** Dotted path, used for error lookup and input ids. */
  path: string;
  errors: Record<string, string>;
  /** `undefined` clears the field. */
  onChange: (value: CmsValue | undefined) => void;
  /** The message key this field falls back to when nothing is authored. */
  fallbackKey?: string;
}

export function FieldEditor({
  field,
  value,
  locale,
  path,
  errors,
  onChange,
  fallbackKey,
}: FieldEditorProps) {
  const t = useTranslations("cms");
  const error = errors[path];

  const id = `cms-${path.replace(/[^\w-]/g, "-")}`;
  const describedBy = [error ? `${id}-error` : null, field.help ? `${id}-help` : null]
    .filter(Boolean)
    .join(" ");

  function setLocalized(next: string) {
    const current = { ...localizedText(value) };
    if (next) current[locale] = next;
    else delete current[locale];
    onChange(Object.keys(current).length ? current : undefined);
  }

  const control = () => {
    switch (field.type) {
      case "repeater":
        return (
          <RepeaterEditor
            field={field}
            rows={Array.isArray(value) ? (value as CmsRow[]) : []}
            locale={locale}
            path={path}
            errors={errors}
            onChange={onChange}
          />
        );

      case "textarea": {
        const text = field.localized ? (localizedText(value)[locale] ?? "") : scalarString(value);
        return (
          <textarea
            id={id}
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            rows={field.rows ?? 4}
            maxLength={field.max}
            value={text}
            onChange={(e) =>
              field.localized ? setLocalized(e.target.value) : onChange(e.target.value || undefined)
            }
            className={inputClass}
          />
        );
      }

      case "boolean":
        return (
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-body">
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
              className="size-4 accent-[var(--color-primary)]"
            />
            {t("fieldOn")}
          </label>
        );

      case "number":
        return (
          <Input
            id={id}
            type="number"
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            value={typeof value === "number" ? value : scalarString(value)}
            onChange={(e) =>
              onChange(e.target.value === "" ? undefined : Number(e.target.value))
            }
          />
        );

      case "date":
        return (
          <Input
            id={id}
            type="date"
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            value={scalarString(value).slice(0, 10)}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        );

      case "select":
        return (
          <select
            id={id}
            aria-describedby={describedBy || undefined}
            value={scalarString(value)}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={cn(inputClass, "h-11 py-0")}
          >
            <option value="">{t("fieldUnset")}</option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "icon":
        return (
          <div className="flex items-center gap-2">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-field border border-line bg-surface-muted text-ink">
              <DashIcon name={scalarString(value)} className="size-5" />
            </span>
            <select
              id={id}
              aria-describedby={describedBy || undefined}
              value={scalarString(value)}
              onChange={(e) => onChange(e.target.value || undefined)}
              className={cn(inputClass, "h-11 py-0")}
            >
              <option value="">{t("fieldUnset")}</option>
              {iconNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        );

      case "list":
        return (
          <textarea
            id={id}
            aria-describedby={describedBy || undefined}
            rows={field.rows ?? 3}
            value={(Array.isArray(value) ? (value as string[]) : []).join("\n")}
            onChange={(e) => {
              const items = e.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
              onChange(items.length ? items : undefined);
            }}
            className={inputClass}
          />
        );

      case "image":
        return (
          <div className="space-y-2">
            <Input
              id={id}
              aria-describedby={describedBy || undefined}
              aria-invalid={Boolean(error)}
              value={scalarString(value)}
              placeholder="https://…"
              onChange={(e) => onChange(e.target.value || undefined)}
            />
            {scalarString(value) && (
              // Deliberately an <img>: an editor pastes arbitrary URLs and
              // next/image would need every host allow-listed up front.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={scalarString(value)}
                alt=""
                className="h-24 w-full rounded-field border border-line object-cover"
              />
            )}
          </div>
        );

      default: {
        const text = field.localized ? (localizedText(value)[locale] ?? "") : scalarString(value);
        return (
          <Input
            id={id}
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            maxLength={field.max}
            value={text}
            onChange={(e) =>
              field.localized ? setLocalized(e.target.value) : onChange(e.target.value || undefined)
            }
          />
        );
      }
    }
  };

  const authored = field.localized ? Boolean(localizedText(value)[locale]) : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {field.label}
        </label>
        {field.required && <span className="text-xs font-semibold text-danger">*</span>}
        {field.localized && (
          <span
            className={cn(
              "rounded-pill px-2 py-0.5 text-[11px] font-bold uppercase",
              authored ? "bg-primary/10 text-primary" : "bg-surface-muted text-muted",
            )}
          >
            {locale}
          </span>
        )}
        {fallbackKey && !authored && (
          <span className="text-[11px] font-medium text-muted">
            {t("fieldFallback", { key: fallbackKey })}
          </span>
        )}
      </div>

      {control()}

      {field.help && (
        <p id={`${id}-help`} className="text-xs text-muted">
          {field.help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * RepeaterEditor — an ordered list of rows, each a small record of scalars.
 *
 * Rows carry their own stable id, so moving one does not remount the row below
 * it and an error path (`sections.sec3.heading`) survives reordering.
 */
function RepeaterEditor({
  field,
  rows,
  locale,
  path,
  errors,
  onChange,
}: {
  field: CmsFieldDef;
  rows: CmsRow[];
  locale: Locale;
  path: string;
  errors: Record<string, string>;
  onChange: (value: CmsValue | undefined) => void;
}) {
  const t = useTranslations("cms");
  const subFields = field.fields ?? [];

  function commit(next: CmsRow[]) {
    onChange(next.length ? next : []);
  }

  function updateRow(rowId: string, key: string, value: CmsValue | undefined) {
    commit(
      rows.map((row) => {
        if (row.id !== rowId) return row;
        const values = { ...row.values };
        if (value === undefined) delete values[key];
        else values[key] = value as CmsScalar | CmsLocalizedText;
        return { ...row, values };
      }),
    );
  }

  function addRow() {
    // Ids only have to be unique inside the document, and a counter is
    // deterministic — which matters because `Math.random()` in a render path
    // would make two devices disagree about the same row.
    const used = new Set(rows.map((row) => row.id));
    let n = rows.length + 1;
    while (used.has(`r${n}`)) n += 1;
    commit([...rows, { id: `r${n}`, values: {} }]);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.id} className="rounded-panel border border-line bg-surface-muted p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("rowLabel", { n: index + 1 })}
            </span>
            <div className="flex items-center gap-1">
              <IconButton
                label={t("moveUp")}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp className="size-4" aria-hidden />
              </IconButton>
              <IconButton
                label={t("moveDown")}
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown className="size-4" aria-hidden />
              </IconButton>
              <IconButton
                label={t("removeRow")}
                tone="danger"
                onClick={() => commit(rows.filter((r) => r.id !== row.id))}
              >
                <Trash2 className="size-4" aria-hidden />
              </IconButton>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {subFields.map((sub) => (
              <div key={sub.key} className={sub.type === "textarea" ? "sm:col-span-2" : undefined}>
                <FieldEditor
                  field={sub}
                  value={row.values[sub.key]}
                  locale={locale}
                  path={`${path}.${row.id}.${sub.key}`}
                  errors={errors}
                  onChange={(value) => updateRow(row.id, sub.key, value)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        disabled={Boolean(field.max && rows.length >= field.max)}
        className="inline-flex h-10 items-center gap-1.5 rounded-pill border border-dashed border-line px-4 text-sm font-semibold text-body transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        {t("addRow")}
      </button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-pill border border-line bg-surface transition-colors disabled:opacity-40",
        tone === "danger" ? "text-danger hover:bg-danger/5" : "text-body hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Every field of a document, in schema order. */
export function DocumentFields({
  fields,
  values,
  locale,
  errors,
  fallbacks,
  onChange,
}: {
  fields: CmsFieldDef[];
  values: CmsValues;
  locale: Locale;
  errors: Record<string, string>;
  fallbacks: Record<string, string>;
  onChange: (key: string, value: CmsValue | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {fields.map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={values[field.key]}
          locale={locale}
          path={field.key}
          errors={errors}
          fallbackKey={fallbacks[field.key]}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </div>
  );
}
