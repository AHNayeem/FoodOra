"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { StaffMember, StaffPermission, StaffRole, Vendor } from "@/types";
import { useStaff } from "@/stores/staff";
import {
  STAFF_PERMISSIONS,
  STAFF_PERMISSIONS_ALL,
  STAFF_ROLES,
  countByStaffStatus,
  effectivePermissions,
  permissionOrigin,
  teamFor,
} from "@/lib/staff";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * StaffPanel — who works here, in what role, and whether they still do (G24).
 *
 * `User.permissions` has existed since the first commit and had never been read,
 * which is what the audit filed as G24. §6 notes G24 depends on G31 (RBAC, Phase
 * 14), so this panel builds the half that does not: invite, role, per-person
 * permission exceptions, and activate/deactivate — all through `lib/staff`, which is
 * where every guard lives (the last active owner cannot be demoted or deactivated,
 * a second invitation to one address is refused, and a member who is not active
 * folds to no permissions at all).
 *
 * **What it does not do is pretend.** There is no mail server and no way to sign in
 * as somebody who was invited, so an invitation is a record saying a person was
 * asked rather than a login that exists, and the permissions are recorded rather
 * than enforced across the platform. Both facts are on the screen, not only in this
 * comment. The alternative — a permission editor that silently changed nothing —
 * is what Phase 5 declined when it left an assignee column off the support queue
 * and what Phases 6–7 declined on the onboarding queues.
 *
 * `lib/staff.staffCan` is the predicate Phase 14 will ask from every shell. It is
 * correct today; what it is waiting for is a session to ask it about.
 */
export function StaffPanel({
  vendor,
  currentUser,
}: {
  vendor: Vendor;
  currentUser: { id: string; name: string; email: string; phone: string | null };
}) {
  const t = useTranslations("vendorSettings");
  const format = useFormatter();

  const members = useStaff((s) => s.members);
  const invite = useStaff((s) => s.invite);
  const edit = useStaff((s) => s.edit);
  const setStatus = useStaff((s) => s.setStatus);
  const setPermission = useStaff((s) => s.setPermission);
  const remove = useStaff((s) => s.remove);

  const [dialog, setDialog] = useState<
    { kind: "invite" } | { kind: "edit"; member: StaffMember } | null
  >(null);
  const [permissionsFor, setPermissionsFor] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);

  const team = teamFor(members, vendor.id);
  const counts = countByStaffStatus(team);
  // Read from the list rather than held in state: a permission toggle rewrites the
  // record, and a captured copy would show the previous answer.
  const editingPermissions = permissionsFor
    ? (team.find((m) => m.id === permissionsFor) ?? null)
    : null;

  function submit(input: {
    name: string;
    email: string;
    phone: string;
    role: StaffRole;
  }): Record<string, string> {
    setSaving(true);
    const result =
      dialog?.kind === "edit"
        ? edit(dialog.member.id, input)
        : invite(vendor.id, input, currentUser.name);
    setSaving(false);
    if (Object.keys(result.errors).length) return result.errors;
    setDialog(null);
    toast.success(dialog?.kind === "edit" ? t("saved") : t("staff.invited"));
    return {};
  }

  function move(member: StaffMember, to: "active" | "inactive") {
    const { error } = setStatus(member.id, to);
    if (error) {
      toast.error(t(error));
      return;
    }
    toast.success(t(to === "active" ? "staff.activated" : "staff.deactivated"));
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{t("staff.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("staff.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setDialog({ kind: "invite" })}>
          <UserPlus className="size-4" aria-hidden />
          {t("staff.invite")}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["active", "invited", "inactive"] as const).map((status) => (
          <span
            key={status}
            className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted"
          >
            {t(`staff.status.${status}`)}
            <b className="text-ink tabular-nums">{counts[status]}</b>
          </span>
        ))}
      </div>

      {/* Said on screen, because a permission list nobody enforces has to admit it. */}
      <p className="mt-3 rounded-field bg-surface-muted p-3 text-xs text-muted">
        {t("staff.notEnforced")}
      </p>

      {team.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 py-8 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-pill bg-surface-muted text-muted">
            <Users className="size-5" aria-hidden />
          </span>
          <p className="text-sm text-muted">{t("staff.empty")}</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {team.map((member) => {
            const permissions = effectivePermissions(member);
            return (
              <li key={member.id} className="py-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-ink">
                        {member.name}
                      </span>
                      <StatusChip status={member.status} />
                      <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                        {t(`staff.role.${member.role}`)}
                      </span>
                      {member.userId && (
                        <span className="text-[11px] font-semibold text-muted">
                          {t("staff.isYou")}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3.5" aria-hidden />
                        {member.email}
                      </span>
                      {member.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3.5" aria-hidden />
                          {member.phone}
                        </span>
                      )}
                      <span>
                        {member.status === "invited"
                          ? t("staff.invitedOn", {
                              date: format.dateTime(new Date(member.invitedAt), {
                                day: "numeric",
                                month: "short",
                              }),
                              by: member.invitedBy,
                            })
                          : t("staff.permissionCount", { count: permissions.length })}
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPermissionsFor(member.id)}
                    >
                      <ShieldCheck className="size-4" aria-hidden />
                      {t("staff.permissions")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialog({ kind: "edit", member })}
                    >
                      {t("edit")}
                    </Button>
                    {member.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => move(member, "inactive")}
                      >
                        {t("staff.deactivate")}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => move(member, "active")}>
                        {t("staff.activate")}
                      </Button>
                    )}
                    {/* Only an invitation can be withdrawn — somebody who has
                        worked a shift is deactivated, because their record is what
                        explains who was on the pass. Enforced in `lib/staff`. */}
                    {member.status === "invited" && !member.userId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("staff.withdraw")}
                        onClick={() => setConfirmRemove(member)}
                      >
                        <X className="size-4 text-danger" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <StaffDialog
          key={dialog.kind === "edit" ? dialog.member.id : "invite"}
          member={dialog.kind === "edit" ? dialog.member : null}
          saving={saving}
          onClose={() => setDialog(null)}
          onSubmit={submit}
        />
      )}

      {editingPermissions && (
        <PermissionsDialog
          member={editingPermissions}
          onClose={() => setPermissionsFor(null)}
          onToggle={(permission, enabled) => {
            const { error } = setPermission(editingPermissions.id, permission, enabled);
            if (error) toast.error(t(error));
          }}
        />
      )}

      {confirmRemove && (
        <ConfirmDialog
          open
          title={t("staff.withdrawTitle")}
          body={t("staff.withdrawBody", { name: confirmRemove.name })}
          confirmLabel={t("staff.withdraw")}
          tone="danger"
          onClose={() => setConfirmRemove(null)}
          onConfirm={() => {
            const { error } = remove(confirmRemove.id);
            if (error) toast.error(t(error));
            else toast.success(t("staff.withdrawn"));
            setConfirmRemove(null);
          }}
        />
      )}
    </section>
  );
}

function StatusChip({ status }: { status: StaffMember["status"] }) {
  const t = useTranslations("vendorSettings");
  return (
    <span
      className={cn(
        "rounded-pill px-2 py-0.5 text-[11px] font-bold",
        status === "active" && "bg-fresh/10 text-fresh-600",
        status === "invited" && "bg-accent-50 text-accent-600",
        status === "inactive" && "bg-surface-muted text-muted",
      )}
    >
      {t(`staff.status.${status}`)}
    </span>
  );
}

/** Invite somebody, or change their details and role. */
function StaffDialog({
  member,
  saving,
  onClose,
  onSubmit,
}: {
  member: StaffMember | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    email: string;
    phone: string;
    role: StaffRole;
  }) => Record<string, string>;
}) {
  const t = useTranslations("vendorSettings");
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [role, setRole] = useState<StaffRole>(member?.role ?? "manager");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);

  return (
    <Modal open onClose={onClose} labelledBy="staff-title" className="sm:max-w-md">
      <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
        <h2 id="staff-title" className="text-h3 text-ink">
          {member ? t("staff.editTitle") : t("staff.inviteTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {member ? t("staff.editBody") : t("staff.inviteBody")}
        </p>

        <div className="mt-4 space-y-4">
          <Field id="stf-name" label={t("field.name")} error={err("name")}>
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
          <Field id="stf-email" label={t("field.email")} error={err("email")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                aria-describedby={describedBy}
                aria-invalid={Boolean(err("email"))}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field
            id="stf-phone"
            label={t("field.phoneOptional")}
            error={err("phone")}
          >
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
          <Field
            id="stf-role"
            label={t("field.role")}
            hint={t(`staff.roleHint.${role}`)}
            error={err("role")}
          >
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
                className="h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary"
              >
                {STAFF_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {t(`staff.role.${option}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {/* What the role grants, read from the grant table rather than described
              in prose — so this list cannot drift from what `staffCan` answers. */}
          <div className="rounded-field bg-surface-muted p-3">
            <p className="text-xs font-semibold text-muted">{t("staff.roleGrants")}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {STAFF_PERMISSIONS[role].map((permission) => (
                <li
                  key={permission}
                  className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-semibold text-body"
                >
                  {t(`staff.permission.${permission}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            disabled={saving}
            onClick={() => setErrors(onSubmit({ name, email, phone, role }))}
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {member ? t("save") : t("staff.sendInvite")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * One person's permissions.
 *
 * Every switch shows *why* it is on — from the role, or granted specially — and
 * every change is stored as the difference from the role rather than as a list. So
 * turning on something the role already grants records nothing, and a later change
 * to what managers can do still reaches this person. `lib/staff.setStaffPermission`
 * is what decides that; this dialog only reports it.
 */
function PermissionsDialog({
  member,
  onClose,
  onToggle,
}: {
  member: StaffMember;
  onClose: () => void;
  onToggle: (permission: StaffPermission, enabled: boolean) => void;
}) {
  const t = useTranslations("vendorSettings");
  const active = effectivePermissions(member);

  return (
    <Modal open onClose={onClose} labelledBy="perm-title" className="sm:max-w-md">
      <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
        <h2 id="perm-title" className="text-h3 text-ink">
          {t("staff.permissionsTitle")}
        </h2>
        <p className="mt-1 text-sm text-body">
          {t("staff.permissionsBody", {
            name: member.name,
            role: t(`staff.role.${member.role}`),
          })}
        </p>

        {member.status !== "active" && (
          /* A deactivated person folds to no permissions at all — that is what
             deactivation *is*. Saying so prevents the switches below reading as
             access somebody still has. */
          <p className="mt-3 rounded-field bg-surface-muted p-3 text-xs text-muted">
            {t("staff.permissionsInactive")}
          </p>
        )}

        <ul className="mt-4 space-y-1.5">
          {STAFF_PERMISSIONS_ALL.map((permission) => {
            const on = active.includes(permission);
            const origin = permissionOrigin(member, permission);
            return (
              <li key={permission}>
                <label className="flex cursor-pointer items-start gap-3 rounded-field border border-line bg-surface p-3 transition-colors hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => onToggle(permission, e.target.checked)}
                    className="mt-0.5 size-4.5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      {t(`staff.permission.${permission}`)}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t(`staff.origin.${origin}`)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
