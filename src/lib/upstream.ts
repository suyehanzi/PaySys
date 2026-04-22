import {
  getUpstreamAccountWithSecretById,
  getUpstreamAccountWithSecretForGroup,
  getUpstreamStatus,
  getUpstreamStatusForAccount,
  markUpstreamAccountError,
  markUpstreamError,
  updateUpstreamAccountCache,
  updateUpstreamCache,
  type UpstreamStatus,
} from "@/lib/db";

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

type RefreshOptions = {
  provider?: () => Promise<string>;
  fetcher?: Fetcher;
  cooldownMs?: number;
  now?: () => number;
};

export type RefreshResult = {
  ok: true;
  status: UpstreamStatus;
  skipped?: "cooldown";
};

type RefreshState = {
  inFlight: Promise<RefreshResult> | null;
  lastFinishedAt: number;
};

declare global {
  var __paysysRefreshStates: Map<string, RefreshState> | undefined;
}

type CacheTarget = {
  getStatus: () => UpstreamStatus;
  updateCache: (input: { content: string; contentType?: string }) => UpstreamStatus;
  markError: (error: string) => UpstreamStatus;
};

function refreshState(key: string): RefreshState {
  if (!globalThis.__paysysRefreshStates) {
    globalThis.__paysysRefreshStates = new Map();
  }

  let state = globalThis.__paysysRefreshStates.get(key);
  if (!state) {
    state = {
      inFlight: null,
      lastFinishedAt: 0,
    };
    globalThis.__paysysRefreshStates.set(key, state);
  }
  return state;
}

export class UpstreamRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamRefreshError";
  }
}

function publicError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function validateTemporaryUrl(value: string): URL {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UpstreamRefreshError("临时订阅链接必须是 http 或 https");
  }
  return url;
}

async function fetchSubscriptionContent(url: URL, fetcher: Fetcher): Promise<{ content: string; contentType: string }> {
  const response = await fetcher(url, {
    headers: {
      "user-agent": "clash-verge/v1.7.7",
      accept: "*/*",
    },
  });

  if (!response.ok) {
    throw new UpstreamRefreshError(`上游订阅请求失败：HTTP ${response.status}`);
  }

  const content = await response.text();
  if (!content.trim()) {
    throw new UpstreamRefreshError("上游订阅内容为空");
  }

  const maxBytes = 5 * 1024 * 1024;
  if (Buffer.byteLength(content, "utf8") > maxBytes) {
    throw new UpstreamRefreshError("上游订阅内容超过 5MB，已拒绝缓存");
  }

  return {
    content,
    contentType: response.headers.get("content-type") || "text/plain; charset=utf-8",
  };
}

export async function refreshFromTemporaryUrl(
  temporaryUrl: string,
  options: { fetcher?: Fetcher } = {},
): Promise<RefreshResult> {
  return refreshFromTemporaryUrlForTarget(temporaryUrl, globalCacheTarget(), options);
}

async function refreshFromTemporaryUrlForTarget(
  temporaryUrl: string,
  target: CacheTarget,
  options: { fetcher?: Fetcher } = {},
): Promise<RefreshResult> {
  try {
    const url = validateTemporaryUrl(temporaryUrl);
    const fetched = await fetchSubscriptionContent(url, options.fetcher || fetch);
    const status = target.updateCache(fetched);
    return { ok: true, status };
  } catch (error) {
    target.markError(publicError(error));
    throw error;
  }
}

export async function refreshUpstreamAutomatically(options: RefreshOptions = {}): Promise<RefreshResult> {
  return refreshAutomatically("global", globalCacheTarget(), options.provider || getTemporarySubscriptionUrlViaLilisi, options);
}

export async function refreshUpstreamForGroup(groupName: string, options: RefreshOptions = {}): Promise<RefreshResult> {
  const account = getUpstreamAccountWithSecretForGroup(groupName);
  if (!account || !account.enabled) {
    return refreshUpstreamAutomatically(options);
  }
  return refreshUpstreamAccount(account.id, options);
}

export async function refreshUpstreamAccount(accountId: number, options: RefreshOptions = {}): Promise<RefreshResult> {
  const account = getUpstreamAccountWithSecretById(accountId);
  if (!account) {
    throw new UpstreamRefreshError("上游账号不存在");
  }
  if (!account.enabled) {
    throw new UpstreamRefreshError("上游账号已停用");
  }
  if (!account.email || !account.password) {
    throw new UpstreamRefreshError("上游账号缺少账号或密码");
  }

  const target = accountCacheTarget(account.id);
  const provider =
    options.provider ||
    (() => getTemporarySubscriptionUrlViaLilisiCredentials(account.email, account.password, options.fetcher || fetch));
  return refreshAutomatically(`account:${account.id}`, target, provider, options);
}

async function refreshAutomatically(
  key: string,
  target: CacheTarget,
  provider: () => Promise<string>,
  options: RefreshOptions,
): Promise<RefreshResult> {
  const state = refreshState(key);
  const now = options.now?.() ?? Date.now();
  const cooldownMs = options.cooldownMs ?? 60_000;

  if (state.inFlight) {
    return state.inFlight;
  }

  if (state.lastFinishedAt && now - state.lastFinishedAt < cooldownMs) {
    return { ok: true, skipped: "cooldown", status: target.getStatus() };
  }

  const task = (async () => {
    try {
      const temporaryUrl = await provider();
      return await refreshFromTemporaryUrlForTarget(temporaryUrl, target, { fetcher: options.fetcher });
    } catch (error) {
      target.markError(publicError(error));
      throw error;
    } finally {
      state.lastFinishedAt = options.now?.() ?? Date.now();
      state.inFlight = null;
    }
  })();

  state.inFlight = task;
  return task;
}

export async function getTemporarySubscriptionUrlViaLilisi(): Promise<string> {
  const email = process.env.LILISI_EMAIL;
  const password = process.env.LILISI_PASSWORD;
  if (!email || !password) {
    throw new UpstreamRefreshError("缺少 LILISI_EMAIL 或 LILISI_PASSWORD，无法自动刷新");
  }

  return getTemporarySubscriptionUrlViaLilisiCredentials(email, password);
}

export async function getTemporarySubscriptionUrlViaLilisiCredentials(
  email: string,
  password: string,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const loginResponse = await fetcher("https://my.lilisi.cc/api/v1/passport/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!loginResponse.ok) {
    throw new UpstreamRefreshError(`LILISI 登录接口失败：HTTP ${loginResponse.status}`);
  }

  const loginJson = (await loginResponse.json().catch(() => null)) as {
    data?: { auth_data?: string };
    message?: string;
  } | null;
  const authData = loginJson?.data?.auth_data;
  if (!authData) {
    throw new UpstreamRefreshError(loginJson?.message || "LILISI 登录失败，未返回授权信息");
  }

  const subscribeResponse = await fetcher("https://my.lilisi.cc/api/v1/user/getSubscribe", {
    headers: {
      authorization: authData,
      accept: "application/json",
    },
  });

  if (!subscribeResponse.ok) {
    throw new UpstreamRefreshError(`LILISI 订阅信息接口失败：HTTP ${subscribeResponse.status}`);
  }

  const subscribeJson = (await subscribeResponse.json().catch(() => null)) as {
    data?: { subscribe_url?: string };
    message?: string;
  } | null;
  const subscribeUrl = subscribeJson?.data?.subscribe_url;
  if (!subscribeUrl || !/^https?:\/\//i.test(subscribeUrl.trim())) {
    throw new UpstreamRefreshError(subscribeJson?.message || "LILISI 未返回可用订阅地址");
  }

  return subscribeUrl.trim();
}

export function resetRefreshStateForTests(): void {
  globalThis.__paysysRefreshStates = undefined;
}

function globalCacheTarget(): CacheTarget {
  return {
    getStatus: getUpstreamStatus,
    updateCache: updateUpstreamCache,
    markError: markUpstreamError,
  };
}

function accountCacheTarget(accountId: number): CacheTarget {
  return {
    getStatus: () => getUpstreamStatusForAccount(accountId),
    updateCache: (input) => updateUpstreamAccountCache(accountId, input),
    markError: (error) => markUpstreamAccountError(accountId, error),
  };
}
