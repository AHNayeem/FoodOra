"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { SavedAddress } from "@/types";
import { useAuth } from "@/stores/auth";
import { useAddresses } from "@/stores/addresses";
import { getAddressBook } from "@/services/account";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface AddressForm {
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  area: string;
  city: string;
  instructions: string;
  isDefault: boolean;
}

const emptyForm: AddressForm = {
  label: "",
  recipient: "",
  phone: "",
  line1: "",
  line2: "",
  area: "",
  city: "",
  instructions: "",
  isDefault: false,
};

type FieldErrors = Partial<Record<"recipient" | "phone" | "line1" | "area" | "city", string>>;

/**
 * AddressBook — the customer's saved delivery addresses (Phase C3). Backed by
 * the persisted addresses store, which seeds once from the mock service; adds,
 * edits, default changes and deletes made here also drive checkout (C8 reads
 * the same store). All simulated — no backend.
 */
export function AddressBook() {
  const t = useTranslations("account");
  const user = useAuth((s) => s.user);
  const addresses = useAddresses((s) => s.addresses);
  const hydrated = useAddresses((s) => s.hydrated);
  const seeded = useAddresses((s) => s.seeded);
  const seed = useAddresses((s) => s.seed);
  const addAddress = useAddresses((s) => s.addAddress);
  const updateAddress = useAddresses((s) => s.updateAddress);
  const removeAddress = useAddresses((s) => s.removeAddress);
  const setDefault = useAddresses((s) => s.setDefault);

  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SavedAddress | null>(null);

  // Rehydrate, then seed the book once from the service if it's still empty.
  useEffect(() => {
    useAddresses.persist.rehydrate();
  }, []);
  useEffect(() => {
    if (hydrated && !seeded) getAddressBook().then(seed);
  }, [hydrated, seeded, seed]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const formOpen = creating || editing !== null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
          {t("addressesHeading")}
        </h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          {t("addAddress")}
        </Button>
      </div>

      {addresses.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 rounded-panel border border-line bg-surface p-8 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface-muted text-muted">
            <MapPin className="size-6" aria-hidden />
          </span>
          <p className="text-body">{t("addressesEmpty")}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((addr) => (
            <li
              key={addr.id}
              className="flex flex-col rounded-panel border border-line bg-surface p-5"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{addr.label}</span>
                {addr.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    <Star className="size-3 fill-current" aria-hidden />
                    {t("default")}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-body">
                {addr.line1}
                {addr.line2 ? `, ${addr.line2}` : ""}, {addr.area}, {addr.city}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {addr.recipient} · {addr.phone}
              </p>
              {addr.instructions && (
                <p className="mt-1 text-xs italic text-muted">{addr.instructions}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                {!addr.isDefault && (
                  <button
                    type="button"
                    onClick={() => {
                      setDefault(addr.id);
                      toast.success(t("defaultSet"));
                    }}
                    className="rounded-field px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    {t("makeDefault")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(addr)}
                  className="ms-auto inline-flex items-center gap-1.5 rounded-field px-2.5 py-1.5 text-xs font-semibold text-body hover:bg-surface-muted"
                >
                  <Pencil className="size-3.5" aria-hidden />
                  {t("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(addr)}
                  className="inline-flex items-center gap-1.5 rounded-field px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/5"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <AddressFormModal
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(form) => {
            if (editing) {
              updateAddress(editing.id, {
                ...form,
                line2: form.line2.trim() || null,
                instructions: form.instructions.trim() || null,
              });
            } else {
              const now = new Date().toISOString();
              addAddress({
                id: `addr_${Date.now().toString(36)}`,
                userId: user?.id ?? "usr_customer",
                label: form.label.trim() || "Address",
                recipient: form.recipient.trim(),
                phone: form.phone.trim(),
                line1: form.line1.trim(),
                line2: form.line2.trim() || null,
                area: form.area.trim(),
                city: form.city.trim(),
                countryCode: user?.countryCode ?? "BD",
                instructions: form.instructions.trim() || null,
                isDefault: form.isDefault,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
              });
            }
            toast.success(t("addressSaved"));
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {confirmDelete && (
        <Modal open onClose={() => setConfirmDelete(null)} labelledBy="del-addr-title" className="p-6">
          <h2 id="del-addr-title" className="text-h3 text-ink">
            {t("deleteTitle")}
          </h2>
          <p className="mt-2 text-sm text-body">{t("deleteBody")}</p>
          <div className="mt-6 flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                removeAddress(confirmDelete.id);
                toast.success(t("addressRemoved"));
                setConfirmDelete(null);
              }}
            >
              {t("confirmDelete")}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>
              {t("cancel")}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function AddressFormModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial: SavedAddress | null;
  onClose: () => void;
  onSubmit: (form: AddressForm) => void;
}) {
  const t = useTranslations("account");
  const [form, setForm] = useState<AddressForm>(() =>
    initial
      ? {
          label: initial.label,
          recipient: initial.recipient,
          phone: initial.phone,
          line1: initial.line1,
          line2: initial.line2 ?? "",
          area: initial.area,
          city: initial.city,
          instructions: initial.instructions ?? "",
          isDefault: initial.isDefault,
        }
      : emptyForm,
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const set =
    (key: keyof AddressForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    if (!form.recipient.trim()) next.recipient = t("required");
    if (form.phone.trim().length < 6) next.phone = t("required");
    if (!form.line1.trim()) next.line1 = t("required");
    if (!form.area.trim()) next.area = t("required");
    if (!form.city.trim()) next.city = t("required");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit(form);
  }

  return (
    <Modal open onClose={onClose} labelledBy="addr-form-title" className="p-6 sm:max-w-lg">
      <h2 id="addr-form-title" className="text-h3 text-ink">
        {initial ? t("editAddress") : t("newAddress")}
      </h2>
      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field id="af-label" label={t("addrLabel")}>
          {({ id }) => (
            <Input id={id} value={form.label} onChange={set("label")} placeholder={t("addrLabelHint")} />
          )}
        </Field>
        <Field id="af-recipient" label={t("recipient")} error={errors.recipient}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={form.recipient}
              onChange={set("recipient")}
              autoComplete="name"
              aria-invalid={!!errors.recipient}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field id="af-phone" label={t("phone")} error={errors.phone} className="sm:col-span-2">
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={set("phone")}
              autoComplete="tel"
              placeholder="+8801XXXXXXXXX"
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field id="af-line1" label={t("line1")} error={errors.line1} className="sm:col-span-2">
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={form.line1}
              onChange={set("line1")}
              autoComplete="address-line1"
              aria-invalid={!!errors.line1}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field id="af-line2" label={t("line2")} className="sm:col-span-2">
          {({ id }) => (
            <Input id={id} value={form.line2} onChange={set("line2")} autoComplete="address-line2" />
          )}
        </Field>
        <Field id="af-area" label={t("area")} error={errors.area}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={form.area}
              onChange={set("area")}
              aria-invalid={!!errors.area}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field id="af-city" label={t("city")} error={errors.city}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={form.city}
              onChange={set("city")}
              autoComplete="address-level2"
              aria-invalid={!!errors.city}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field id="af-instructions" label={t("instructions")} className="sm:col-span-2">
          {({ id }) => (
            <textarea
              id={id}
              value={form.instructions}
              onChange={set("instructions")}
              rows={2}
              className="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          )}
        </Field>

        <label className="flex items-center gap-2.5 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
            className="size-4 rounded border-line text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <span className="text-sm text-body">{t("setDefaultLabel")}</span>
        </label>

        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" className="flex-1">
            {t("save")}
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
