"use client";

import { useState } from "react";
import { BellRing, CupSoda, ReceiptText, Utensils, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { QrMenuConfig, ServiceRequestKind } from "@/types";
import { useDineIn } from "@/stores/dine-in";
import { requestService } from "@/services/qr";
import { isRequestAcknowledged, SERVICE_REQUEST_KINDS } from "@/lib/qr";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";

/**
 * QrServiceSheet — raising a hand from the table (Phase C12).
 *
 * Which actions appear is the venue's call: a counter-service cafe shows none,
 * a full-service restaurant shows all four. Water and cutlery ride along with
 * the waiter call rather than being separate settings — they're the same
 * "someone come over" gesture with a reason attached.
 */
const ICONS: Record<ServiceRequestKind, typeof BellRing> = {
  waiter: BellRing,
  water: CupSoda,
  cutlery: Utensils,
  bill: ReceiptText,
};

export function QrServiceSheet({
  vendorId,
  config,
  now,
  open,
  onClose,
}: {
  vendorId: string;
  config: QrMenuConfig;
  now: number;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("qr");
  const tableId = useDineIn((s) => s.tableId);
  const requests = useDineIn((s) => s.requests);
  const addRequest = useDineIn((s) => s.addRequest);

  const [pending, setPending] = useState<ServiceRequestKind | null>(null);

  const kinds = SERVICE_REQUEST_KINDS.filter((kind) =>
    kind === "bill" ? config.billRequest : config.waiterCall,
  );

  async function handleRequest(kind: ServiceRequestKind) {
    setPending(kind);
    const { data, error } = await requestService({ vendorId, tableId, kind });
    setPending(null);

    if (error || !data) {
      toast.error(t(error ?? "errors.generic"));
      return;
    }

    addRequest(data);
    toast.success(t("serviceSent"));
  }

  const titleId = "qr-service-title";

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id={titleId} className="text-h3 text-ink">
          {t("serviceTitle")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex size-9 items-center justify-center rounded-pill text-body transition-colors hover:bg-surface-muted"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 p-5">
        {kinds.map((kind) => {
          const Icon = ICONS[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => handleRequest(kind)}
              disabled={pending !== null}
              className="flex flex-col items-center gap-2 rounded-field border border-line p-4 text-center transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
            >
              <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-ink">
                {t(`serviceKind.${kind}`)}
              </span>
            </button>
          );
        })}
      </div>

      {requests.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <h3 className="text-sm font-bold text-ink">{t("requests")}</h3>
          <ul className="mt-2 space-y-1.5">
            {requests
              .slice()
              .reverse()
              .map((request) => {
                const acked = isRequestAcknowledged(request, now);
                return (
                  <li
                    key={request.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-body">{t(`serviceKind.${request.kind}`)}</span>
                    <Badge tone={acked ? "fresh" : "neutral"}>
                      {acked ? t("serviceAcked") : t("servicePending")}
                    </Badge>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
