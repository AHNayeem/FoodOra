import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input — the shared text-field primitive used by every form (auth, checkout,
 * settings…). Styling reads from the semantic theme tokens so dark mode and RTL
 * are handled globally. `aria-invalid` drives the error ring; forms set it.
 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-field border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted",
        "transition-[border-color,box-shadow] outline-none",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30",
        className,
      )}
      {...props}
    />
  );
});
