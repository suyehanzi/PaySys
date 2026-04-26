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
    const vipUnpaid = db.updateCustomer(db.createCustomer({ displayName: "VIP未付", expiresAt: future }).id, {
      isVip: true,
    })!;
    const vipDisabled = db.updateCustomer(vipUnpaid.id, { disabled: true })!;

    expect(getCustomerStatus(unpaid)).toBe("unpaid");
    expect(getCustomerStatus(withinGrace)).toBe("active");
    expect(getCustomerStatus(expired)).toBe("expired");
    expect(getCustomerStatus(disabled)).toBe("disabled");
    expect(getCustomerStatus(vipUnpaid)).toBe("active");
    expect(getCustomerStatus(vipDisabled)).toBe("disabled");
    expect(isCustomerActive(unpaid)).toBe(false);
    expect(isCustomerActive(withinGrace)).toBe(true);
    expect(isCustomerActive(expired)).toBe(false);
    expect(isCustomerActive(vipUnpaid)).toBe(true);
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

  it("marks and cancels VIP for batches of customers", () => {
    const first = db.createCustomer({ displayName: "VIP一号" });
    const second = db.createCustomer({ displayName: "VIP二号" });

    expect(db.setCustomersVip([first.id, second.id], true)).toBe(2);
    expect(db.getCustomerById(first.id)?.isVip).toBe(true);
    expect(db.getCustomerById(second.id)?.isVip).toBe(true);

    expect(db.setCustomersVip([first.id], false)).toBe(1);
    expect(db.getCustomerById(first.id)?.isVip).toBe(false);
    expect(db.getCustomerById(second.id)?.isVip).toBe(true);
  });

  it("lists detailed access logs for admin review", () => {
    const customer = db.createCustomer({ displayName: "记录用户", qq: "10003", groupName: "二群" });
    db.logAccess({
      customerId: customer.id,
      action: "portal_get_subscription",
      ip: "127.0.0.1",
      userAgent: "Clash",
    });

    const logs = db.listAccessLogs(10);

    expect(logs[0]).toMatchObject({
      customerId: customer.id,
      customerDisplayName: "记录用户",
      customerQq: "10003",
      customerGroupName: "二群",
      action: "portal_get_subscription",
      ip: "127.0.0.1",
      userAgent: "Clash",
    });
  });

  it("summarizes portal subscription clicks and sorts customers by latest pull time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T01:00:00.000Z"));
    const older = db.createCustomer({ displayName: "较早拉取", qq: "10004", groupName: "二群" });
    const never = db.createCustomer({ displayName: "未拉取", qq: "10005", groupName: "二群" });
    const newer = db.createCustomer({ displayName: "最新拉取", qq: "10006", groupName: "二群" });

    db.logAccess({ customerId: newer.id, action: "subscription_fetch" });
    db.logAccess({ customerId: older.id, action: "portal_get_subscription" });
    vi.setSystemTime(new Date("2026-04-25T02:00:00.000Z"));
    db.logAccess({ customerId: newer.id, action: "portal_get_subscription" });
    db.logAccess({ customerId: newer.id, action: "user_refresh" });

    const listed = db.listCustomers();

    expect(listed.map((item) => item.id).slice(0, 3)).toEqual([newer.id, older.id, never.id]);
    expect(listed.find((item) => item.id === newer.id)?.subscriptionClicks).toBe(1);
    expect(listed.find((item) => item.id === older.id)?.lastSubscriptionClickAt).not.toBeNull();
  });

  it("stores customer portal passwords as hashes", () => {
    const customer = db.createCustomer({ displayName: "密码用户", qq: "10007" });

    expect(customer.hasPortalPassword).toBe(false);
    expect(db.verifyCustomerPortalPassword(customer.id, "secret123")).toBe(false);

    const updated = db.setCustomerPortalPassword(customer.id, "secret123")!;

    expect(updated.hasPortalPassword).toBe(true);
    expect(updated.passwordSetAt).not.toBeNull();
    expect(db.verifyCustomerPortalPassword(customer.id, "secret123")).toBe(true);
    expect(db.verifyCustomerPortalPassword(customer.id, "wrong123")).toBe(false);
  });

  it("resets a customer portal password and invalidates user sessions", () => {
    const customer = db.setCustomerPortalPassword(db.createCustomer({ displayName: "忘密用户", qq: "10008" }).id, "secret123")!;

    const reset = db.resetCustomerPortalPassword(customer.id)!;

    expect(reset.hasPortalPassword).toBe(false);
    expect(reset.passwordSetAt).toBeNull();
    expect(reset.sessionVersion).toBe(customer.sessionVersion + 1);
    expect(db.verifyCustomerPortalPassword(customer.id, "secret123")).toBe(false);
  });

  it("keeps upstream caches separated by customer group", () => {
    const first = db.createUpstreamAccount({
      groupName: "1群",
      label: "主账号",
      email: "one@example.com",
      password: "secret-1",
    });
    const second = db.createUpstreamAccount({
      groupName: "2群",
      label: "备用账号",
      email: "two@example.com",
      password: "secret-2",
    });

    db.updateUpstreamAccountCache(first.id, { content: "content-one", contentType: "text/plain" });
    db.updateUpstreamAccountCache(second.id, { content: "content-two", contentType: "text/plain" });

    expect(db.getUpstreamContentForGroup("1群").content).toBe("content-one");
    expect(db.getUpstreamContentForGroup("2群").content).toBe("content-two");
    expect(db.listUpstreamAccounts()[0].hasPassword).toBe(true);
    expect("password" in db.listUpstreamAccounts()[0]).toBe(false);
  });

  it("falls back to the legacy upstream cache when a group is not bound", () => {
    db.updateUpstreamCache({ content: "legacy-content", contentType: "text/plain" });

    expect(db.getUpstreamContentForGroup("未绑定群").content).toBe("legacy-content");
    expect(db.getUpstreamStatusForGroup("未绑定群").hasContent).toBe(true);
  });

  it("creates and updates pending registration requests by QQ", () => {
    const first = db.createRegistrationRequest({ displayName: "新用户", qq: "20001" });
    const second = db.createRegistrationRequest({ displayName: "改名用户", qq: "20001" });

    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe("改名用户");
    expect(db.listRegistrationRequests(10).filter((request) => request.qq === "20001")).toHaveLength(1);
  });

  it("approves registration requests into unpaid customers assigned to a group", () => {
    const request = db.createRegistrationRequest({ displayName: "申请客户", qq: "20002", password: "secret123" });

    const result = db.approveRegistrationRequest(request.id, "2群");

    expect(result.customer.displayName).toBe("申请客户");
    expect(result.customer.qq).toBe("20002");
    expect(result.customer.groupName).toBe("2群");
    expect(result.customer.paymentCount).toBe(0);
    expect(result.customer.hasPortalPassword).toBe(true);
    expect(db.verifyCustomerPortalPassword(result.customer.id, "secret123")).toBe(true);
    expect(result.request.status).toBe("approved");
    expect(result.request.assignedGroupName).toBe("2群");
  });

  it("keeps only the latest three rejected registration requests", () => {
    for (let index = 0; index < 5; index += 1) {
      const request = db.createRegistrationRequest({ displayName: `忽略用户${index}`, qq: `2010${index}` });
      db.rejectRegistrationRequest(request.id);
    }

    const rejectedRequests = db.listRegistrationRequests(20).filter((request) => request.status === "rejected");

    expect(rejectedRequests).toHaveLength(3);
    expect(rejectedRequests.map((request) => request.qq)).toEqual(["20104", "20103", "20102"]);
  });

  it("keeps only the latest three approved registration requests", () => {
    for (let index = 0; index < 5; index += 1) {
      const request = db.createRegistrationRequest({ displayName: `分配用户${index}`, qq: `2020${index}` });
      db.approveRegistrationRequest(request.id, "1群");
    }

    const approvedRequests = db.listRegistrationRequests(20).filter((request) => request.status === "approved");

    expect(approvedRequests).toHaveLength(3);
    expect(approvedRequests.map((request) => request.qq)).toEqual(["20204", "20203", "20202"]);
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
