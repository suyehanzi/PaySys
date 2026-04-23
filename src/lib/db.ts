import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { addDaysAtChinaEndOfDay, defaultExpiryIso, nowIso } from "@/lib/dates";

export type Customer = {
  id: number;
  displayName: string;
  qq: string;
  groupName: string;
  token: string;
  expiresAt: string;
  disabled: boolean;
  isVip: boolean;
  notes: string;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  subscriptionClicks: number;
  lastSubscriptionClickAt: string | null;
  paymentCount: number;
};

export type Payment = {
  id: number;
  customerId: number;
  customerDisplayName: string;
  customerQq: string;
  amount: number;
  paidAt: string;
  periodDays: number;
  notes: string;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
  canRollback: boolean;
};

export type AccessLog = {
  id: number;
  customerId: number | null;
  customerDisplayName: string;
  customerQq: string;
  customerGroupName: string;
  action: string;
  ip: string;
  userAgent: string;
  createdAt: string;
};

export type RegistrationRequest = {
  id: number;
  displayName: string;
  qq: string;
  status: "pending" | "approved" | "rejected";
  assignedGroupName: string;
  customerId: number | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
};

export type UpstreamStatus = {
  contentSize: number;
  contentType: string;
  hasContent: boolean;
  lastRefreshedAt: string | null;
  lastError: string | null;
};

export type UpstreamAccount = UpstreamStatus & {
  id: number;
  groupName: string;
  label: string;
  email: string;
  enabled: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpstreamAccountWithSecret = UpstreamAccount & {
  password: string;
};

type CustomerRow = {
  id: number;
  display_name: string;
  qq: string | null;
  group_name: string | null;
  token: string;
  expires_at: string;
  disabled: 0 | 1;
  is_vip?: 0 | 1;
  notes: string | null;
  session_version?: number;
  created_at: string;
  updated_at: string;
  subscription_clicks?: number;
  last_subscription_click_at?: string | null;
  payment_count?: number;
};

type PaymentRow = {
  id: number;
  customer_id: number;
  customer_display_name?: string | null;
  customer_qq?: string | null;
  amount: number;
  paid_at: string;
  period_days: number;
  notes: string | null;
  previous_expires_at?: string | null;
  new_expires_at?: string | null;
};

type AccessLogRow = {
  id: number;
  customer_id: number | null;
  customer_display_name?: string | null;
  customer_qq?: string | null;
  customer_group_name?: string | null;
  action: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

type RegistrationRequestRow = {
  id: number;
  display_name: string;
  qq: string;
  status: "pending" | "approved" | "rejected";
  assigned_group_name: string | null;
  customer_id: number | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

type UpstreamRow = {
  content: string | null;
  content_type: string | null;
  last_refreshed_at: string | null;
  last_error: string | null;
};

type UpstreamAccountRow = UpstreamRow & {
  id: number;
  group_name: string;
  label: string | null;
  email: string | null;
  password: string | null;
  enabled: 0 | 1;
  created_at: string;
  updated_at: string;
};

declare global {
  var __paysysDb: Database.Database | undefined;
  var __paysysDbPath: string | undefined;
}

function getDbPath(): string {
  const configured = process.env.PAYSYS_DB_PATH;
  if (!configured) {
    return path.join(process.cwd(), "data", "paysys.sqlite");
  }
  return path.isAbsolute(configured) ? configured : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

function migrate(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      qq TEXT DEFAULT '',
      group_name TEXT DEFAULT '',
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      is_vip INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      paid_at TEXT NOT NULL,
      period_days INTEGER NOT NULL DEFAULT 30,
      notes TEXT DEFAULT '',
      previous_expires_at TEXT,
      new_expires_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS upstream_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'text/plain; charset=utf-8',
      last_refreshed_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS upstream_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      content TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'text/plain; charset=utf-8',
      last_refreshed_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      action TEXT NOT NULL,
      ip TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS registration_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      qq TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_group_name TEXT DEFAULT '',
      customer_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      processed_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_access_logs_customer_action
      ON access_logs(customer_id, action, created_at);

    CREATE INDEX IF NOT EXISTS idx_registration_requests_status_created
      ON registration_requests(status, created_at);

    INSERT OR IGNORE INTO upstream_cache (id, content, content_type)
    VALUES (1, '', 'text/plain; charset=utf-8');
  `);

  const paymentColumns = db.prepare("PRAGMA table_info(payments)").all() as Array<{ name: string }>;
  const paymentColumnNames = new Set(paymentColumns.map((column) => column.name));
  if (!paymentColumnNames.has("previous_expires_at")) {
    db.exec("ALTER TABLE payments ADD COLUMN previous_expires_at TEXT");
  }
  if (!paymentColumnNames.has("new_expires_at")) {
    db.exec("ALTER TABLE payments ADD COLUMN new_expires_at TEXT");
  }

  const customerColumns = db.prepare("PRAGMA table_info(customers)").all() as Array<{ name: string }>;
  const customerColumnNames = new Set(customerColumns.map((column) => column.name));
  if (!customerColumnNames.has("session_version")) {
    db.exec("ALTER TABLE customers ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1");
  }
  if (!customerColumnNames.has("is_vip")) {
    db.exec("ALTER TABLE customers ADD COLUMN is_vip INTEGER NOT NULL DEFAULT 0");
  }

  const upstreamAccountColumns = db.prepare("PRAGMA table_info(upstream_accounts)").all() as Array<{ name: string }>;
  const upstreamAccountColumnNames = new Set(upstreamAccountColumns.map((column) => column.name));
  if (!upstreamAccountColumnNames.has("enabled")) {
    db.exec("ALTER TABLE upstream_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!upstreamAccountColumnNames.has("content")) {
    db.exec("ALTER TABLE upstream_accounts ADD COLUMN content TEXT NOT NULL DEFAULT ''");
  }
  if (!upstreamAccountColumnNames.has("content_type")) {
    db.exec("ALTER TABLE upstream_accounts ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text/plain; charset=utf-8'");
  }
  if (!upstreamAccountColumnNames.has("last_refreshed_at")) {
    db.exec("ALTER TABLE upstream_accounts ADD COLUMN last_refreshed_at TEXT");
  }
  if (!upstreamAccountColumnNames.has("last_error")) {
    db.exec("ALTER TABLE upstream_accounts ADD COLUMN last_error TEXT");
  }
}

export function getDb(): Database.Database {
  const dbPath = getDbPath();
  if (globalThis.__paysysDb && globalThis.__paysysDbPath === dbPath) {
    migrate(globalThis.__paysysDb);
    return globalThis.__paysysDb;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  migrate(db);
  globalThis.__paysysDb = db;
  globalThis.__paysysDbPath = dbPath;
  return db;
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    displayName: row.display_name,
    qq: row.qq || "",
    groupName: row.group_name || "",
    token: row.token,
    expiresAt: row.expires_at,
    disabled: row.disabled === 1,
    isVip: row.is_vip === 1,
    notes: row.notes || "",
    sessionVersion: row.session_version || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subscriptionClicks: row.subscription_clicks || 0,
    lastSubscriptionClickAt: row.last_subscription_click_at || null,
    paymentCount: row.payment_count || 0,
  };
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerDisplayName: row.customer_display_name || "",
    customerQq: row.customer_qq || "",
    amount: row.amount,
    paidAt: row.paid_at,
    periodDays: row.period_days,
    notes: row.notes || "",
    previousExpiresAt: row.previous_expires_at || null,
    newExpiresAt: row.new_expires_at || null,
    canRollback: Boolean(row.previous_expires_at && row.new_expires_at),
  };
}

function mapAccessLog(row: AccessLogRow): AccessLog {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerDisplayName: row.customer_display_name || "",
    customerQq: row.customer_qq || "",
    customerGroupName: row.customer_group_name || "",
    action: row.action,
    ip: row.ip || "",
    userAgent: row.user_agent || "",
    createdAt: row.created_at,
  };
}

function mapRegistrationRequest(row: RegistrationRequestRow): RegistrationRequest {
  return {
    id: row.id,
    displayName: row.display_name,
    qq: row.qq,
    status: row.status,
    assignedGroupName: row.assigned_group_name || "",
    customerId: row.customer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    processedAt: row.processed_at,
  };
}

function mapUpstreamStatus(row: UpstreamRow): UpstreamStatus {
  const content = row.content || "";
  return {
    contentSize: Buffer.byteLength(content, "utf8"),
    contentType: row.content_type || "text/plain; charset=utf-8",
    hasContent: content.length > 0,
    lastRefreshedAt: row.last_refreshed_at,
    lastError: row.last_error,
  };
}

function mapUpstreamAccount(row: UpstreamAccountRow): UpstreamAccount {
  return {
    ...mapUpstreamStatus(row),
    id: row.id,
    groupName: row.group_name,
    label: row.label || "",
    email: row.email || "",
    enabled: row.enabled === 1,
    hasPassword: Boolean(row.password),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUpstreamAccountWithSecret(row: UpstreamAccountRow): UpstreamAccountWithSecret {
  return {
    ...mapUpstreamAccount(row),
    password: row.password || "",
  };
}

function newToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export function listCustomers(): Customer[] {
  const rows = getDb()
    .prepare(
      `SELECT
        customers.*,
        COALESCE((
          SELECT COUNT(*)
          FROM access_logs
          WHERE access_logs.customer_id = customers.id
            AND access_logs.action = 'subscription_fetch'
        ), 0) AS subscription_clicks,
        (
          SELECT MAX(access_logs.created_at)
          FROM access_logs
          WHERE access_logs.customer_id = customers.id
            AND access_logs.action = 'subscription_fetch'
        ) AS last_subscription_click_at,
        COALESCE((
          SELECT COUNT(*)
          FROM payments
          WHERE payments.customer_id = customers.id
        ), 0) AS payment_count
       FROM customers
       ORDER BY customers.disabled ASC, customers.expires_at ASC, customers.id DESC`,
    )
    .all() as CustomerRow[];
  return rows.map(mapCustomer);
}

export function getCustomerById(id: number): Customer | null {
  const row = getDb()
    .prepare(
      `SELECT
        customers.*,
        COALESCE((
          SELECT COUNT(*)
          FROM payments
          WHERE payments.customer_id = customers.id
        ), 0) AS payment_count
       FROM customers
       WHERE customers.id = ?`,
    )
    .get(id) as CustomerRow | undefined;
  return row ? mapCustomer(row) : null;
}

export function getCustomerByToken(token: string): Customer | null {
  const row = getDb()
    .prepare(
      `SELECT
        customers.*,
        COALESCE((
          SELECT COUNT(*)
          FROM payments
          WHERE payments.customer_id = customers.id
        ), 0) AS payment_count
       FROM customers
       WHERE customers.token = ?`,
    )
    .get(token) as CustomerRow | undefined;
  return row ? mapCustomer(row) : null;
}

export function getCustomerByQq(qq: string): Customer | null {
  const normalized = qq.trim();
  if (!normalized) return null;
  const row = getDb()
    .prepare(
      `SELECT
        customers.*,
        COALESCE((
          SELECT COUNT(*)
          FROM payments
          WHERE payments.customer_id = customers.id
        ), 0) AS payment_count
       FROM customers
       WHERE customers.qq = ?
       ORDER BY customers.id DESC
       LIMIT 1`,
    )
    .get(normalized) as CustomerRow | undefined;
  return row ? mapCustomer(row) : null;
}

export function createCustomer(input: {
  displayName: string;
  qq?: string;
  groupName?: string;
  expiresAt?: string;
  notes?: string;
}): Customer {
  const timestamp = nowIso();
  const token = newToken();
  const result = getDb()
    .prepare(
      `INSERT INTO customers
        (display_name, qq, group_name, token, expires_at, disabled, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      input.displayName.trim(),
      input.qq?.trim() || "",
      input.groupName?.trim() || "",
      token,
      input.expiresAt || defaultExpiryIso(),
      input.notes?.trim() || "",
      timestamp,
      timestamp,
    );
  return getCustomerById(Number(result.lastInsertRowid))!;
}

export function updateCustomer(
  id: number,
  patch: Partial<Pick<Customer, "displayName" | "qq" | "groupName" | "expiresAt" | "disabled" | "isVip" | "notes">>,
): Customer | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  const mapping: Record<string, string> = {
    displayName: "display_name",
    groupName: "group_name",
    expiresAt: "expires_at",
    isVip: "is_vip",
  };

  for (const [key, value] of Object.entries(patch)) {
    const column = mapping[key] || key;
    fields.push(`${column} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
  }

  if (!fields.length) {
    return getCustomerById(id);
  }

  fields.push("updated_at = ?");
  values.push(nowIso(), id);
  getDb().prepare(`UPDATE customers SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getCustomerById(id);
}

export function setCustomersVip(ids: number[], isVip: boolean): number {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (!uniqueIds.length) return 0;

  const db = getDb();
  const timestamp = nowIso();
  const transaction = db.transaction(() => {
    let changes = 0;
    const update = db.prepare("UPDATE customers SET is_vip = ?, updated_at = ? WHERE id = ?");
    for (const id of uniqueIds) {
      changes += update.run(isVip ? 1 : 0, timestamp, id).changes;
    }
    return changes;
  });

  return transaction();
}

export function deleteCustomer(id: number): boolean {
  const result = getDb().prepare("DELETE FROM customers WHERE id = ?").run(id);
  return result.changes > 0;
}

export function extendCustomer(input: {
  customerId: number;
  amount: number;
  periodDays: number;
  paidAt?: string;
  notes?: string;
}): { customer: Customer; payment: Payment } {
  const db = getDb();
  const current = getCustomerById(input.customerId);
  if (!current) {
    throw new Error("客户不存在");
  }
  const notes = input.notes?.trim() || "";
  const latestPayment = db
    .prepare("SELECT * FROM payments WHERE customer_id = ? ORDER BY paid_at DESC, id DESC LIMIT 1")
    .get(input.customerId) as PaymentRow | undefined;
  if (
    latestPayment &&
    latestPayment.new_expires_at === current.expiresAt &&
    latestPayment.period_days === input.periodDays &&
    latestPayment.amount === input.amount &&
    (latestPayment.notes || "") === notes
  ) {
    const latestPaidAt = new Date(latestPayment.paid_at).getTime();
    if (Number.isFinite(latestPaidAt) && Date.now() - latestPaidAt <= 60_000) {
      throw new Error("刚刚已登记过同一笔续费，请刷新确认，避免重复延长到期时间");
    }
  }

  const baseMs = Math.max(new Date(current.expiresAt).getTime(), Date.now());
  const baseDate = Number.isFinite(baseMs) ? new Date(baseMs) : new Date();
  const nextExpiresAt = addDaysAtChinaEndOfDay(baseDate, input.periodDays);
  const paidAt = input.paidAt || nowIso();
  const timestamp = nowIso();

  const transaction = db.transaction(() => {
    const paymentResult = db
      .prepare(
        `INSERT INTO payments
          (customer_id, amount, paid_at, period_days, notes, previous_expires_at, new_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.customerId,
        input.amount,
        paidAt,
        input.periodDays,
        notes,
        current.expiresAt,
        nextExpiresAt,
      );
    db.prepare("UPDATE customers SET expires_at = ?, disabled = 0, updated_at = ? WHERE id = ?").run(
      nextExpiresAt,
      timestamp,
      input.customerId,
    );
    return Number(paymentResult.lastInsertRowid);
  });

  const paymentId = transaction();
  return {
    customer: getCustomerById(input.customerId)!,
    payment: getPaymentById(paymentId)!,
  };
}

export function resetCustomerToken(id: number): Customer | null {
  const token = newToken();
  getDb()
    .prepare("UPDATE customers SET token = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?")
    .run(token, nowIso(), id);
  return getCustomerById(id);
}

export function resetCustomerData(id: number): Customer | null {
  const current = getCustomerById(id);
  if (!current) return null;

  const db = getDb();
  const token = newToken();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 0);
  const timestamp = nowIso();

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM payments WHERE customer_id = ?").run(id);
    db.prepare("DELETE FROM access_logs WHERE customer_id = ?").run(id);
    db.prepare(
      `UPDATE customers
       SET token = ?,
           expires_at = ?,
           session_version = session_version + 1,
           updated_at = ?
       WHERE id = ?`,
    ).run(token, todayEnd.toISOString(), timestamp, id);
  });

  transaction();
  return getCustomerById(id);
}

export function getPaymentById(id: number): Payment | null {
  const row = getDb().prepare("SELECT * FROM payments WHERE id = ?").get(id) as PaymentRow | undefined;
  return row ? mapPayment(row) : null;
}

export function listRecentPayments(limit = 20): Payment[] {
  const rows = getDb()
    .prepare(
      `SELECT
        payments.*,
        customers.display_name AS customer_display_name,
        customers.qq AS customer_qq
       FROM payments
       LEFT JOIN customers ON customers.id = payments.customer_id
       ORDER BY payments.paid_at DESC, payments.id DESC
       LIMIT ?`,
    )
    .all(limit) as PaymentRow[];
  return rows.map(mapPayment);
}

export function listAccessLogs(limit = 500): AccessLog[] {
  const rows = getDb()
    .prepare(
      `SELECT
        access_logs.*,
        customers.display_name AS customer_display_name,
        customers.qq AS customer_qq,
        customers.group_name AS customer_group_name
       FROM access_logs
       LEFT JOIN customers ON customers.id = access_logs.customer_id
       ORDER BY access_logs.created_at DESC, access_logs.id DESC
       LIMIT ?`,
    )
    .all(Math.max(1, Math.min(limit, 2000))) as AccessLogRow[];
  return rows.map(mapAccessLog);
}

function pruneRegistrationRequestsByStatus(status: RegistrationRequest["status"], keep = 3): void {
  getDb()
    .prepare(
      `DELETE FROM registration_requests
       WHERE status = ?
         AND id NOT IN (
           SELECT id
           FROM registration_requests
           WHERE status = ?
           ORDER BY processed_at DESC, updated_at DESC, id DESC
           LIMIT ?
         )`,
    )
    .run(status, status, Math.max(0, keep));
}

function pruneProcessedRegistrationRequests(): void {
  pruneRegistrationRequestsByStatus("approved");
  pruneRegistrationRequestsByStatus("rejected");
}

export function listRegistrationRequests(limit = 100): RegistrationRequest[] {
  pruneProcessedRegistrationRequests();

  const rows = getDb()
    .prepare(
      `SELECT *
       FROM registration_requests
       ORDER BY
         CASE status
           WHEN 'pending' THEN 0
           WHEN 'approved' THEN 1
           ELSE 2
         END,
         created_at DESC,
         id DESC
       LIMIT ?`,
    )
    .all(Math.max(1, Math.min(limit, 500))) as RegistrationRequestRow[];
  return rows.map(mapRegistrationRequest);
}

export function getRegistrationRequestById(id: number): RegistrationRequest | null {
  const row = getDb()
    .prepare("SELECT * FROM registration_requests WHERE id = ?")
    .get(id) as RegistrationRequestRow | undefined;
  return row ? mapRegistrationRequest(row) : null;
}

export function createRegistrationRequest(input: { displayName: string; qq: string }): RegistrationRequest {
  const displayName = input.displayName.trim();
  const qq = input.qq.trim();
  if (!displayName) throw new Error("昵称不能为空");
  if (!qq) throw new Error("QQ 不能为空");
  if (getCustomerByQq(qq)) {
    throw new Error("这个 QQ 已有账号，请直接登录");
  }

  const timestamp = nowIso();
  const existingPending = getDb()
    .prepare("SELECT * FROM registration_requests WHERE qq = ? AND status = 'pending' ORDER BY id DESC LIMIT 1")
    .get(qq) as RegistrationRequestRow | undefined;
  if (existingPending) {
    getDb()
      .prepare("UPDATE registration_requests SET display_name = ?, updated_at = ? WHERE id = ?")
      .run(displayName, timestamp, existingPending.id);
    return getRegistrationRequestById(existingPending.id)!;
  }

  const result = getDb()
    .prepare(
      `INSERT INTO registration_requests
        (display_name, qq, status, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?)`,
    )
    .run(displayName, qq, timestamp, timestamp);
  return getRegistrationRequestById(Number(result.lastInsertRowid))!;
}

export function approveRegistrationRequest(
  id: number,
  groupName: string,
): { request: RegistrationRequest; customer: Customer } {
  const request = getRegistrationRequestById(id);
  if (!request) {
    throw new Error("申请不存在");
  }
  if (request.status !== "pending") {
    throw new Error("申请已处理");
  }

  const assignedGroupName = groupName.trim();
  if (!assignedGroupName) {
    throw new Error("请选择群名");
  }

  const db = getDb();
  const transaction = db.transaction(() => {
    const existingCustomer = getCustomerByQq(request.qq);
    const customer =
      existingCustomer ||
      createCustomer({
        displayName: request.displayName,
        qq: request.qq,
        groupName: assignedGroupName,
        expiresAt: defaultExpiryIso(0),
        notes: "自助注册申请",
      });

    if (existingCustomer && existingCustomer.groupName !== assignedGroupName) {
      updateCustomer(existingCustomer.id, { groupName: assignedGroupName });
    }

    const processedAt = nowIso();
    db.prepare(
      `UPDATE registration_requests
       SET status = 'approved',
           assigned_group_name = ?,
           customer_id = ?,
           processed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(assignedGroupName, customer.id, processedAt, processedAt, id);

    return getCustomerById(customer.id)!;
  });

  const customer = transaction();
  pruneProcessedRegistrationRequests();
  return {
    request: getRegistrationRequestById(id)!,
    customer,
  };
}

export function rejectRegistrationRequest(id: number): RegistrationRequest | null {
  const request = getRegistrationRequestById(id);
  if (!request) return null;
  if (request.status !== "pending") return request;

  const timestamp = nowIso();
  getDb()
    .prepare(
      `UPDATE registration_requests
       SET status = 'rejected',
           processed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(timestamp, timestamp, id);
  pruneProcessedRegistrationRequests();
  return getRegistrationRequestById(id);
}

export function deletePayment(id: number): { deleted: boolean; rolledBack: boolean } {
  const db = getDb();
  const payment = getPaymentById(id);
  if (!payment) {
    return { deleted: false, rolledBack: false };
  }

  const transaction = db.transaction(() => {
    let rolledBack = false;
    const customer = getCustomerById(payment.customerId);
    if (customer && payment.previousExpiresAt && payment.newExpiresAt && customer.expiresAt === payment.newExpiresAt) {
      db.prepare("UPDATE customers SET expires_at = ?, updated_at = ? WHERE id = ?").run(
        payment.previousExpiresAt,
        nowIso(),
        payment.customerId,
      );
      rolledBack = true;
    }

    db.prepare("DELETE FROM payments WHERE id = ?").run(id);
    return rolledBack;
  });

  return { deleted: true, rolledBack: transaction() };
}

export function listUpstreamAccounts(): UpstreamAccount[] {
  const rows = getDb()
    .prepare("SELECT * FROM upstream_accounts ORDER BY group_name COLLATE NOCASE ASC, id ASC")
    .all() as UpstreamAccountRow[];
  return rows.map(mapUpstreamAccount);
}

export function getUpstreamAccountById(id: number): UpstreamAccount | null {
  const row = getDb().prepare("SELECT * FROM upstream_accounts WHERE id = ?").get(id) as UpstreamAccountRow | undefined;
  return row ? mapUpstreamAccount(row) : null;
}

export function getUpstreamAccountWithSecretById(id: number): UpstreamAccountWithSecret | null {
  const row = getDb().prepare("SELECT * FROM upstream_accounts WHERE id = ?").get(id) as UpstreamAccountRow | undefined;
  return row ? mapUpstreamAccountWithSecret(row) : null;
}

export function getUpstreamAccountWithSecretForGroup(groupName: string): UpstreamAccountWithSecret | null {
  const normalized = groupName.trim();
  if (!normalized) return null;
  const row = getDb()
    .prepare("SELECT * FROM upstream_accounts WHERE group_name = ? LIMIT 1")
    .get(normalized) as UpstreamAccountRow | undefined;
  return row ? mapUpstreamAccountWithSecret(row) : null;
}

export function createUpstreamAccount(input: {
  groupName: string;
  label?: string;
  email: string;
  password: string;
  enabled?: boolean;
}): UpstreamAccount {
  const groupName = input.groupName.trim();
  const email = input.email.trim();
  const password = input.password.trim();
  if (!groupName) throw new Error("群名不能为空");
  if (!email) throw new Error("账号不能为空");
  if (!password) throw new Error("密码不能为空");

  const timestamp = nowIso();
  const result = getDb()
    .prepare(
      `INSERT INTO upstream_accounts
        (group_name, label, email, password, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(groupName, input.label?.trim() || "", email, password, input.enabled === false ? 0 : 1, timestamp, timestamp);
  return getUpstreamAccountById(Number(result.lastInsertRowid))!;
}

export function updateUpstreamAccount(
  id: number,
  patch: Partial<Pick<UpstreamAccount, "groupName" | "label" | "email" | "enabled">> & { password?: string },
): UpstreamAccount | null {
  const fields: string[] = [];
  const values: unknown[] = [];
  const mapping: Record<string, string> = {
    groupName: "group_name",
  };

  for (const [key, rawValue] of Object.entries(patch)) {
    if (rawValue === undefined) continue;
    if (key === "password") {
      const password = String(rawValue).trim();
      if (!password) continue;
      fields.push("password = ?");
      values.push(password);
      continue;
    }

    const column = mapping[key] || key;
    const value =
      typeof rawValue === "boolean" ? (rawValue ? 1 : 0) : typeof rawValue === "string" ? rawValue.trim() : rawValue;
    fields.push(`${column} = ?`);
    values.push(value);
  }

  if (!fields.length) {
    return getUpstreamAccountById(id);
  }

  fields.push("updated_at = ?");
  values.push(nowIso(), id);
  getDb().prepare(`UPDATE upstream_accounts SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getUpstreamAccountById(id);
}

export function deleteUpstreamAccount(id: number): boolean {
  const result = getDb().prepare("DELETE FROM upstream_accounts WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getUpstreamStatusForAccount(id: number): UpstreamStatus {
  const row = getDb().prepare("SELECT * FROM upstream_accounts WHERE id = ?").get(id) as UpstreamAccountRow | undefined;
  if (!row) {
    throw new Error("上游账号不存在");
  }
  return mapUpstreamStatus(row);
}

export function getUpstreamStatusForGroup(groupName: string): UpstreamStatus {
  const account = getUpstreamAccountWithSecretForGroup(groupName);
  if (!account || !account.enabled) {
    return getUpstreamStatus();
  }
  return {
    contentSize: account.contentSize,
    contentType: account.contentType,
    hasContent: account.hasContent,
    lastRefreshedAt: account.lastRefreshedAt,
    lastError: account.lastError,
  };
}

export function getUpstreamContentForAccount(id: number): { content: string; contentType: string } {
  const row = getDb()
    .prepare("SELECT content, content_type FROM upstream_accounts WHERE id = ?")
    .get(id) as UpstreamAccountRow | undefined;
  if (!row) {
    throw new Error("上游账号不存在");
  }
  return {
    content: row.content || "",
    contentType: row.content_type || "text/plain; charset=utf-8",
  };
}

export function getUpstreamContentForGroup(groupName: string): { content: string; contentType: string } {
  const account = getUpstreamAccountWithSecretForGroup(groupName);
  if (!account || !account.enabled) {
    return getUpstreamContent();
  }
  return getUpstreamContentForAccount(account.id);
}

export function updateUpstreamAccountCache(
  id: number,
  input: { content: string; contentType?: string },
): UpstreamStatus {
  const result = getDb()
    .prepare(
      `UPDATE upstream_accounts
       SET content = ?, content_type = ?, last_refreshed_at = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .run(input.content, input.contentType || "text/plain; charset=utf-8", nowIso(), nowIso(), id);
  if (!result.changes) {
    throw new Error("上游账号不存在");
  }
  return getUpstreamStatusForAccount(id);
}

export function markUpstreamAccountError(id: number, error: string): UpstreamStatus {
  const result = getDb()
    .prepare("UPDATE upstream_accounts SET last_error = ?, updated_at = ? WHERE id = ?")
    .run(error.slice(0, 1000), nowIso(), id);
  if (!result.changes) {
    throw new Error("上游账号不存在");
  }
  return getUpstreamStatusForAccount(id);
}

export function getUpstreamStatus(): UpstreamStatus {
  const row = getDb().prepare("SELECT * FROM upstream_cache WHERE id = 1").get() as UpstreamRow;
  return mapUpstreamStatus(row);
}

export function getUpstreamContent(): { content: string; contentType: string } {
  const row = getDb().prepare("SELECT content, content_type FROM upstream_cache WHERE id = 1").get() as UpstreamRow;
  return {
    content: row.content || "",
    contentType: row.content_type || "text/plain; charset=utf-8",
  };
}

export function updateUpstreamCache(input: { content: string; contentType?: string }): UpstreamStatus {
  getDb()
    .prepare(
      `UPDATE upstream_cache
       SET content = ?, content_type = ?, last_refreshed_at = ?, last_error = NULL
       WHERE id = 1`,
    )
    .run(input.content, input.contentType || "text/plain; charset=utf-8", nowIso());
  return getUpstreamStatus();
}

export function markUpstreamError(error: string): UpstreamStatus {
  getDb().prepare("UPDATE upstream_cache SET last_error = ? WHERE id = 1").run(error.slice(0, 1000));
  return getUpstreamStatus();
}

export function logAccess(input: { customerId?: number | null; action: string; ip?: string; userAgent?: string }): void {
  getDb()
    .prepare("INSERT INTO access_logs (customer_id, action, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(input.customerId ?? null, input.action, input.ip || "", input.userAgent || "", nowIso());
}

export function closeDbForTests(): void {
  if (globalThis.__paysysDb) {
    globalThis.__paysysDb.close();
  }
  globalThis.__paysysDb = undefined;
  globalThis.__paysysDbPath = undefined;
}
