const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function defaultExpiryIso(days = 30): string {
  return addDaysAtChinaEndOfDay(new Date(), days);
}

export function chinaDayNumber(date: Date): number {
  return Math.floor((date.getTime() + CHINA_OFFSET_MS) / DAY_MS);
}

export function addDaysAtChinaEndOfDay(date: Date, days: number): string {
  const chinaDate = new Date(date.getTime() + CHINA_OFFSET_MS);
  const year = chinaDate.getUTCFullYear();
  const month = chinaDate.getUTCMonth();
  const day = chinaDate.getUTCDate() + days;
  return new Date(Date.UTC(year, month, day, 15, 59, 59, 0)).toISOString();
}

export function parseDateInputToIso(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("日期不能为空");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T23:59:59+08:00`).toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("日期格式无效");
  }
  return parsed.toISOString();
}

export function dateInputValue(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function formatDateTime(iso: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
