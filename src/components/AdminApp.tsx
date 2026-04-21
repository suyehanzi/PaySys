"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { copyToClipboard } from "@/lib/clipboard";
import { dateInputValue, formatDateTime } from "@/lib/dates";
import { getCustomerStatus, remainingDays } from "@/lib/customer";
import { DEFAULT_PAYMENT_AMOUNT, DEFAULT_PAYMENT_PERIOD_DAYS } from "@/lib/payments";
import type { AccessLog, Customer, Payment, UpstreamStatus } from "@/lib/db";

type AdminState = {
  customers: Customer[];
  payments: Payment[];
  accessLogs: AccessLog[];
  upstream: UpstreamStatus;
  admin: {
    usingDefaultPassword: boolean;
  };
};

type PaymentDraft = {
  amount: string;
  periodDays: string;
  notes: string;
};

type StatusFilter = "all" | "active" | "unpaid" | "expired" | "disabled";

const defaultGroupOptions = ["1群", "2群"];
const defaultPaymentDraft: PaymentDraft = {
  amount: String(DEFAULT_PAYMENT_AMOUNT),
  periodDays: String(DEFAULT_PAYMENT_PERIOD_DAYS),
  notes: "",
};

const initialCustomerForm = {
  displayName: "",
  qq: "",
  groupName: defaultGroupOptions[0],
  notes: "",
};

function defaultDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateInputValue(date.toISOString());
}

function statusLabel(status: StatusFilter) {
  if (status === "active") return "正常";
  if (status === "unpaid") return "未登记";
  if (status === "expired") return "过期";
  if (status === "disabled") return "禁用";
  return "全部";
}

function accessActionLabel(action: string) {
  if (action === "portal_get_subscription") return "获取入口";
  if (action === "subscription_fetch") return "订阅拉取";
  if (action === "portal_login") return "客户登录";
  if (action === "user_refresh") return "刷新订阅";
  return action;
}

function shortUserAgent(value: string) {
  const text = value.trim();
  if (!text) return "未知设备";
  if (/clash/i.test(text)) return "Clash";
  if (/stash/i.test(text)) return "Stash";
  if (/shadowrocket/i.test(text)) return "Shadowrocket";
  if (/surge/i.test(text)) return "Surge";
  if (/quantumult/i.test(text)) return "Quantumult";
  if (/iphone|ipad|ios/i.test(text)) return "iOS 浏览器";
  if (/android/i.test(text)) return "Android 浏览器";
  if (/edg\//i.test(text)) return "Edge 浏览器";
  if (/chrome/i.test(text)) return "Chrome 浏览器";
  if (/safari/i.test(text)) return "Safari 浏览器";
  return text.slice(0, 80);
}

function expiryHint(customer: Customer, status: StatusFilter) {
  if (status === "disabled") return "已禁用";
  if (status === "unpaid") return "未登记付款";
  if (status === "expired") return "过期7天+";

  const days = remainingDays(customer.expiresAt);
  return days > 0 ? `剩 ${days} 天` : "宽限期内";
}

async function readJson<T>(response: Response): Promise<T & { ok?: boolean; error?: string }> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `请求失败：HTTP ${response.status}`);
  }
  return body;
}

async function fetchAdminState(): Promise<{ authenticated: boolean; state?: AdminState }> {
  const response = await fetch("/api/admin/state", { cache: "no-store" });
  if (response.status === 401) {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    state: await readJson<AdminState>(response),
  };
}

export function AdminApp() {
  const [state, setState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [customerForm, setCustomerForm] = useState({ ...initialCustomerForm });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState<{ label: string; value: string } | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<number, PaymentDraft>>({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const paymentInFlight = useRef(new Set<number>());
  const createPanelRef = useRef<HTMLElement | null>(null);

  const counts = useMemo(() => {
    const customers = state?.customers || [];
    const dueSoon = customers.filter((customer) => {
      const status = getCustomerStatus(customer);
      return status === "active" && remainingDays(customer.expiresAt) <= 7;
    }).length;

    return {
      total: customers.length,
      active: customers.filter((customer) => getCustomerStatus(customer) === "active").length,
      unpaid: customers.filter((customer) => getCustomerStatus(customer) === "unpaid").length,
      disabled: customers.filter((customer) => getCustomerStatus(customer) === "disabled").length,
      dueSoon,
      totalClicks: customers.reduce((sum, customer) => sum + customer.subscriptionClicks, 0),
    };
  }, [state?.customers]);

  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    return (state?.customers || []).filter((customer) => {
      const status = getCustomerStatus(customer);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const haystack = [customer.displayName, customer.qq, customer.groupName, customer.notes]
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!keyword || haystack.includes(keyword));
    });
  }, [customerSearch, state?.customers, statusFilter]);

  async function loadState() {
    setLoading(true);
    try {
      const result = await fetchAdminState();
      if (!result.authenticated) {
        setAuthenticated(false);
        setState(null);
        return;
      }
      setState(result.state!);
      setAuthenticated(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const result = await fetchAdminState();
        if (!mounted) return;
        if (!result.authenticated) {
          setAuthenticated(false);
          setState(null);
          return;
        }
        setState(result.state!);
        setAuthenticated(true);
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "加载失败");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!showCreateCustomer || typeof window === "undefined") {
      return;
    }
    if (!window.matchMedia("(max-width: 860px)").matches) {
      return;
    }

    window.requestAnimationFrame(() => {
      createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [showCreateCustomer]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setBusy("login");
    try {
      await readJson(await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      }));
      setPassword("");
      await loadState();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy("");
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setState(null);
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create-customer");
    try {
      await readJson(await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...customerForm, expiresAt: defaultDate(0) }),
      }));
      setCustomerForm({ ...initialCustomerForm, groupName: customerForm.groupName });
      setShowCreateCustomer(false);
      setNotice("客户已创建");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建客户失败");
    } finally {
      setBusy("");
    }
  }

  async function patchCustomer(id: number, patch: Partial<Customer>): Promise<boolean> {
    setBusy(`patch-${id}`);
    try {
      await readJson(await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }));
      await loadState();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新客户失败");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function saveCustomerNotes(customer: Customer, value: string) {
    const notes = value.trim();
    if (notes === customer.notes) {
      return;
    }

    if (await patchCustomer(customer.id, { notes })) {
      setNotice("备注已保存");
    }
  }

  async function extendCustomer(id: number) {
    if (paymentInFlight.current.has(id)) {
      return;
    }
    paymentInFlight.current.add(id);
    const draft = paymentDrafts[id] || defaultPaymentDraft;
    const paymentPayload = {
      ...draft,
      amount: draft.amount.trim() || defaultPaymentDraft.amount,
      periodDays: draft.periodDays.trim() || defaultPaymentDraft.periodDays,
    };
    setBusy(`extend-${id}`);
    try {
      await readJson(await fetch(`/api/admin/customers/${id}/extend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(paymentPayload),
      }));
      setPaymentDrafts((current) => ({ ...current, [id]: defaultPaymentDraft }));
      setNotice("续费已登记");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "登记续费失败");
    } finally {
      paymentInFlight.current.delete(id);
      setBusy("");
    }
  }

  async function resetToken(id: number) {
    if (!window.confirm("重置该客户数据？付款记录和获取次数会清空，备注保留，到期日会恢复为今天。")) {
      return;
    }
    setBusy(`reset-${id}`);
    try {
      await readJson(await fetch(`/api/admin/customers/${id}/reset-token`, { method: "POST" }));
      setNotice("客户数据已重置");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重置失败");
    } finally {
      setBusy("");
    }
  }

  async function deleteCustomerAccount(customer: Customer) {
    if (!window.confirm(`删除客户「${customer.displayName}」？付款记录和访问记录也会一起删除。`)) {
      return;
    }
    setBusy(`delete-customer-${customer.id}`);
    try {
      await readJson(await fetch(`/api/admin/customers/${customer.id}`, { method: "DELETE" }));
      setNotice("客户账号已删除");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除客户失败");
    } finally {
      setBusy("");
    }
  }

  async function deletePaymentRecord(id: number) {
    if (!window.confirm("删除这条付款记录？如果客户到期时间仍是本次续费后的时间，会自动回滚。")) {
      return;
    }
    setBusy(`delete-payment-${id}`);
    try {
      const result = await readJson<{ rolledBack: boolean }>(
        await fetch(`/api/admin/payments/${id}`, { method: "DELETE" }),
      );
      setNotice(result.rolledBack ? "付款记录已删除，到期时间已回滚" : "付款记录已删除，到期时间未变更");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除付款记录失败");
    } finally {
      setBusy("");
    }
  }

  function updateDraft(id: number, patch: Partial<PaymentDraft>) {
    setPaymentDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || defaultPaymentDraft), ...patch },
    }));
  }

  async function copyText(value: string, label: string) {
    const copied = await copyToClipboard(value);
    if (copied) {
      setNotice(`${label}已复制`);
      setManualCopy(null);
      return;
    }
    setManualCopy({ label, value });
    setNotice(`浏览器禁止自动复制，请在下方手动复制${label}`);
  }

  function linkFor(path: string) {
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }

  function portalMessage() {
    return `请打开订阅中心：${linkFor("/portal")}\n输入已登记的 QQ 号即可查看订阅。`;
  }

  if (loading && authenticated === null) {
    return (
      <main className="shell">
        <section className="empty-state">
          <p className="eyebrow">PaySys</p>
          <h1>正在加载后台</h1>
        </section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="shell shell-narrow">
        <section className="login-panel">
          <p className="eyebrow">PaySys Admin</p>
          <h1>管理员登录</h1>
          <p>使用本地环境变量里的 `ADMIN_PASSWORD` 登录。未配置时，本地开发默认密码为 `admin123`。</p>
          <form onSubmit={handleLogin} className="stack">
            <label>
              <span>后台密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入后台密码"
                autoFocus
              />
            </label>
            {loginError ? <p className="error-text">{loginError}</p> : null}
            <button className="primary" disabled={busy === "login"}>
              <Icon name="login" />
              登录
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PaySys</p>
          <h1>订阅中转后台</h1>
        </div>
        <button className="ghost" onClick={handleLogout}>
          <Icon name="power" />
          退出
        </button>
      </header>

      {state?.admin.usingDefaultPassword ? (
        <section className="warning-band">当前使用默认开发密码。正式使用前请在 `.env` 设置 `ADMIN_PASSWORD`。</section>
      ) : null}

      {notice ? (
        <section className="notice" role="status">
          {notice}
        </section>
      ) : null}

      {manualCopy ? (
        <section className="manual-copy">
          <div className="section-heading">
            <div>
              <p className="eyebrow">手动复制</p>
              <h2>{manualCopy.label}</h2>
            </div>
            <button className="ghost compact-button" onClick={() => setManualCopy(null)}>
              关闭
            </button>
          </div>
          <textarea
            readOnly
            value={manualCopy.value}
            rows={manualCopy.value.length > 90 ? 4 : 2}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </section>
      ) : null}

      <section className="metrics-grid">
        <article>
          <span>总客户</span>
          <strong>{counts.total}</strong>
        </article>
        <article>
          <span>正常</span>
          <strong>{counts.active}</strong>
        </article>
        <article>
          <span>未登记</span>
          <strong>{counts.unpaid}</strong>
        </article>
        <article className={counts.dueSoon > 0 ? "warning" : ""}>
          <span>一周内到期</span>
          <strong>{counts.dueSoon}</strong>
        </article>
        <article>
          <span>拉取总次数</span>
          <strong>{counts.totalClicks}</strong>
        </article>
      </section>

      <section className={`admin-workspace ${showCreateCustomer ? "with-create" : ""}`}>
        <div className="admin-main">
          <section className="quick-actions">
            <button type="button" className="secondary" onClick={() => copyText(portalMessage(), "QQ 回复文案")}>
              <Icon name="receipt" />
              复制文案
            </button>
            <button type="button" className="primary" onClick={() => setShowCreateCustomer(true)}>
              <Icon name="plus" />
              新增客户
            </button>
          </section>

          <section className="table-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">成员</p>
            <h2>客户列表</h2>
          </div>
          <span className="muted-stat">{filteredCustomers.length} / {state?.customers.length || 0}</span>
        </div>

        <div className="admin-toolbar">
          <input
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            placeholder="搜索昵称 / QQ / 群名 / 备注"
            aria-label="搜索客户"
          />
          <div className="segmented-control" aria-label="客户状态筛选">
            {[
              ["all", "全部"],
              ["active", "正常"],
              ["unpaid", "未登记"],
              ["expired", "过期"],
              ["disabled", "禁用"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={statusFilter === value ? "selected" : ""}
                onClick={() => setStatusFilter(value as StatusFilter)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>客户</th>
                <th>状态</th>
                <th>到期</th>
                <th>拉取次数</th>
                <th>续费</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => {
                const status = getCustomerStatus(customer);
                const locked = customer.disabled;
                const draft = paymentDrafts[customer.id] || defaultPaymentDraft;
                return (
                  <tr key={customer.id}>
                    <td data-label="客户" className="customer-cell">
                      <strong>{customer.displayName}</strong>
                      <small>{customer.qq || "未填 QQ"} · {customer.groupName || "未分组"}</small>
                      <textarea
                        className="note-editor"
                        defaultValue={customer.notes}
                        placeholder="备注"
                        onBlur={(event) => void saveCustomerNotes(customer, event.currentTarget.value)}
                        aria-label={`${customer.displayName} 备注`}
                        disabled={busy === `patch-${customer.id}`}
                        rows={2}
                      />
                    </td>
                    <td data-label="状态" className="status-cell">
                      <span className={`badge ${status}`}>{statusLabel(status)}</span>
                    </td>
                    <td data-label="到期">
                      <input
                        type="date"
                        value={dateInputValue(customer.expiresAt)}
                        onChange={(event) => patchCustomer(customer.id, { expiresAt: event.target.value })}
                        aria-label={`${customer.displayName} 到期日期`}
                        disabled={locked}
                      />
                      <small>{expiryHint(customer, status)}</small>
                    </td>
                    <td data-label="拉取次数">
                      <strong>{customer.subscriptionClicks}</strong>
                      <small>{customer.lastSubscriptionClickAt ? formatDateTime(customer.lastSubscriptionClickAt) : "未获取"}</small>
                    </td>
                    <td data-label="续费">
                      <div className="payment-row">
                        <input
                          inputMode="decimal"
                          placeholder="金额"
                          value={draft.amount}
                          onChange={(event) => updateDraft(customer.id, { amount: event.target.value })}
                          aria-label={`${customer.displayName} 续费金额`}
                          disabled={locked}
                        />
                        <input
                          inputMode="numeric"
                          placeholder="天数"
                          value={draft.periodDays}
                          onChange={(event) => updateDraft(customer.id, { periodDays: event.target.value })}
                          aria-label={`${customer.displayName} 续费天数`}
                          disabled={locked}
                        />
                        <button
                          type="button"
                          className="secondary compact-button"
                          onClick={() => extendCustomer(customer.id)}
                          disabled={locked || busy === `extend-${customer.id}`}
                          title={locked ? "客户已禁用，请先启用" : "登记续费"}
                        >
                          <Icon name="receipt" />
                          登记
                        </button>
                      </div>
                    </td>
                    <td data-label="操作" className="action-cell">
                      <div className="button-row action-buttons">
                        <button
                          type="button"
                          className="ghost compact-button"
                          onClick={() => patchCustomer(customer.id, { disabled: !customer.disabled })}
                          disabled={busy === `patch-${customer.id}`}
                        >
                          <Icon name="lock" />
                          {customer.disabled ? "启用" : "禁用"}
                        </button>
                        <button
                          type="button"
                          className="ghost compact-button"
                          onClick={() => resetToken(customer.id)}
                          disabled={locked || busy === `reset-${customer.id}`}
                          title={locked ? "客户已禁用，请先启用" : "重置订阅"}
                        >
                          <Icon name="refresh" />
                          重置数据
                        </button>
                        <button
                          type="button"
                          className="danger compact-button"
                          onClick={() => deleteCustomerAccount(customer)}
                          disabled={busy === `delete-customer-${customer.id}`}
                        >
                          删除账号
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredCustomers.length ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    {state?.customers.length ? "没有符合条件的客户。" : "还没有客户，先创建一个成员。"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
          </section>
        </div>

        {showCreateCustomer ? (
          <aside className="create-side-panel" ref={createPanelRef}>
            <form className="panel stack" onSubmit={createCustomer}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">客户</p>
                  <h2>新增客户</h2>
                </div>
                <button className="ghost compact-button" type="button" onClick={() => setShowCreateCustomer(false)}>
                  取消
                </button>
              </div>
              <label>
                <span>昵称</span>
                <input
                  value={customerForm.displayName}
                  onChange={(event) => setCustomerForm({ ...customerForm, displayName: event.target.value })}
                  required
                />
              </label>
              <div className="two-col">
                <label>
                  <span>QQ</span>
                  <input
                    value={customerForm.qq}
                    onChange={(event) => setCustomerForm({ ...customerForm, qq: event.target.value })}
                  />
                </label>
                <label>
                  <span>群名</span>
                  <select
                    value={customerForm.groupName}
                    onChange={(event) => setCustomerForm({ ...customerForm, groupName: event.target.value })}
                  >
                    {defaultGroupOptions.map((groupName) => (
                      <option key={groupName} value={groupName}>
                        {groupName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>备注</span>
                <textarea
                  value={customerForm.notes}
                  onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })}
                  rows={3}
                />
              </label>
              <button className="primary" disabled={busy === "create-customer"}>
                <Icon name="plus" />
                创建客户
              </button>
            </form>
          </aside>
        ) : null}
      </section>

      <section className="table-section slim">
        <div className="section-heading">
          <div>
            <p className="eyebrow">收款</p>
            <h2>最近登记</h2>
          </div>
        </div>
        <div className="recent-payments">
          {state?.payments.length ? (
            state.payments.map((payment) => (
              <div key={payment.id}>
                <span>
                  <strong>{payment.customerDisplayName || `#${payment.customerId}`}</strong>
                  <small>{payment.customerQq || "未填 QQ"}</small>
                </span>
                <strong>{payment.amount.toFixed(2)}</strong>
                <span>{payment.periodDays} 天</span>
                <span>{formatDateTime(payment.paidAt)}</span>
                <button
                  className="ghost compact-button"
                  onClick={() => deletePaymentRecord(payment.id)}
                  disabled={busy === `delete-payment-${payment.id}`}
                >
                  删除
                </button>
              </div>
            ))
          ) : (
            <p>暂无续费记录。</p>
          )}
        </div>
      </section>

      <section className="table-section slim">
        <div className="section-heading">
          <div>
            <p className="eyebrow">获取</p>
            <h2>最近获取记录</h2>
          </div>
          <span className="muted-stat">{state?.accessLogs.length || 0}</span>
        </div>
        <div className="recent-access">
          {state?.accessLogs.length ? (
            state.accessLogs.map((log) => (
              <div key={log.id}>
                <span>
                  <strong>{log.customerDisplayName || (log.customerId ? `#${log.customerId}` : "未知客户")}</strong>
                  <small>{log.customerQq || "未填 QQ"} · {log.customerGroupName || "未分组"}</small>
                </span>
                <span>{accessActionLabel(log.action)}</span>
                <span>{formatDateTime(log.createdAt)}</span>
                <span>{log.ip || "未知 IP"}</span>
                <span title={log.userAgent}>{shortUserAgent(log.userAgent)}</span>
              </div>
            ))
          ) : (
            <p>暂无获取记录。</p>
          )}
        </div>
      </section>
    </main>
  );
}
