import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-600 active:bg-primary-700 shadow-sm",
  secondary:
    "bg-surface-muted text-ink hover:bg-line/60 border border-line",
  outline:
    "border border-line bg-transparent text-ink hover:bg-surface-muted",
  ghost: "bg-transparent text-ink hover:bg-surface-muted",
  danger: "bg-danger text-white hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
  icon: "h-11 w-11 p-0",
};

const baseClass =
  "inline-flex items-center justify-center rounded-pill font-semibold whitespace-nowrap transition-[background,color,box-shadow,transform] duration-[var(--duration-fast)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

type ButtonAsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = CommonProps &
  Omit<React.ComponentProps<typeof Link>, "className"> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * Button — the single button primitive. Renders a `<button>` or, when `href`
 * is provided, a Next `<Link>` with identical styling.
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  const classes = cn(baseClass, variants[variant], sizes[size], className);

  if ("href" in props && props.href !== undefined) {
    return <Link className={classes} {...(props as ButtonAsLink)} />;
  }
  return <button className={classes} {...(props as ButtonAsButton)} />;
}
