"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { MessageSquare, Phone, Send, X } from "lucide-react";
import type { ContactAuthor, ContactParty, Order } from "@/types";
import { useOrderChat } from "@/stores/order-chat";
import {
  MAX_MESSAGE_LENGTH,
  QUICK_MESSAGES,
  QUICK_REPLIES,
  canContact,
  counterpartyName,
} from "@/lib/order-chat";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * ContactDialog — the conversation about an order (Phase 17, G27).
 *
 * What replaces `toast.info("Calling {name}… (demo)")`. The thread is real, it is
 * attached to the order, and both ends read the same rows — so a rider answering
 * from the trip screen in the tab next door appears here, which is the same trick
 * the order lifecycle has used since Phase 1.
 *
 * The call button still does not place a call, because there is no telephony
 * provider and pretending otherwise is exactly the fabricated capability the spec
 * forbids. What it does is *record the attempt* in the thread, which is what a
 * real call would have left behind and is something the other side can act on.
 *
 * `viewer` is which side is looking, so one component serves the customer's
 * tracker and the courier's trip screen rather than two near-identical ones.
 */
export function ContactDialog({
  order,
  party,
  viewer,
  viewerName,
  open,
  onClose,
}: {
  order: Order;
  party: ContactParty;
  viewer: ContactAuthor;
  viewerName: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("contact");
  const format = useFormatter();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const threads = useOrderChat((s) => s.threads);
  const send = useOrderChat((s) => s.send);
  const logCall = useOrderChat((s) => s.logCall);
  const threadFor = useOrderChat((s) => s.threadFor);

  useEffect(() => {
    void useOrderChat.persist.rehydrate();
  }, []);

  // `threads` participates so this re-reads when the other side writes.
  const thread = threads.length >= 0 ? threadFor(order.id, party) : null;
  const entries = thread?.entries ?? [];

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, entries.length]);

  const closed = !canContact(order, party);
  const name = counterpartyName(order, party) || t(`party.${party}`);
  // The customer opens with a question; the other side answers one.
  const quick = viewer === "customer" ? QUICK_MESSAGES[party] : QUICK_REPLIES[party];

  function post(body: string) {
    if (closed) return;
    send(order, party, { author: viewer, authorName: viewerName, body });
    setDraft("");
  }

  function call() {
    logCall(order, party, { author: viewer, authorName: viewerName });
    toast.info(t("callLogged", { name }));
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="contact-title" className="sm:max-w-md">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="contact-title" className="truncate text-h3 text-ink">
            {name}
          </h2>
          <p className="truncate text-sm text-muted">
            {t("aboutOrder", { number: order.orderNumber })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="icon" aria-label={t("call")} onClick={call}>
            <Phone className="size-4" aria-hidden />
          </Button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="inline-flex size-9 items-center justify-center rounded-pill text-muted hover:bg-surface-muted hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="max-h-[45vh] min-h-40 space-y-3 overflow-y-auto px-5 py-4">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("empty", { name })}</p>
        ) : (
          entries.map((entry) => {
            const mine = entry.author === viewer;
            return (
              <div
                key={entry.id}
                className={cn("flex flex-col", mine ? "items-end" : "items-start")}
              >
                {entry.kind === "call" ? (
                  <p className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-3 py-1 text-xs text-muted">
                    <Phone className="size-3" aria-hidden />
                    {t("calledBy", { name: entry.authorName })}
                  </p>
                ) : (
                  <p
                    className={cn(
                      "max-w-[85%] rounded-panel px-3.5 py-2 text-sm",
                      mine ? "bg-primary text-white" : "bg-surface-muted text-body",
                    )}
                  >
                    {entry.body}
                  </p>
                )}
                <time className="mt-0.5 text-[11px] text-muted">
                  {format.dateTime(new Date(entry.at), {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line px-5 py-4">
        {closed ? (
          <p className="text-center text-sm text-muted">{t("closed")}</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {quick.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => post(t(`quick.${key}`))}
                  className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface-muted"
                >
                  {t(`quick.${key}`)}
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                post(draft);
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder={t("placeholder")}
                aria-label={t("placeholder")}
              />
              <Button type="submit" size="icon" aria-label={t("send")} disabled={!draft.trim()}>
                <Send className="size-4" aria-hidden />
              </Button>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}

/** The button that opens it — one import for a surface that only wants that. */
export function ContactButton({
  order,
  party,
  viewer,
  viewerName,
  label,
  className,
}: {
  order: Order;
  party: ContactParty;
  viewer: ContactAuthor;
  viewerName: string;
  label?: string;
  className?: string;
}) {
  const t = useTranslations("contact");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size={label ? "sm" : "icon"}
        aria-label={label ?? t("message")}
        className={className}
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="size-4" aria-hidden />
        {label}
      </Button>
      <ContactDialog
        order={order}
        party={party}
        viewer={viewer}
        viewerName={viewerName}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
