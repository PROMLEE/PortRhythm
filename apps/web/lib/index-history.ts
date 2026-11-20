import type { IndexClose } from "../app/drawdown";

/**
 * Parses KIS overseas index daily rows (inquire-daily-chartprice output2).
 * Field names follow the KIS documentation: stck_bsop_date (YYYYMMDD) and
 * ovrs_nmix_prpr (closing index value for daily rows).
 */
export function parseIndexRows(rows: unknown): IndexClose[] {
  if (!Array.isArray(rows)) return [];
  const parsed: IndexClose[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const date = String(record.stck_bsop_date ?? "");
    const close = Number(record.ovrs_nmix_prpr);
    if (!/^\d{8}$/.test(date) || !Number.isFinite(close) || close <= 0) continue;
    parsed.push({ date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, close });
  }
  return parsed;
}

export const compactDate = (date: string) => date.replaceAll("-", "");

export function previousDay(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
