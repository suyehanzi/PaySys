"use client";

import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { copyToClipboard } from "@/lib/clipboard";
import { dateInputValue, formatDateTime } from "@/lib/dates";
import { getCustomerStatus, remainingDays } from "@/lib/customer";
import { DEFAULT_PAYMENT_AMOUNT, DEFAULT_PAYMENT_PERIOD_DAYS } from "@/lib/payments";
import type { AccessLog, Customer, Payment, RegistrationRequest, UpstreamAccount, UpstreamStatus } from "@/lib/db";

type AdminState = {
  customers: Customer[];
  payments: Payment[];
  registrationRequests: RegistrationRequest[];
  accessLogs: AccessLog[];
  upstream: UpstreamStatus;
  upstreamAccounts: UpstreamAccount[];
  admin: {
    usingDefaultPassword: boolean;
  };
};

type UpstreamAccountDraft = {
  groupName: string;
  label: string;
  email: string;
  password: string;
};

type PaymentDraft = {
  amount: string;
  periodDays: string;
  notes: string;
};

type StatusFilter = "all" | "active" | "unpaid" | "expired" | "disabled";

const defaultGroupOptions = ["1群", "2群", "3群"];
const defaultPaymentDraft: PaymentDraft = {
  amount: String(DEFAULT_PAYMENT_AMOUNT),
  periodDays: String(DEFAULT_PAYMENT_PERIOD_DAYS),
  notes: "",
};
const initialAccessLogLimit = 80;

const initialCustomerForm = {
  displayName: "",
  qq: "",
  groupName: defaultGroupOptions[0],
  notes: "",
};

const initialAccountForm: UpstreamAccountDraft = {
  groupName: "",
  label: "",
  email: "",
  password: "",
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
  if (action === "portal_password_update") return "修改密码";
  if (action === "subscription_fetch") return "订阅拉取";
  if (action === "portal_login") return "客户登录";
  if (action === "user_refresh") return "刷新订阅";
  return action;
}

function customerMatchesFilters(customer: Customer, keyword: string, statusFilter: StatusFilter, groupFilter: string) {
  const status = getCustomerStatus(customer);
  const matchesStatus = statusFilter === "all" || status === statusFilter;
  const matchesGroup = groupFilter === "all" || customer.groupName === groupFilter;
  const haystack = [customer.displayName, customer.qq, customer.groupName, customer.notes]
    .join(" ")
    .toLowerCase();
  return matchesStatus && matchesGroup && (!keyword || haystack.includes(keyword));
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
  if (customer.isVip) return "VIP";
  if (status === "unpaid") return "未登记付款";
  if (status === "expired") return "过期7天+";

  const days = remainingDays(customer.expiresAt);
  return days > 0 ? `剩 ${days} 天` : "宽限期内";
}

function upstreamAccountHint(account: UpstreamAccount) {
  if (!account.enabled) return "已停用";
  if (account.lastError) return account.lastError;
  if (account.hasContent) {
    return account.lastRefreshedAt ? `已缓存 · ${formatDateTime(account.lastRefreshedAt)}` : "已缓存";
  }
  return "尚未缓存";
}

function registrationStatusLabel(status: RegistrationRequest["status"]) {
  if (status === "approved") return "已分配";
  if (status === "rejected") return "已忽略";
  return "待分配";
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
  const [accountForm, setAccountForm] = useState({ ...initialAccountForm, groupName: defaultGroupOptions[0] });
  const [accountDrafts, setAccountDrafts] = useState<Record<number, UpstreamAccountDraft>>({});
  const [registrationGroupDrafts, setRegistrationGroupDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState<{ label: string; value: string } | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<number, PaymentDraft>>({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [bulkGroupName, setBulkGroupName] = useState(defaultGroupOptions[0]);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [showUpstreamAccounts, setShowUpstreamAccounts] = useState(false);
  const [showAllAccessLogs, setShowAllAccessLogs] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<number>>(new Set());
  const [pinnedCustomerId, setPinnedCustomerId] = useState<number | null>(null);
  const paymentInFlight = useRef(new Set<number>());
  const createPanelRef = useRef<HTMLElement | null>(null);
  const deferredCustomerSearch = useDeferredValue(customerSearch);

  const counts = useMemo(() => {
    const customers = state?.customers || [];
    const dueSoon = customers.filter((customer) => {
      if (customer.isVip) return false;
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
      pendingRegistrations: (state?.registrationRequests || []).filter((request) => request.status === "pending").length,
    };
  }, [state?.customers, state?.registrationRequests]);

  const groupOptions = useMemo(() => {
    const names = new Set(defaultGroupOptions);
    for (const account of state?.upstreamAccounts || []) {
      if (account.groupName) names.add(account.groupName);
    }
    for (const customer of state?.customers || []) {
      if (customer.groupName) names.add(customer.groupName);
    }
    return Array.from(names);
  }, [state?.customers, state?.upstreamAccounts]);

  const filteredCustomers = useMemo(() => {
    const keyword = deferredCustomerSearch.trim().toLowerCase();
    const customers = (state?.customers || []).filter((customer) =>
      customerMatchesFilters(customer, keyword, statusFilter, groupFilter),
    );
    if (!pinnedCustomerId) return customers;

    const pinnedIndex = customers.findIndex((customer) => customer.id === pinnedCustomerId);
    if (pinnedIndex <= 0) return customers;

    const nextCustomers = [...customers];
    const [pinnedCustomer] = nextCustomers.splice(pinnedIndex, 1);
    return [pinnedCustomer, ...nextCustomers];
  }, [deferredCustomerSearch, groupFilter, pinnedCustomerId, state?.customers, statusFilter]);

  const selectedCustomers = useMemo(
    () => (state?.customers || []).filter((customer) => selectedCustomerIds.has(customer.id)),
    [selectedCustomerIds, state?.customers],
  );
  const visibleAccessLogs = useMemo(() => {
    const accessLogs = state?.accessLogs || [];
    return showAllAccessLogs ? accessLogs : accessLogs.slice(0, initialAccessLogLimit);
  }, [showAllAccessLogs, state?.accessLogs]);
  const selectedCount = selectedCustomers.length;
  const allVisibleSelected =
    filteredCustomers.length > 0 && filteredCustomers.every((customer) => selectedCustomerIds.has(customer.id));

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

  async function changeCustomerGroup(customer: Customer, groupName: string) {
    const nextGroupName = groupName.trim();
    if (nextGroupName === customer.groupName) {
      return;
    }

    if (await patchCustomer(customer.id, { groupName: nextGroupName })) {
      setNotice(`已将 ${customer.displayName} 切换到 ${nextGroupName || "未分组"}`);
    }
  }

  function toggleCustomerSelection(id: number, selected: boolean) {
    setSelectedCustomerIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function toggleVisibleCustomerSelection(selected: boolean) {
    setSelectedCustomerIds((current) => {
      const next = new Set(current);
      for (const customer of filteredCustomers) {
        if (selected) {
          next.add(customer.id);
        } else {
          next.delete(customer.id);
        }
      }
      return next;
    });
  }

  async function bulkSetVip(isVip: boolean) {
    if (!selectedCustomers.length) {
      setNotice("请先选择客户");
      return;
    }

    const ids = selectedCustomers.map((customer) => customer.id);
    setBusy("bulk-vip");
    try {
      const result = await readJson<{ updated: number }>(await fetch("/api/admin/customers/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, isVip }),
      }));
      setSelectedCustomerIds(new Set());
      setNotice(isVip ? `已标记 ${result.updated} 个 VIP` : `已取消 ${result.updated} 个 VIP`);
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量处理失败");
    } finally {
      setBusy("");
    }
  }

  async function bulkSetGroup() {
    if (!selectedCustomers.length) {
      setNotice("请先选择客户");
      return;
    }

    const groupName = bulkGroupName.trim();
    if (!groupName) {
      setNotice("请选择群");
      return;
    }

    const ids = selectedCustomers.map((customer) => customer.id);
    setBusy("bulk-group");
    try {
      const result = await readJson<{ updated: number }>(await fetch("/api/admin/customers/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, groupName }),
      }));
      setSelectedCustomerIds(new Set());
      setNotice(`已切换 ${result.updated} 个客户到 ${groupName}`);
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量切换失败");
    } finally {
      setBusy("");
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

  async function resetPortalPassword(customer: Customer) {
    if (!window.confirm(`重设客户「${customer.displayName}」的登录密码？客户下次可用 QQ 进入并重新设置密码。`)) {
      return;
    }
    setBusy(`reset-password-${customer.id}`);
    try {
      await readJson(await fetch(`/api/admin/customers/${customer.id}/reset-password`, { method: "POST" }));
      setNotice("客户密码已重设");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重设密码失败");
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

  async function approveRegistrationRequest(request: RegistrationRequest) {
    const groupName = registrationGroupDrafts[request.id] || groupOptions[0] || defaultGroupOptions[0];
    setBusy(`approve-registration-${request.id}`);
    try {
      const result = await readJson<{ customer: Customer }>(
        await fetch(`/api/admin/registration-requests/${request.id}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ groupName }),
        }),
      );
      setRegistrationGroupDrafts((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setPinnedCustomerId(result.customer.id);
      if (!customerMatchesFilters(result.customer, customerSearch.trim().toLowerCase(), statusFilter, groupFilter)) {
        setCustomerSearch("");
        setStatusFilter("all");
        setGroupFilter("all");
      }
      setNotice("申请已分配，客户已置顶");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "处理申请失败");
    } finally {
      setBusy("");
    }
  }

  async function rejectRegistrationRequest(request: RegistrationRequest) {
    if (!window.confirm(`忽略「${request.displayName}」的注册申请？`)) {
      return;
    }
    setBusy(`reject-registration-${request.id}`);
    try {
      await readJson(await fetch(`/api/admin/registration-requests/${request.id}`, { method: "DELETE" }));
      setNotice("申请已忽略");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "忽略申请失败");
    } finally {
      setBusy("");
    }
  }

  function accountDraft(account: UpstreamAccount): UpstreamAccountDraft {
    return accountDrafts[account.id] || {
      groupName: account.groupName,
      label: account.label,
      email: account.email,
      password: "",
    };
  }

  function updateAccountDraft(id: number, patch: Partial<UpstreamAccountDraft>) {
    setAccountDrafts((current) => ({
      ...current,
      [id]: { ...accountDraft(state!.upstreamAccounts.find((account) => account.id === id)!), ...patch },
    }));
  }

  async function createUpstreamAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create-account");
    try {
      await readJson(await fetch("/api/admin/upstream-accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(accountForm),
      }));
      setAccountForm({ ...initialAccountForm, groupName: accountForm.groupName });
      setNotice("上游账号已添加");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "添加账号失败");
    } finally {
      setBusy("");
    }
  }

  async function saveUpstreamAccount(account: UpstreamAccount) {
    const draft = accountDraft(account);
    const payload: Partial<UpstreamAccountDraft> & { enabled: boolean } = {
      groupName: draft.groupName,
      label: draft.label,
      email: draft.email,
      enabled: account.enabled,
    };
    if (draft.password.trim()) {
      payload.password = draft.password.trim();
    }

    setBusy(`save-account-${account.id}`);
    try {
      await readJson(await fetch(`/api/admin/upstream-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }));
      setAccountDrafts((current) => {
        const next = { ...current };
        delete next[account.id];
        return next;
      });
      setNotice("上游账号已保存");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存账号失败");
    } finally {
      setBusy("");
    }
  }

  async function toggleUpstreamAccount(account: UpstreamAccount) {
    setBusy(`toggle-account-${account.id}`);
    try {
      await readJson(await fetch(`/api/admin/upstream-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !account.enabled }),
      }));
      setNotice(account.enabled ? "上游账号已停用" : "上游账号已启用");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "切换账号失败");
    } finally {
      setBusy("");
    }
  }

  async function refreshUpstreamAccount(account: UpstreamAccount) {
    setBusy(`refresh-account-${account.id}`);
    try {
      const result = await readJson<{ skipped?: "cooldown" }>(
        await fetch(`/api/admin/upstream-accounts/${account.id}/refresh`, { method: "POST" }),
      );
      setNotice(result.skipped === "cooldown" ? "刚刷新过，缓存已可用" : "上游订阅已刷新");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刷新账号失败");
      await loadState();
    } finally {
      setBusy("");
    }
  }

  async function deleteUpstreamAccount(account: UpstreamAccount) {
    if (!window.confirm(`删除「${account.groupName}」的上游账号？已缓存订阅也会删除。`)) {
      return;
    }
    setBusy(`delete-account-${account.id}`);
    try {
      await readJson(await fetch(`/api/admin/upstream-accounts/${account.id}`, { method: "DELETE" }));
      setNotice("上游账号已删除");
      await loadState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除账号失败");
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
    return `订阅入口：${linkFor("/portal")}\n输入 QQ 即可查看。`;
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
          <p>输入后台密码进入。</p>
          <form onSubmit={handleLogin} className="stack">
            <label>
              <span className="sr-only">后台密码</span>
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
        <article className={counts.pendingRegistrations > 0 ? "warning" : ""}>
          <span>待分配</span>
          <strong>{counts.pendingRegistrations}</strong>
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

      <section className="table-section registration-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">申请</p>
            <h2>注册申请</h2>
          </div>
          <span className="muted-stat">{counts.pendingRegistrations} 待分配</span>
        </div>

        <div className="registration-list">
          {state?.registrationRequests.length ? (
            state.registrationRequests.map((request) => {
              const selectedGroup = registrationGroupDrafts[request.id] || groupOptions[0] || defaultGroupOptions[0];
              const pending = request.status === "pending";
              return (
                <div key={request.id} className="registration-card">
                  <div>
                    <strong>{request.displayName}</strong>
                    <small>{request.qq} · {formatDateTime(request.createdAt)}</small>
                  </div>
                  <span className={`badge ${pending ? "unpaid" : request.status === "approved" ? "active" : "muted"}`}>
                    {registrationStatusLabel(request.status)}
                  </span>
                  {pending ? (
                    <>
                      <select
                        value={selectedGroup}
                        onChange={(event) =>
                          setRegistrationGroupDrafts((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        aria-label={`${request.displayName} 分配群`}
                      >
                        {groupOptions.map((groupName) => (
                          <option key={groupName} value={groupName}>
                            {groupName}
                          </option>
                        ))}
                      </select>
                      <div className="button-row registration-actions">
                        <button
                          type="button"
                          className="primary compact-button"
                          onClick={() => approveRegistrationRequest(request)}
                          disabled={busy === `approve-registration-${request.id}`}
                        >
                          分配
                        </button>
                        <button
                          type="button"
                          className="ghost compact-button"
                          onClick={() => rejectRegistrationRequest(request)}
                          disabled={busy === `reject-registration-${request.id}`}
                        >
                          忽略
                        </button>
                      </div>
                    </>
                  ) : (
                    <small>{request.assignedGroupName || "未分配"}</small>
                  )}
                </div>
              );
            })
          ) : (
            <p className="muted-copy">暂无注册申请。</p>
          )}
        </div>
      </section>

      <section className="table-section upstream-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">账号</p>
            <h2>上游账号</h2>
          </div>
          <div className="section-actions">
            <span className="muted-stat">{state?.upstreamAccounts.length || 0} 个绑定</span>
            <button
              type="button"
              className="ghost compact-button"
              aria-expanded={showUpstreamAccounts}
              aria-controls="upstream-accounts-panel"
              onClick={() => setShowUpstreamAccounts((value) => !value)}
            >
              {showUpstreamAccounts ? "收起" : "展开"}
            </button>
          </div>
        </div>

        <div id="upstream-accounts-panel" className="upstream-body">
          {showUpstreamAccounts ? (
            <>
              <form className="account-create-grid" onSubmit={createUpstreamAccount}>
                <label>
                  <span>群名</span>
                  <input
                    value={accountForm.groupName}
                    onChange={(event) => setAccountForm({ ...accountForm, groupName: event.target.value })}
                    placeholder="1群"
                    required
                  />
                </label>
                <label>
                  <span>名称</span>
                  <input
                    value={accountForm.label}
                    onChange={(event) => setAccountForm({ ...accountForm, label: event.target.value })}
                    placeholder="可选"
                  />
                </label>
                <label>
                  <span>登录账号</span>
                  <input
                    value={accountForm.email}
                    onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })}
                    placeholder="邮箱或账号"
                    required
                  />
                </label>
                <label>
                  <span>登录密码</span>
                  <input
                    type="password"
                    value={accountForm.password}
                    onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })}
                    placeholder="上游密码"
                    required
                  />
                </label>
                <button className="primary" disabled={busy === "create-account"}>
                  <Icon name="plus" />
                  添加绑定
                </button>
              </form>

              <div className="account-list">
                {state?.upstreamAccounts.length ? (
                  state.upstreamAccounts.map((account) => {
                    const draft = accountDraft(account);
                    return (
                      <div key={account.id} className="account-card">
                        <div className="account-card-head">
                          <div>
                            <strong>{account.groupName}</strong>
                            <small>{account.label || "未命名账号"}</small>
                          </div>
                          <span className={`badge ${account.enabled ? "active" : "muted"}`}>
                            {account.enabled ? "启用" : "停用"}
                          </span>
                        </div>
                        <div className="account-edit-grid">
                          <label>
                            <span>群名</span>
                            <input
                              value={draft.groupName}
                              onChange={(event) => updateAccountDraft(account.id, { groupName: event.target.value })}
                            />
                          </label>
                          <label>
                            <span>名称</span>
                            <input
                              value={draft.label}
                              onChange={(event) => updateAccountDraft(account.id, { label: event.target.value })}
                            />
                          </label>
                          <label>
                            <span>账号</span>
                            <input
                              value={draft.email}
                              onChange={(event) => updateAccountDraft(account.id, { email: event.target.value })}
                            />
                          </label>
                          <label>
                            <span>密码</span>
                            <input
                              type="password"
                              value={draft.password}
                              onChange={(event) => updateAccountDraft(account.id, { password: event.target.value })}
                              placeholder={account.hasPassword ? "留空不改" : "未设置"}
                            />
                          </label>
                        </div>
                        <div className="account-meta">
                          <span>{upstreamAccountHint(account)}</span>
                          <span>{account.hasContent ? `${Math.round(account.contentSize / 1024)} KB` : "无缓存"}</span>
                        </div>
                        <div className="button-row account-actions">
                          <button
                            type="button"
                            className="secondary compact-button"
                            onClick={() => saveUpstreamAccount(account)}
                            disabled={busy === `save-account-${account.id}`}
                          >
                            <Icon name="save" />
                            保存
                          </button>
                          <button
                            type="button"
                            className="ghost compact-button"
                            onClick={() => refreshUpstreamAccount(account)}
                            disabled={!account.enabled || busy === `refresh-account-${account.id}`}
                          >
                            <Icon name="refresh" />
                            刷新
                          </button>
                          <button
                            type="button"
                            className="ghost compact-button"
                            onClick={() => toggleUpstreamAccount(account)}
                            disabled={busy === `toggle-account-${account.id}`}
                          >
                            <Icon name="lock" />
                            {account.enabled ? "停用" : "启用"}
                          </button>
                          <button
                            type="button"
                            className="danger compact-button"
                            onClick={() => deleteUpstreamAccount(account)}
                            disabled={busy === `delete-account-${account.id}`}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="muted-copy">还没有绑定账号；未绑定的群会继续使用旧的全局账号。</p>
                )}
              </div>
            </>
          ) : (
            <p className="muted-copy">已收起，需要修改时展开。</p>
          )}
        </div>
      </section>

      <section className={`admin-workspace ${showCreateCustomer ? "with-create" : ""}`}>
        <div className="admin-main">
          <section className="quick-actions">
            <button type="button" className="secondary" onClick={() => { window.location.href = "/admin/unlimited"; }}>
              <Icon name="link" />
              内部测试
            </button>
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
          <select
            className="group-filter"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            aria-label="群筛选"
          >
            <option value="all">全部群</option>
            {groupOptions.map((groupName) => (
              <option key={groupName} value={groupName}>
                {groupName}
              </option>
            ))}
          </select>
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

        {selectedCount ? (
          <div className="bulk-actions" role="region" aria-label="批量处理客户">
            <span>已选 {selectedCount} 个</span>
            <div className="button-row">
              <select
                className="bulk-group-select"
                value={bulkGroupName}
                onChange={(event) => setBulkGroupName(event.target.value)}
                aria-label="批量切换客户群"
              >
                {groupOptions.map((groupName) => (
                  <option key={groupName} value={groupName}>
                    {groupName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary compact-button"
                onClick={() => void bulkSetGroup()}
                disabled={busy === "bulk-group"}
              >
                切换群
              </button>
              <button
                type="button"
                className="secondary compact-button"
                onClick={() => void bulkSetVip(true)}
                disabled={busy === "bulk-vip"}
              >
                标记 VIP
              </button>
              <button
                type="button"
                className="ghost compact-button"
                onClick={() => void bulkSetVip(false)}
                disabled={busy === "bulk-vip"}
              >
                取消 VIP
              </button>
              <button
                type="button"
                className="ghost compact-button"
                onClick={() => setSelectedCustomerIds(new Set())}
                disabled={busy === "bulk-vip"}
              >
                清除选择
              </button>
            </div>
          </div>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="select-col">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => toggleVisibleCustomerSelection(event.currentTarget.checked)}
                    aria-label="选择当前筛选客户"
                  />
                </th>
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
                const selected = selectedCustomerIds.has(customer.id);
                const pinned = customer.id === pinnedCustomerId;
                const rowClassName = [
                  selected ? "selected-row" : "",
                  pinned ? "pinned-customer-row" : "",
                ].filter(Boolean).join(" ") || undefined;
                return (
                  <tr key={customer.id} className={rowClassName}>
                    <td data-label="选择" className="select-cell">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => toggleCustomerSelection(customer.id, event.currentTarget.checked)}
                        aria-label={`选择 ${customer.displayName}`}
                      />
                    </td>
                    <td data-label="客户" className="customer-cell">
                      <div className="customer-title-row">
                        <strong>{customer.displayName}</strong>
                        {pinned ? <span className="badge pinned">刚分配</span> : null}
                      </div>
                      <div className="customer-meta-row">
                        <small>{customer.qq || "未填 QQ"}</small>
                        <select
                          className="customer-group-select"
                          value={customer.groupName || ""}
                          onChange={(event) => void changeCustomerGroup(customer, event.target.value)}
                          aria-label={`${customer.displayName} 所在群`}
                          disabled={busy === `patch-${customer.id}`}
                        >
                          <option value="">未分组</option>
                          {groupOptions.map((groupName) => (
                            <option key={groupName} value={groupName}>
                              {groupName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        className={`note-editor ${customer.notes.trim() ? "has-note" : ""}`}
                        defaultValue={customer.notes}
                        placeholder="备注"
                        onBlur={(event) => void saveCustomerNotes(customer, event.currentTarget.value)}
                        aria-label={`${customer.displayName} 备注`}
                        disabled={busy === `patch-${customer.id}`}
                        rows={2}
                      />
                    </td>
                    <td data-label="状态" className="status-cell">
                      <div className="badge-row">
                        <span className={`badge ${status}`}>{statusLabel(status)}</span>
                        {customer.isVip ? <span className="badge vip">VIP</span> : null}
                      </div>
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
                          onClick={() => resetPortalPassword(customer)}
                          disabled={busy === `reset-password-${customer.id}`}
                        >
                          <Icon name="rotate" />
                          重设密码
                        </button>
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
                  <td colSpan={7} className="empty-cell">
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
                    {groupOptions.map((groupName) => (
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
          <span className="muted-stat">{visibleAccessLogs.length} / {state?.accessLogs.length || 0}</span>
        </div>
        <div className="recent-access">
          {visibleAccessLogs.length ? (
            visibleAccessLogs.map((log) => (
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
        {!showAllAccessLogs && (state?.accessLogs.length || 0) > visibleAccessLogs.length ? (
          <div className="list-more">
            <button type="button" className="ghost compact-button" onClick={() => setShowAllAccessLogs(true)}>
              显示更多
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
