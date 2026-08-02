"use client";

import { useEffect, useState } from "react";
import { cn } from "@/frontend/lib/utils";

/**
 * QrCode — renders a real, scannable QR code as inline SVG (Phase C12).
 *
 * The encoder is loaded on demand (`import("qrcode")`) so it never ships in the
 * initial bundle of a page that only *might* show a code, and so nothing tries
 * to run it during SSR. Codes are always dark-on-white regardless of the app
 * theme: scanners need the contrast, and these get printed.
 */

/** Near-black rather than pure black — matches the brand's ink on paper. */
const QR_DARK = "#1a1512";
const QR_LIGHT = "#ffffff";

/** SVG markup for a value, sized in CSS pixels. */
export async function qrSvgMarkup(value: string, size: number): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: QR_DARK, light: QR_LIGHT },
  });
}

/** PNG data URL for a value — used for the "download PNG" action. */
export async function qrPngDataUrl(value: string, size: number): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: size,
    color: { dark: QR_DARK, light: QR_LIGHT },
  });
}

export function QrCode({
  value,
  size = 200,
  label,
  className,
}: {
  value: string;
  size?: number;
  /** Accessible description of where the code leads. */
  label: string;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    qrSvgMarkup(value, size)
      .then((markup) => {
        if (active) setSvg(markup);
      })
      .catch(() => {
        if (active) setSvg(null);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  const shell = cn(
    "grid shrink-0 place-items-center overflow-hidden rounded-field bg-white [&>svg]:size-full",
    className,
  );
  const box = { width: size, height: size };

  if (!svg) {
    return (
      <div style={box} className={shell} aria-hidden>
        <span className="size-6 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      style={box}
      className={shell}
      // Generated locally by the encoder from our own URL — path data only.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
