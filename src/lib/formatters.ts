/**
 * Format a number as Brazilian currency (R$ X.XXX,XX)
 * Uses toLocaleString for proper thousand separators.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

/**
 * Format a number as currency without decimals (R$ X.XXX)
 * Used in CRM pipeline and dashboard summaries.
 */
export function formatCurrencyCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

/**
 * Format a date string to pt-BR locale (dd/mm/aaaa).
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

/**
 * Format a date string to short month format (e.g., "mar/25").
 */
export function formatDateShort(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

/**
 * Normalize a phone number by stripping non-digits.
 * Optionally keeps only the last 11 digits (DDD + number).
 */
export function normalizePhone(value: string | null | undefined, trimTo11 = false): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return trimTo11 ? digits.slice(-11) : digits;
}
