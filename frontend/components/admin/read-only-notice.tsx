import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import type { PlatformPermission } from "@/types";

/**
 * ReadOnlyNotice — why the buttons on this screen are dead (Phase 14, G31).
 *
 * The convention Phase 14 settles, because mixing the two would be worse than
 * either: **a section you cannot see is hidden from the nav and refused by the
 * shell; an action you cannot take stays visible and disabled, above one line
 * saying which permission it wants.** Hiding the controls instead would leave a
 * support agent staring at a payout screen with no way to tell whether the
 * transfer button is missing because they may not press it or because the
 * settlement is not payable yet — two very different facts.
 *
 * The permission slug is shown verbatim rather than translated. It is the thing
 * somebody has to quote to whoever administers their account, and a localised
 * paraphrase of `payouts.manage` is not quotable — the same reasoning C25 applied
 * to broadcast copy ("written once, sent as written").
 */
export function ReadOnlyNotice({
  permission,
  className,
}: {
  permission: PlatformPermission;
  className?: string;
}) {
  const t = useTranslations("admin");
  return (
    <p
      className={`flex items-start gap-2 rounded-field bg-accent-50 p-3 text-xs font-medium text-accent-600 ${className ?? ""}`}
    >
      <ShieldAlert className="mt-px size-4 shrink-0" aria-hidden />
      <span>{t("readOnly", { permission })}</span>
    </p>
  );
}
