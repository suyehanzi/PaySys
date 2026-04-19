import { getUpstreamStatus, markUpstreamError, updateUpstreamCache, type UpstreamStatus } from "@/lib/db";

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
  var __paysysRefreshState: RefreshState | undefined;
}

function refreshState(): RefreshState {
  if (!globalThis.__paysysRefreshState) {
    globalThis.__paysysRefreshState = {
      inFlight: null,
      lastFinishedAt: 0,
    };
  }
  return globalThis.__paysysRefreshState;
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
  try {
    const url = validateTemporaryUrl(temporaryUrl);
    const fetched = await fetchSubscriptionContent(url, options.fetcher || fetch);
    const status = updateUpstreamCache(fetched);
    return { ok: true, status };
  } catch (error) {
    markUpstreamError(publicError(error));
    throw error;
  }
}

export async function refreshUpstreamAutomatically(options: RefreshOptions = {}): Promise<RefreshResult> {
  const state = refreshState();
  const now = options.now?.() ?? Date.now();
  const cooldownMs = options.cooldownMs ?? 60_000;

  if (state.inFlight) {
    return state.inFlight;
  }

  if (state.lastFinishedAt && now - state.lastFinishedAt < cooldownMs) {
    return { ok: true, skipped: "cooldown", status: getUpstreamStatus() };
  }

  const task = (async () => {
    try {
      const provider = options.provider || getTemporarySubscriptionUrlViaLilisi;
      const temporaryUrl = await provider();
      return await refreshFromTemporaryUrl(temporaryUrl, { fetcher: options.fetcher });
    } catch (error) {
      markUpstreamError(publicError(error));
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

  const loginResponse = await fetch("https://my.lilisi.cc/api/v1/passport/auth/login", {
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

  const subscribeResponse = await fetch("https://my.lilisi.cc/api/v1/user/getSubscribe", {
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
  globalThis.__paysysRefreshState = undefined;
}
