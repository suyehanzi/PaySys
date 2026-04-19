export type CustomerStatus = "active" | "unpaid" | "expired" | "disabled";

export type CustomerLike = {
  disabled: boolean;
  expiresAt: string;
  paymentCount?: number;
};

const GRACE_DAYS_AFTER_EXPIRY = 7;
const DAY_MS = 86_400_000;

export function getCustomerStatus(customer: CustomerLike, now = new Date()): CustomerStatus {
  if (customer.disabled) return "disabled";
  if ((customer.paymentCount || 0) <= 0) return "unpaid";
  const expiresAt = new Date(customer.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt + GRACE_DAYS_AFTER_EXPIRY * DAY_MS <= now.getTime()) {
    return "expired";
  }
  return "active";
}

export function isCustomerActive(customer: CustomerLike, now = new Date()): boolean {
  return getCustomerStatus(customer, now) === "active";
}

export function remainingDays(expiresAt: string, now = new Date()): number {
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return 0;
  const diff = expiry - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 86_400_000);
}
