import { AccountShell } from "@/frontend/components/account/account-shell";

/**
 * Account section layout (Phase C3). Wraps every `/account/*` page in the shared
 * shell, which enforces the client-side auth gate and renders the section
 * sidebar. Nested inside the marketing layout, so it keeps the site chrome.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
