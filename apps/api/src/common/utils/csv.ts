/**
 * CSV / spreadsheet formula-injection guard.
 *
 * A cell whose value begins with a formula trigger (`=`, `+`, `-`, `@`) or a
 * control character (TAB / CR) is executed as a formula by Excel / Google Sheets /
 * LibreOffice when the file is opened. Since these exports embed user-controlled
 * text (display names, company names, notes…), we prefix such values with a single
 * quote so the spreadsheet treats them as literal text instead of a formula.
 *
 * See: OWASP "CSV Injection".
 */
export function csvSafe(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/**
 * Produce a fully-escaped, quoted CSV cell: formula-neutralized (csvSafe) and with
 * embedded double-quotes doubled per RFC 4180.
 */
export function csvCell(value: unknown): string {
  return `"${csvSafe(value).replace(/"/g, '""')}"`;
}
