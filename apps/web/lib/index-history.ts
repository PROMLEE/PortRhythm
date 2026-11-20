import type { IndexClose } from "../app/drawdown";

/**
 * Parses KIS index daily rows (output2). Dates are stck_bsop_date (YYYYMMDD);
 * the close is ovrs_nmix_prpr for overseas indexes and bstp_nmix_prpr for
 * domestic ones.
 */
export function parseIndexRows(
  rows: unknown,
  closeField: "ovrs_nmix_prpr" | "bstp_nmix_prpr" = "ovrs_nmix_prpr",
): IndexClose[] {
  if (!Array.isArray(rows)) return [];
  const parsed: IndexClose[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const date = String(record.stck_bsop_date ?? "");
    const close = Number(record[closeField]);
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

/**
 * Today's KOSPI row is the live price until the market closes (15:30 KST, with
 * a short margin), so it is not a close yet.
 */
export function withoutUnclosedKoreanSession(rows: IndexClose[], now: Date): IndexClose[] {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const today = kst.toISOString().slice(0, 10);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes < 15 * 60 + 40 ? rows.filter((row) => row.date !== today) : rows;
}
