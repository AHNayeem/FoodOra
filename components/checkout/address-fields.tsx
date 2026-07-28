"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** The editable shape of a new delivery address entered at checkout. */
export interface NewAddress {
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  area: string;
  city: string;
  instructions: string;
}

export const emptyAddress: NewAddress = {
  label: "",
  recipient: "",
  phone: "",
  line1: "",
  line2: "",
  area: "",
  city: "",
  instructions: "",
};

/**
 * AddressFields — the "new address" form fragment used when the customer has no
 * saved address or chooses to enter one. Errors are i18n keys resolved by the
 * caller's `checkout`-scoped translator.
 */
export function AddressFields({
  value,
  onChange,
  errors,
}: {
  value: NewAddress;
  onChange: (patch: Partial<NewAddress>) => void;
  errors: Partial<Record<keyof NewAddress, string>>;
}) {
  const t = useTranslations("checkout");
  const set =
    (key: keyof NewAddress) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ [key]: e.target.value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="addr-label" label={t("addrLabel")}>
        {({ id }) => (
          <Input id={id} value={value.label} onChange={set("label")} placeholder={t("addrLabelPlaceholder")} />
        )}
      </Field>

      <Field id="addr-recipient" label={t("recipient")} error={errors.recipient && t(errors.recipient)}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            value={value.recipient}
            onChange={set("recipient")}
            autoComplete="name"
            aria-invalid={!!errors.recipient}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <Field
        id="addr-line1"
        label={t("line1")}
        error={errors.line1 && t(errors.line1)}
        className="sm:col-span-2"
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            value={value.line1}
            onChange={set("line1")}
            placeholder={t("line1Placeholder")}
            autoComplete="address-line1"
            aria-invalid={!!errors.line1}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <Field id="addr-line2" label={t("line2")} className="sm:col-span-2">
        {({ id }) => (
          <Input id={id} value={value.line2} onChange={set("line2")} autoComplete="address-line2" />
        )}
      </Field>

      <Field id="addr-area" label={t("area")} error={errors.area && t(errors.area)}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            value={value.area}
            onChange={set("area")}
            aria-invalid={!!errors.area}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <Field id="addr-city" label={t("city")} error={errors.city && t(errors.city)}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            value={value.city}
            onChange={set("city")}
            autoComplete="address-level2"
            aria-invalid={!!errors.city}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <Field id="addr-instructions" label={t("instructions")} className="sm:col-span-2">
        {({ id }) => (
          <textarea
            id={id}
            value={value.instructions}
            onChange={set("instructions")}
            rows={2}
            placeholder={t("instructionsPlaceholder")}
            className="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        )}
      </Field>
    </div>
  );
}
