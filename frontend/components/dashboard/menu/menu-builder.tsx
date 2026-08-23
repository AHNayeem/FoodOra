"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Flame,
  PackageX,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Warehouse,
} from "lucide-react";
import type { MenuBoardItem, MenuBoardSection, MenuSectionWithItems } from "@/types";
import type { CurrencyCode } from "@/config/regions";
import { getVendorMenu } from "@/services/catalog";
import { useMenu, menuBoardFor } from "@/stores/menu";
import { useMerchant } from "@/stores/merchant";
import {
  emptyMenuDraft,
  isMenuDraftEmpty,
  itemDraftFrom,
  menuCounts,
  type MenuError,
  type MenuItemDraft,
} from "@/lib/menu";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { useDashboard } from "../dashboard-context";
import { StatCard } from "../stat-card";
import { ItemEditor } from "./item-editor";
import { StockDialog } from "./stock-dialog";

/**
 * MenuBuilder — authoring the menu (Phase 9, G19–G21).
 *
 * This screen used to be a read-only list with an availability switch, and its own
 * comment said the builder would "land in a later phase". It is the whole spec list
 * now: sections created, renamed, reordered, switched off and deleted; items created,
 * edited, priced and deleted; option groups built with their own required/optional and
 * min/max; and stock with a low-stock warning and an automatic sold-out state.
 *
 * Two things about how it is put together.
 *
 * **The board is the fold, not a copy.** `menuBoardFor` lays the restaurant's draft
 * over the read-only catalog and returns the menu as it actually is. The same fold —
 * `lib/menu` — resolves the dish the customer's add-to-cart button prices and the grid
 * the POS register sells from, so there is no version of this menu that only the
 * merchant can see. That is the phase's rule: one menu model, one fold.
 *
 * **Availability is derived and never written.** The 86 switch is still
 * `stores/merchant.unavailable`, where the POS terminal already read it; sold-out is
 * the stock count reaching zero; a switched-off section takes its items with it. Three
 * facts, combined once in `lib/menu.isLive` — which is why a row can say *why* it is
 * off instead of just showing a grey toggle.
 */
export function MenuBuilder() {
  const t = useTranslations("menuBuilder");
  const { vendor } = useDashboard();
  const currency = vendor.currency as CurrencyCode;

  const [base, setBase] = useState<MenuSectionWithItems[] | null>(null);

  const drafts = useMenu((s) => s.drafts);
  const menuHydrated = useMenu((s) => s.hydrated);
  const addSection = useMenu((s) => s.addSection);
  const renameSection = useMenu((s) => s.renameSection);
  const reorderSection = useMenu((s) => s.reorderSection);
  const toggleSection = useMenu((s) => s.toggleSection);
  const deleteSection = useMenu((s) => s.deleteSection);
  const addItem = useMenu((s) => s.addItem);
  const saveItem = useMenu((s) => s.saveItem);
  const deleteItem = useMenu((s) => s.deleteItem);
  const trackStock = useMenu((s) => s.trackStock);
  const changeStock = useMenu((s) => s.changeStock);
  const stopTracking = useMenu((s) => s.stopTracking);
  const resetVendor = useMenu((s) => s.resetVendor);

  const unavailable = useMerchant((s) => s.unavailable);
  const merchantHydrated = useMerchant((s) => s.hydrated);
  const toggleItem = useMerchant((s) => s.toggleItem);

  // Dialog state.
  const [sectionForm, setSectionForm] = useState<{ id: string | null; name: string } | null>(
    null,
  );
  const [itemForm, setItemForm] = useState<
    { itemId: string | null; sectionId: string; initial?: MenuItemDraft } | null
  >(null);
  const [itemErrors, setItemErrors] = useState<Record<string, MenuError>>({});
  /**
   * The dish whose stock is being edited, held as an *id*.
   *
   * The board row is re-derived on every fold, so holding the row itself would pin
   * the dialog to a stale copy — and the manual adjustment buttons write through to
   * the store, so the dialog has to see its own change.
   */
  const [stockId, setStockId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void useMenu.persist.rehydrate();
  }, []);

  useEffect(() => {
    let active = true;
    getVendorMenu(vendor.id).then((list) => {
      if (active) setBase(list);
    });
    return () => {
      active = false;
    };
  }, [vendor.id]);

  const ready = base != null && menuHydrated && merchantHydrated;

  const board = useMemo<MenuBoardSection[]>(
    () =>
      base
        ? menuBoardFor(drafts, vendor.id, base, merchantHydrated ? unavailable : [])
        : [],
    [base, drafts, vendor.id, unavailable, merchantHydrated],
  );

  const counts = useMemo(() => menuCounts(board), [board]);
  const stockEntry = useMemo(
    () => board.flatMap((s) => s.items).find((i) => i.item.id === stockId) ?? null,
    [board, stockId],
  );
  // Read from the subscribed slice rather than `getState()`, so the "discard" button
  // appears the moment the first edit lands instead of on the next unrelated render.
  const edited = !isMenuDraftEmpty(drafts[vendor.id] ?? emptyMenuDraft(vendor.id));

  if (!ready) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-card bg-surface" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  const sections = board.map((s) => s.section);

  function handleSectionSubmit() {
    if (!sectionForm) return;
    const result = sectionForm.id
      ? renameSection(vendor.id, sectionForm.id, sectionForm.name)
      : addSection(vendor.id, sections, sectionForm.name);
    if (result.error) {
      toast.error(t(result.error));
      return;
    }
    setSectionForm(null);
    toast.success(sectionForm.id ? t("sectionRenamed") : t("sectionCreated"));
  }

  function handleItemSubmit(draft: MenuItemDraft) {
    if (!itemForm) return;
    const result = itemForm.itemId
      ? saveItem(vendor.id, itemForm.itemId, draft)
      : addItem(vendor.id, draft);
    if (Object.keys(result.errors).length) {
      setItemErrors(result.errors);
      return;
    }
    setItemErrors({});
    setItemForm(null);
    toast.success(itemForm.itemId ? t("itemSaved") : t("itemCreated"));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {edited && (
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-4" aria-hidden />
              {t("discardEdits")}
            </Button>
          )}
          <Button size="sm" onClick={() => setSectionForm({ id: null, name: "" })}>
            <Plus className="size-4" aria-hidden />
            {t("addSection")}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t("statLive")}
          value={`${counts.live} / ${counts.items}`}
          icon={Star}
          hint={t("statLiveHint", { count: counts.sections })}
        />
        <StatCard
          label={t("statLow")}
          value={String(counts.low)}
          icon={AlertTriangle}
          hint={t("statLowHint")}
        />
        <StatCard
          label={t("statOut")}
          value={String(counts.out)}
          icon={PackageX}
          hint={t("statOutHint")}
        />
      </div>

      {board.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line py-16 text-center">
          <p className="text-sm font-semibold text-ink">{t("emptyTitle")}</p>
          <p className="max-w-sm text-xs text-muted">{t("emptyHint")}</p>
          <Button size="sm" onClick={() => setSectionForm({ id: null, name: "" })}>
            {t("addSection")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {board.map((section, index) => (
            <section
              key={section.section.id}
              className={cn(
                "rounded-card border border-line bg-surface p-4 shadow-card",
                !section.enabled && "opacity-70",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                  {section.section.name}
                  <span className="ms-2 font-medium text-muted">
                    {section.items.length}
                  </span>
                  {!section.enabled && (
                    <span className="ms-2 rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-bold text-muted">
                      {t("sectionOff")}
                    </span>
                  )}
                  {section.authored && (
                    <span className="ms-2 rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                      {t("authored")}
                    </span>
                  )}
                </h2>

                {/* Reordering is two buttons rather than a drag handle: it has to
                    work with a keyboard and on a phone in a kitchen, and a
                    drag-and-drop list satisfies neither. */}
                <IconButton
                  label={t("moveUp", { name: section.section.name })}
                  disabled={index === 0}
                  onClick={() =>
                    reorderSection(vendor.id, sections, section.section.id, "up")
                  }
                >
                  <ChevronUp className="size-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={t("moveDown", { name: section.section.name })}
                  disabled={index === board.length - 1}
                  onClick={() =>
                    reorderSection(vendor.id, sections, section.section.id, "down")
                  }
                >
                  <ChevronDown className="size-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={t("renameSection", { name: section.section.name })}
                  onClick={() =>
                    setSectionForm({ id: section.section.id, name: section.section.name })
                  }
                >
                  <Pencil className="size-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={
                    section.enabled
                      ? t("disableSection", { name: section.section.name })
                      : t("enableSection", { name: section.section.name })
                  }
                  onClick={() =>
                    toggleSection(vendor.id, section.section.id, !section.enabled)
                  }
                  active={!section.enabled}
                >
                  <EyeOff className="size-4" aria-hidden />
                </IconButton>
                <IconButton
                  label={t("deleteSection", { name: section.section.name })}
                  tone="danger"
                  onClick={() => {
                    deleteSection(
                      vendor.id,
                      section.section.id,
                      section.items.map((i) => i.item.id),
                    );
                    toast.success(t("sectionDeleted", { name: section.section.name }));
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setItemErrors({});
                    setItemForm({ itemId: null, sectionId: section.section.id });
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  {t("addItem")}
                </Button>
              </div>

              {section.items.length === 0 ? (
                <p className="mt-3 rounded-field bg-surface-muted p-3 text-xs text-muted">
                  {t("sectionEmpty")}
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {section.items.map((entry) => (
                    <ItemRow
                      key={entry.item.id}
                      entry={entry}
                      currency={currency}
                      onEdit={() => {
                        setItemErrors({});
                        setItemForm({
                          itemId: entry.item.id,
                          sectionId: entry.item.sectionId,
                          initial: itemDraftFrom(entry.item),
                        });
                      }}
                      onDelete={() => {
                        deleteItem(vendor.id, entry.item.id);
                        toast.success(t("itemDeleted", { name: entry.item.name }));
                      }}
                      onStock={() => setStockId(entry.item.id)}
                      onToggle={() => {
                        toggleItem(entry.item.id);
                        toast.success(
                          entry.suppressed
                            ? t("itemBackOn", { name: entry.item.name })
                            : t("item86ed", { name: entry.item.name }),
                        );
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Section name — a create and a rename over one field. */}
      <Modal
        open={sectionForm != null}
        onClose={() => setSectionForm(null)}
        labelledBy="section-form-title"
        className="p-5"
      >
        <h2 id="section-form-title" className="text-h3 text-ink">
          {sectionForm?.id ? t("renameSectionTitle") : t("addSectionTitle")}
        </h2>
        <div className="mt-4">
          <Input
            value={sectionForm?.name ?? ""}
            onChange={(e) =>
              setSectionForm((f) => (f ? { ...f, name: e.target.value } : f))
            }
            placeholder={t("sectionNamePlaceholder")}
            aria-label={t("sectionName")}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setSectionForm(null)}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={handleSectionSubmit}>
            {t("save")}
          </Button>
        </div>
      </Modal>

      {/* Mounted only while open, and keyed by what it is editing, so its draft is
          initialised once instead of being reset by an effect. */}
      {itemForm && (
        <ItemEditor
          key={itemForm.itemId ?? `new-${itemForm.sectionId}`}
          onClose={() => {
            setItemForm(null);
            setItemErrors({});
          }}
          onSubmit={handleItemSubmit}
          sections={board}
          initial={itemForm.initial}
          initialSectionId={itemForm.sectionId}
          errors={itemErrors}
          title={itemForm.itemId ? t("editItemTitle") : t("addItemTitle")}
        />
      )}

      {stockId && stockEntry && (
        <StockDialog
          key={stockId}
          onClose={() => setStockId(null)}
          entry={stockEntry}
          onSave={(input) => {
            const result = trackStock(vendor.id, stockId, input);
            if (result.error) {
              toast.error(t(result.error));
              return;
            }
            setStockId(null);
            toast.success(t("stockSaved", { name: stockEntry.item.name }));
          }}
          onAdjust={(delta) => {
            const result = changeStock(vendor.id, stockId, delta);
            if (result.error) toast.error(t(result.error));
          }}
          onStopTracking={() => {
            stopTracking(vendor.id, stockId);
            setStockId(null);
            toast.success(t("stockStopped", { name: stockEntry.item.name }));
          }}
        />
      )}

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        labelledBy="reset-menu-title"
        className="p-5"
      >
        <h2 id="reset-menu-title" className="text-h3 text-ink">
          {t("discardTitle")}
        </h2>
        <p className="mt-2 text-sm text-body">{t("discardBody")}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              resetVendor(vendor.id);
              setConfirmReset(false);
              toast.success(t("discarded"));
            }}
          >
            {t("discardConfirm")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * One dish on the board.
 *
 * The state line says *why* a dish is off, because "sold out", "switched off" and
 * "its section is off" are three different things for a merchant to do something
 * about — which is the whole gain over the boolean this screen used to show.
 */
function ItemRow({
  entry,
  currency,
  onEdit,
  onDelete,
  onStock,
  onToggle,
}: {
  entry: MenuBoardItem;
  currency: CurrencyCode;
  onEdit: () => void;
  onDelete: () => void;
  onStock: () => void;
  onToggle: () => void;
}) {
  const t = useTranslations("menuBuilder");
  const { item, live, stockState, suppressed } = entry;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3 transition-opacity",
        !live && "opacity-60",
      )}
    >
      {item.image ? (
        <Image
          src={item.image}
          alt=""
          width={56}
          height={56}
          className="size-14 shrink-0 rounded-field object-cover"
        />
      ) : (
        // An authored dish with no photograph shows its initial rather than a stock
        // picture of somebody else's food — the same call Phase 6 made for logos.
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-field bg-surface-muted text-lg font-bold text-muted">
          {item.name.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
          {item.isPopular && (
            <Star className="size-3.5 shrink-0 fill-rating text-rating" aria-label={t("popular")} />
          )}
          {item.spicyLevel > 0 && <Flame className="size-3.5 shrink-0 text-primary" aria-hidden />}
          {entry.authored && (
            <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              {t("authored")}
            </span>
          )}
          {item.optionGroups.length > 0 && (
            <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-body">
              {t("optionGroupCount", { count: item.optionGroups.length })}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm font-bold text-ink tabular-nums">
          {formatPrice(item.price, currency)}
          {item.compareAtPrice != null && (
            <span className="ms-2 text-xs font-medium text-muted line-through">
              {formatPrice(item.compareAtPrice, currency)}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs">
          <StateLine
            live={live}
            suppressed={suppressed}
            stockState={stockState}
            quantity={entry.stock?.quantity ?? null}
          />
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton label={t("stockFor", { name: item.name })} onClick={onStock}>
          <Warehouse className="size-4" aria-hidden />
        </IconButton>
        <IconButton label={t("editItem", { name: item.name })} onClick={onEdit}>
          <Pencil className="size-4" aria-hidden />
        </IconButton>
        <IconButton label={t("deleteItem", { name: item.name })} tone="danger" onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
        {/* The 86 switch, unchanged from the screen this replaced — same store, so
            the POS register and the storefront see it exactly as before. */}
        <button
          type="button"
          role="switch"
          aria-checked={!suppressed}
          aria-label={t("toggleAvailability", { name: item.name })}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors",
            suppressed ? "bg-line" : "bg-fresh",
          )}
        >
          <span
            className={cn(
              "inline-block size-5 rounded-pill bg-white shadow-sm transition-transform",
              suppressed
                ? "translate-x-0.5 rtl:-translate-x-0.5"
                : "translate-x-5 rtl:-translate-x-5",
            )}
          />
        </button>
      </div>
    </li>
  );
}

/** Why this dish is on or off, in one line. */
function StateLine({
  live,
  suppressed,
  stockState,
  quantity,
}: {
  live: boolean;
  suppressed: boolean;
  stockState: MenuBoardItem["stockState"];
  quantity: number | null;
}) {
  const t = useTranslations("menuBuilder");

  if (stockState === "out") {
    return <span className="font-semibold text-danger">{t("stateSoldOut")}</span>;
  }
  if (suppressed) {
    return <span className="font-semibold text-muted">{t("stateSuppressed")}</span>;
  }
  if (!live) {
    // Nothing left it could be: the item is on, in stock, and still not orderable,
    // so its section is switched off.
    return <span className="font-semibold text-muted">{t("stateSectionOff")}</span>;
  }
  if (stockState === "low") {
    return (
      <span className="font-semibold text-accent-600">
        {t("stateLow", { count: quantity ?? 0 })}
      </span>
    );
  }
  if (stockState === "in-stock") {
    return (
      <span className="font-semibold text-fresh-600">
        {t("stateInStock", { count: quantity ?? 0 })}
      </span>
    );
  }
  return <span className="text-muted">{t("stateAvailable")}</span>;
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  tone = "neutral",
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-pill transition-colors disabled:opacity-40",
        tone === "danger"
          ? "text-danger hover:bg-danger/5"
          : active
            ? "bg-primary/10 text-primary"
            : "text-body hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}
