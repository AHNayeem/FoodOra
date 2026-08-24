"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, Store, Trash2 } from "lucide-react";
import type { VendorApplication, VendorBranch, VendorSettings, WeeklyHours } from "@/types";
import { useOnboarding } from "@/stores/onboarding";
import { addBranch, editBranch, removeBranch, closedWeek } from "@/lib/vendor-settings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { HoursEditor } from "./hours-editor";

/**
 * BranchesPanel — additional outlets (G18, "branches where supported").
 *
 * The "where supported" is doing real work in that spec line, and Phase 10 honours
 * the answer Phases 6–7 already gave rather than overturning it: **a branch is a
 * record, not a listing.** `Vendor` has one `location`, so minting a second listing
 * per outlet would put a restaurant in discovery that shares one menu, one order
 * board and one kitchen — a branch a customer could order from and nobody could
 * fulfil. Until an outlet is something an order can be routed to, recording it is
 * the honest ceiling.
 *
 * So branches live where they have always lived: on `VendorApplication.branches`,
 * edited through `stores/onboarding.editVendor`. That is deliberate rather than
 * incidental — the edit lands in the same append-only log a reviewer reads, so a
 * restaurant quietly adding an outlet is visible to the platform, and there is no
 * second copy in `stores/vendor-settings` that could disagree about how many
 * outlets exist.
 */
export function BranchesPanel({
  settings,
  application,
  authorName,
}: {
  settings: VendorSettings;
  application: VendorApplication | null;
  authorName: string;
}) {
  const t = useTranslations("vendorSettings");
  const editVendor = useOnboarding((s) => s.editVendor);

  const [dialog, setDialog] = useState<
    { kind: "new" } | { kind: "edit"; branch: VendorBranch } | null
  >(null);
  const [confirmRemove, setConfirmRemove] = useState<VendorBranch | null>(null);
  const [saving, setSaving] = useState(false);

  const branches = settings.branches;

  /** Write the whole list back through the application's own edit path. */
  function commit(next: VendorBranch[]): boolean {
    if (!application) {
      toast.error(t("branches.noApplication"));
      return false;
    }
    const result = editVendor(
      application.id,
      { branches: next },
      { author: "applicant", authorName, note: null },
    );
    if (result.error) {
      toast.error(t(result.error));
      return false;
    }
    return true;
  }

  function submit(input: {
    name: string;
    address: string;
    area: string;
    phone: string;
    hours: WeeklyHours | null;
  }): Record<string, string> {
    setSaving(true);
    const result =
      dialog?.kind === "edit"
        ? editBranch(branches, dialog.branch.id, input)
        : addBranch(branches, settings.vendor.id, input, Date.now());
    setSaving(false);
    if (Object.keys(result.errors).length) return result.errors;
    if (!commit(result.branches)) return {};
    setDialog(null);
    toast.success(t("saved"));
    return {};
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{t("branches.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("branches.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setDialog({ kind: "new" })}>
          <Plus className="size-4" aria-hidden />
          {t("branches.add")}
        </Button>
      </div>

      {/* Stated on screen, not just in a comment: the person adding an outlet needs
          to know it will not start taking orders. */}
      <p className="mt-3 rounded-field bg-surface-muted p-3 text-xs text-muted">
        {t("branches.notOrderable")}
      </p>

      {branches.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 py-8 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-pill bg-surface-muted text-muted">
            <Store className="size-5" aria-hidden />
          </span>
          <p className="text-sm text-muted">{t("branches.empty")}</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {branches.map((branch) => (
            <li key={branch.id} className="flex flex-wrap items-start gap-3 py-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
                <MapPin className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{branch.name}</p>
                <p className="text-xs text-muted">
                  {branch.address}, {branch.area} · {branch.phone}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {branch.hours ? t("branches.ownHours") : t("branches.mainHours")}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: "edit", branch })}
                >
                  {t("edit")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("branches.remove")}
                  onClick={() => setConfirmRemove(branch)}
                >
                  <Trash2 className="size-4 text-danger" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <BranchDialog
          key={dialog.kind === "edit" ? dialog.branch.id : "new"}
          branch={dialog.kind === "edit" ? dialog.branch : null}
          saving={saving}
          onClose={() => setDialog(null)}
          onSubmit={submit}
        />
      )}

      {confirmRemove && (
        <ConfirmDialog
          open
          title={t("branches.removeTitle")}
          body={t("branches.removeBody", { name: confirmRemove.name })}
          confirmLabel={t("branches.remove")}
          tone="danger"
          submitting={saving}
          onClose={() => setConfirmRemove(null)}
          onConfirm={() => {
            if (commit(removeBranch(branches, confirmRemove.id))) {
              toast.success(t("branches.removed"));
            }
            setConfirmRemove(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * Add or edit one outlet.
 *
 * Its own rota is opt-in, and that is the point of the switch: most branches keep
 * the restaurant's hours, and a dialog that pre-filled seven editable rows would
 * make every branch look like it had been given deliberately different times.
 */
function BranchDialog({
  branch,
  saving,
  onClose,
  onSubmit,
}: {
  branch: VendorBranch | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    address: string;
    area: string;
    phone: string;
    hours: WeeklyHours | null;
  }) => Record<string, string>;
}) {
  const t = useTranslations("vendorSettings");
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [area, setArea] = useState(branch?.area ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [hours, setHours] = useState<WeeklyHours | null>(branch?.hours ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);

  return (
    <Modal open onClose={onClose} labelledBy="branch-title" className="sm:max-w-lg">
      <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
        <h2 id="branch-title" className="text-h3 text-ink">
          {branch ? t("branches.editTitle") : t("branches.addTitle")}
        </h2>

        <div className="mt-4 space-y-4">
          <Field id="brn-name" label={t("field.branchName")} error={err("name")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={Boolean(err("name"))}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field id="brn-address" label={t("field.address")} error={err("address")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={Boolean(err("address"))}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="brn-area" label={t("field.area")} error={err("area")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("area"))}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                />
              )}
            </Field>
            <Field id="brn-phone" label={t("field.phone")} error={err("phone")}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="tel"
                  inputMode="tel"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(err("phone"))}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              )}
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-field border border-line bg-surface-alt p-3.5">
            <input
              type="checkbox"
              checked={hours != null}
              onChange={(e) => setHours(e.target.checked ? closedWeek() : null)}
              className="mt-0.5 size-4.5 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {t("branches.ownHoursToggle")}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {t("branches.ownHoursHint")}
              </span>
            </span>
          </label>

          {hours && <HoursEditor hours={hours} onChange={setHours} />}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            disabled={saving}
            onClick={() => setErrors(onSubmit({ name, address, area, phone, hours }))}
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
