import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerStatus, isCustomerActive, remainingDays } from "@/lib/customer";

let tempDir = "";
let db: typeof import("@/lib/db");

async function loadFreshDb() {
  vi.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paysys-db-"));
  vi.stubEnv("PAYSYS_DB_PATH", path.join(tempDir, "test.sqlite"));
  db = await import("@/lib/db");
}

describe("customer database", () => {
  beforeEach(async () => {
    await loadFreshDb();
  });

  afterEach(() => {
    vi.useRealTimers();
    db.closeDbForTests();
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("requires payment registration and keeps a seven day expiry grace", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const unpaid = db.createCustomer({ displayName: "李四", expiresAt: future });
    const active = db.extendCustomer({
      customerId: db.createCustomer({ displayName: "张三", expiresAt: future }).id,
      amount: 45,
      periodDays: 180,
    }).customer;
    const graceCustomer = db.extendCustomer({
      customerId: db.createCustomer({ displayName: "宽限", expiresAt: future }).id,
      amount: 45,
      periodDays: 180,
    }).customer;
    const withinGrace = db.updateCustomer(graceCustomer.id, {
      expiresAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    })!;
    const expiredCustomer = db.extendCustomer({
      customerId: db.createCustomer({ displayName: "过期", expiresAt: future }).id,
      amount: 45,
      periodDays: 180,
    }).customer;
    const expired = db.updateCustomer(expiredCustomer.id, {
      expiresAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    })!;
    const disabled = db.updateCustomer(active.id, { disabled: true })!;

    expect(getCustomerStatus(unpaid)).toBe("unpaid");
    expect(getCustomerStatus(withinGrace)).toBe("active");
    expect(getCustomerStatus(expired)).toBe("expired");
    expect(getCustomerStatus(disabled)).toBe("disabled");
    expect(isCustomerActive(unpaid)).toBe(false);
    expect(isCustomerActive(withinGrace)).toBe(true);
    expect(isCustomerActive(expired)).toBe(false);
  });

  it("resets a customer token and invalidates the old link", () => {
    const customer = db.createCustomer({ displayName: "王五" });
    const oldToken = customer.token;
    const oldSessionVersion = customer.sessionVersion;
    const updated = db.resetCustomerToken(customer.id)!;

    expect(updated.token).not.toBe(oldToken);
    expect(updated.sessionVersion).toBe(oldSessionVersion + 1);
    expect(db.getCustomerByToken(oldToken)).toBeNull();
    expect(db.getCustomerByToken(updated.token)?.id).toBe(customer.id);
  });

  it("resets customer data while keeping identity fields", () => {
    const customer = db.createCustomer({
      displayName: "周九",
      qq: "10001",
      groupName: "一群",
      notes: "VIP",
      expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    });
    db.extendCustomer({ customerId: customer.id, amount: 45, periodDays: 180 });
    db.logAccess({ customerId: customer.id, action: "portal_get_subscription" });

    const reset = db.resetCustomerData(customer.id)!;

    expect(reset.displayName).toBe("周九");
    expect(reset.qq).toBe("10001");
    expect(reset.groupName).toBe("一群");
    expect(reset.notes).toBe("VIP");
    expect(reset.sessionVersion).toBe(customer.sessionVersion + 1);
    expect(reset.token).not.toBe(customer.token);
    expect(reset.subscriptionClicks).toBe(0);
    expect(db.listRecentPayments(10).some((payment) => payment.customerId === customer.id)).toBe(false);
  });

  it("deletes a customer and related payment records", () => {
    const customer = db.createCustomer({ displayName: "吴十", qq: "10002" });
    db.extendCustomer({ customerId: customer.id, amount: 45, periodDays: 180 });

    expect(db.deleteCustomer(customer.id)).toBe(true);
    expect(db.getCustomerById(customer.id)).toBeNull();
    expect(db.listRecentPayments(10).some((payment) => payment.customerId === customer.id)).toBe(false);
  });

  it("records payment extension from the later of now or existing expiry", () => {
    const currentExpiry = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const customer = db.createCustomer({ displayName: "赵六", expiresAt: currentExpiry });
    const result = db.extendCustomer({ customerId: customer.id, amount: 30, periodDays: 30 });

    expect(result.payment.amount).toBe(30);
    expect(result.payment.previousExpiresAt).toBe(currentExpiry);
    expect(result.payment.newExpiresAt).toBe(result.customer.expiresAt);
    expect(new Date(result.customer.expiresAt).getTime()).toBeGreaterThan(new Date(currentExpiry).getTime());
  });

  it("extends payments to the end of the displayed China date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T08:48:25.602Z"));
    const customer = db.createCustomer({
      displayName: "月底统一",
      expiresAt: "2026-04-20T15:59:59.000Z",
    });

    const result = db.extendCustomer({ customerId: customer.id, amount: 45, periodDays: 180 });

    expect(result.payment.periodDays).toBe(180);
    expect(result.customer.expiresAt).toBe("2026-10-18T15:59:59.000Z");
    expect(result.payment.newExpiresAt).toBe("2026-10-18T15:59:59.000Z");
  });

  it("counts remaining days by the displayed China date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:30:00.000Z"));

    expect(remainingDays("2026-10-16T08:48:25.602Z")).toBe(178);
    expect(remainingDays("2026-10-16T15:59:59.000Z")).toBe(178);
  });

  it("rejects accidental duplicate payment registration within a minute", () => {
    const currentExpiry = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const customer = db.createCustomer({ displayName: "重复测试", expiresAt: currentExpiry });
    const first = db.extendCustomer({ customerId: customer.id, amount: 45, periodDays: 180 });

    expect(() => db.extendCustomer({ customerId: customer.id, amount: 45, periodDays: 180 })).toThrow("刚刚已登记");
    expect(db.getCustomerById(customer.id)?.expiresAt).toBe(first.customer.expiresAt);
  });

  it("rolls back the customer expiry when deleting the latest matching payment", () => {
    const currentExpiry = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const customer = db.createCustomer({ displayName: "钱七", expiresAt: currentExpiry });
    const extended = db.extendCustomer({ customerId: customer.id, amount: 45, periodDays: 180 });

    const result = db.deletePayment(extended.payment.id);

    expect(result).toEqual({ deleted: true, rolledBack: true });
    expect(db.getCustomerById(customer.id)?.expiresAt).toBe(currentExpiry);
  });

  it("does not roll back expiry when it no longer matches the deleted payment", () => {
    const currentExpiry = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const customer = db.createCustomer({ displayName: "孙八", expiresAt: currentExpiry });
    const first = db.extendCustomer({ customerId: customer.id, amount: 45, periodDays: 180 });
    const second = db.extendCustomer({ customerId: customer.id, amount: 45, periodDays: 180, notes: "二次登记" });

    const result = db.deletePayment(first.payment.id);

    expect(result).toEqual({ deleted: true, rolledBack: false });
    expect(db.getCustomerById(customer.id)?.expiresAt).toBe(second.customer.expiresAt);
  });
});
