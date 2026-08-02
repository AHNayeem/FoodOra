import type { QrTarget } from "@/frontend/types";
import { qrSvgMarkup } from "@/frontend/components/qr/qr-code";

/**
 * qr-print.ts — turning codes into paper (Phase C12).
 *
 * Printing happens in a detached window rather than with `print:` styles on the
 * dashboard, for one practical reason: table tents need their own page size,
 * margins and grid, and fighting the dashboard's sticky shell for that would be
 * far more fragile than handing the browser a clean document.
 */

/** Copy the print sheet needs; passed in so this stays free of react-intl. */
export interface QrPrintStrings {
  documentTitle: string;
  scanTitle: string;
  scanHint: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHEET_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1a1512;
    background: #fff;
  }
  .sheet {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10mm;
  }
  .tent {
    border: 1.5pt dashed #d8cfc8;
    border-radius: 6mm;
    padding: 8mm 6mm;
    text-align: center;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .venue { font-size: 11pt; font-weight: 800; letter-spacing: -0.01em; }
  .label {
    display: inline-block;
    margin-top: 2mm;
    padding: 1.5mm 4mm;
    border-radius: 999px;
    background: #f24822;
    color: #fff;
    font-size: 10pt;
    font-weight: 700;
  }
  .code { margin: 5mm auto 0; width: 46mm; height: 46mm; }
  .code svg { width: 100%; height: 100%; display: block; }
  .scan { margin-top: 4mm; font-size: 10pt; font-weight: 700; }
  .hint { margin-top: 1mm; font-size: 8pt; color: #6b615a; }
  .url { margin-top: 2mm; font-size: 6.5pt; color: #9a8f88; word-break: break-all; }
`;

/**
 * Render one table tent per target into a new window and open the print
 * dialogue. Returns false when the popup was blocked so the caller can say so.
 */
export async function printQrSheet(
  targets: QrTarget[],
  origin: string,
  vendorName: string,
  strings: QrPrintStrings,
): Promise<boolean> {
  const win = window.open("", "_blank", "width=980,height=760");
  if (!win) return false;

  // Encode every code first — the print dialogue must not open on a blank page.
  const tents = await Promise.all(
    targets.map(async (target) => {
      const url = `${origin.replace(/\/$/, "")}${target.path}`;
      const svg = await qrSvgMarkup(url, 240);
      return `
        <div class="tent">
          <div class="venue">${escapeHtml(vendorName)}</div>
          <div class="label">${escapeHtml(target.label)}</div>
          <div class="code">${svg}</div>
          <div class="scan">${escapeHtml(strings.scanTitle)}</div>
          <div class="hint">${escapeHtml(strings.scanHint)}</div>
          <div class="url">${escapeHtml(url)}</div>
        </div>`;
    }),
  );

  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<title>${escapeHtml(strings.documentTitle)}</title>` +
      `<style>${SHEET_CSS}</style></head>` +
      `<body><div class="sheet">${tents.join("")}</div></body></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
  return true;
}

/** Trigger a browser download for a generated code. */
export function downloadBlob(content: Blob | string, filename: string): void {
  const url =
    typeof content === "string" ? content : URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (typeof content !== "string") URL.revokeObjectURL(url);
}

/** Absolute URL a target's code encodes, given the studio's current host. */
export function targetUrl(origin: string, target: QrTarget): string {
  return `${origin.replace(/\/$/, "")}${target.path}`;
}
