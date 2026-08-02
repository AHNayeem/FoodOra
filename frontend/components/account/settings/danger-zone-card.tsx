"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, LogOut, ShieldAlert, Trash2 } from "lucide-react";
import { deleteAccount } from "@/frontend/services/settings";
import { useAddresses } from "@/frontend/stores/addresses";
import { useAuth } from "@/frontend/stores/auth";
import { useCart } from "@/frontend/stores/cart";
import { useCatering } from "@/frontend/stores/catering";
import { useFavorites } from "@/frontend/stores/favorites";
import { useOrders } from "@/frontend/stores/orders";
import { useSettings } from "@/frontend/stores/settings";
import { useWallet } from "@/frontend/stores/wallet";
import { Button } from "@/frontend/components/ui/button";
import { Field } from "@/frontend/components/ui/field";
import { Input } from "@/frontend/components/ui/input";
import { Modal } from "@/frontend/components/ui/modal";
import { SettingsSection } from "./settings-primitives";

/**
 * The slice of a zustand store this card needs. Declared structurally so the
 * list below can hold stores with different state shapes without TypeScript
 * collapsing them into an uncallable union.
 */
interface PersistedStore {
  getState: () => unknown;
  persist: { getOptions: () => { name?: string }; clearStorage: () => void };
}

/** Every persisted customer store, so "delete" and "export" cover the same set. */
const CUSTOMER_STORES: PersistedStore[] = [
  useAuth,
  useAddresses,
  useCart,
  useCatering,
  useFavorites,
  useOrders,
  useSettings,
  useWallet,
] as const;

/**
 * DangerZoneCard — data export, session revocation and account closure
 * (Phase C28).
 *
 * Export and delete both walk {@link CUSTOMER_STORES}, so they can't disagree
 * about what "your data" means: whatever the prototype persists is exactly what
 * gets handed over and exactly what gets wiped. There is no server to revoke a
 * token against, so "sign out everywhere" clears the local session — the call
 * a real backend would make lives in `services/settings.ts`.
 */
export function DangerZoneCard() {
  const t = useTranslations("settings");
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const [confirming, setConfirming] = useState(false);

  /** Hand back everything held locally as a JSON file. */
  function exportData() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      account: user,
      data: Object.fromEntries(
        CUSTOMER_STORES.map((store) => {
          const state = store.getState() as Record<string, unknown>;
          // Keep only the data: actions and the transient hydration flags say
          // nothing about the customer.
          const fields = Object.entries(state).filter(
            ([key, value]) =>
              typeof value !== "function" && key !== "hydrated" && key !== "seeded",
          );
          return [store.persist.getOptions().name ?? "unknown", Object.fromEntries(fields)];
        }),
      ),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "foodora-account-data.json";
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t("exportDone"));
  }

  function signOutEverywhere() {
    signOut();
    toast.success(t("signedOutEverywhere"));
    router.push("/");
  }

  return (
    <>
      <SettingsSection
        icon={<ShieldAlert className="size-4.5" aria-hidden />}
        title={t("dangerTitle")}
        description={t("dangerDescription")}
      >
        <div className="divide-y divide-line">
          <DangerRow
            title={t("exportTitle")}
            body={t("exportBody")}
            action={
              <Button variant="outline" onClick={exportData}>
                <Download className="size-4" aria-hidden />
                {t("exportAction")}
              </Button>
            }
          />
          <DangerRow
            title={t("signOutAllTitle")}
            body={t("signOutAllBody")}
            action={
              <Button variant="outline" onClick={signOutEverywhere}>
                <LogOut className="size-4" aria-hidden />
                {t("signOutAllAction")}
              </Button>
            }
          />
          <DangerRow
            title={t("deleteTitle")}
            body={t("deleteBody")}
            action={
              <Button
                variant="outline"
                onClick={() => setConfirming(true)}
                className="border-danger text-danger hover:bg-danger/10"
              >
                <Trash2 className="size-4" aria-hidden />
                {t("deleteAction")}
              </Button>
            }
          />
        </div>
      </SettingsSection>

      {confirming && (
        <DeleteAccountModal
          email={user?.email ?? ""}
          onClose={() => setConfirming(false)}
          onDeleted={() => {
            // Wipe first, then drop the session: the gate in AccountShell reacts
            // to `user`, so clearing it last avoids a render against half-empty
            // stores.
            for (const store of CUSTOMER_STORES) store.persist.clearStorage();
            useFavorites.getState().clear();
            useSettings.getState().reset();
            signOut();
            toast.success(t("deleteDone"));
            router.push("/");
          }}
        />
      )}
    </>
  );
}

function DangerRow({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{body}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/**
 * Closure confirmation. Typing the account email is the gate rather than a fixed
 * word, so the check works the same in every locale and can't be cleared by
 * muscle memory.
 */
function DeleteAccountModal({
  email,
  onClose,
  onDeleted,
}: {
  email: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("settings");
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const matches = typed.trim().toLowerCase() === email.toLowerCase() && email !== "";

  function confirm() {
    setDeleting(true);
    deleteAccount(reason).then((res) => {
      setDeleting(false);
      if (res.error) {
        toast.error(t("deleteError"));
        return;
      }
      onDeleted();
    });
  }

  return (
    <Modal open onClose={onClose} labelledBy="delete-account-title" className="p-6">
      <h2 id="delete-account-title" className="text-h3 text-ink">
        {t("deleteModalTitle")}
      </h2>
      <p className="mt-1 text-sm text-body">{t("deleteModalBody")}</p>

      <div className="mt-5 space-y-4">
        <Field id="delete-reason" label={t("deleteReason")} hint={t("deleteReasonHint")}>
          {({ id }) => (
            <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <Field id="delete-confirm" label={t("deleteConfirmLabel", { email })}>
          {({ id }) => (
            <Input
              id={id}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={email}
            />
          )}
        </Field>
      </div>

      <div className="mt-6 flex gap-2">
        <Button
          className="flex-1 !bg-danger hover:!bg-danger/90"
          disabled={!matches || deleting}
          onClick={confirm}
        >
          {deleting ? t("deleting") : t("deleteConfirmAction")}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </Modal>
  );
}
