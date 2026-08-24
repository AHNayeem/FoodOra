/**
 * export.ts — taking a table off the screen (Phase 10, G23).
 *
 * The spec asks for "local/prototype export where practical", and CSV is the
 * honest reading of *practical*: the rows are already derived and already on
 * screen, a spreadsheet is where a restaurant actually does the arithmetic the
 * dashboard does not do for them, and it needs no renderer. A PDF would need a
 * layout engine the prototype does not have, and a button that produced a
 * blank-looking page would be worse than no button.
 *
 * Two halves, deliberately separated:
 *
 *  - `toCsv` is pure and has no browser in it, so what the export contains is
 *    testable and is decided in one place rather than inside a click handler.
 *  - `downloadCsv` is the browser half and does nothing else. It is the only
 *    function here that cannot run on the server.
 *
 * Phase E replaces `downloadCsv` with a signed URL from an export endpoint;
 * `toCsv` becomes the server's formatter unchanged.
 */

/** One row of a CSV, in column order. Numbers keep full precision. */
export type CsvCell = string | number | null | undefined;

/**
 * Escape one field for RFC 4180.
 *
 * Quoting is applied whenever the value contains a delimiter, a quote or a line
 * break — and also when it *starts with* a character a spreadsheet would read as a
 * formula. That last rule is why this function exists rather than a `join(",")`:
 * a dish called "=Wagyu (2kg)" pasted into a spreadsheet is a formula, and a
 * restaurant's own menu should not be able to execute anything in the file they
 * just downloaded.
 */
function escapeCell(value: CsvCell): string {
  if (value == null) return "";
  const raw = typeof value === "number" ? String(value) : value;
  const risky = /^[=+\-@\t\r]/.test(raw);
  const body = risky ? `'${raw}` : raw;
  return /[",\n\r]/.test(body) || risky ? `"${body.replace(/"/g, '""')}"` : body;
}

/**
 * Render a header row and its rows as CSV text.
 *
 * CRLF line endings, because that is what RFC 4180 says and what the spreadsheet
 * on a Windows counter machine expects; every other reader accepts them.
 */
export function toCsv(headers: readonly string[], rows: readonly CsvCell[][]): string {
  return [headers.map(escapeCell), ...rows.map((row) => row.map(escapeCell))]
    .map((row) => row.join(","))
    .join("\r\n");
}

/**
 * Hand the file to the browser.
 *
 * A BOM is prepended. Without it, a spreadsheet opening the file on a machine
 * whose locale is not UTF-8 renders every Bengali and Arabic character as
 * mojibake — which, for an export of a Dhaka restaurant's own menu, makes the
 * file useless in exactly the case it matters most.
 *
 * The object URL is revoked on the next frame rather than immediately: revoking
 * it in the same tick cancels the download in some browsers.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * A filename that says what is in the file and when it was taken.
 *
 * Slugged and date-stamped, because the alternative — `export.csv` — collides in
 * a downloads folder the moment somebody exports two ranges to compare them, and
 * the second one silently becomes `export (1).csv`.
 */
export function exportFilename(parts: {
  vendor: string;
  report: string;
  from: string;
  to: string;
}): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "export";
  const day = (iso: string) => iso.slice(0, 10);
  return `${slug(parts.vendor)}-${slug(parts.report)}-${day(parts.from)}-${day(parts.to)}.csv`;
}
