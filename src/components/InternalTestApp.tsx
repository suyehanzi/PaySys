"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/Icon";
import { copyToClipboard } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/dates";

type InternalGroupLink = {
  groupName: string;
  subscriptionUrl: string;
  bound: boolean;
  enabled: boolean;
  contentSize: number;
  hasContent: boolean;
  lastRefreshedAt: string | null;
  lastError: string | null;
};

async function readJson<T>(response: Response): Promise<T & { ok?: boolean; error?: string }> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `请求失败：HTTP ${response.status}`);
  }
  return body;
}

export function InternalTestApp() {
  const [groups, setGroups] = useState<InternalGroupLink[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [qrState, setQrState] = useState({ url: "", dataUrl: "" });
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(true);

  const selected = useMemo(
    () => groups.find((group) => group.groupName === selectedGroup) || groups[0],
    [groups, selectedGroup],
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch("/api/admin/internal-links", { cache: "no-store" });
        if (response.status === 401) {
          setAuthenticated(false);
          return;
        }
        const body = await readJson<{ groups: InternalGroupLink[] }>(response);
        if (!mounted) return;
        setGroups(body.groups);
        setSelectedGroup((current) => current || body.groups[0]?.groupName || "");
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

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!selected?.subscriptionUrl) {
      return;
    }

    void QRCode.toDataURL(selected.subscriptionUrl, {
      margin: 1,
      width: 220,
      color: {
        dark: "#172033",
        light: "#ffffff",
      },
    }).then((dataUrl) => {
      if (mounted) {
        setQrState({ url: selected.subscriptionUrl, dataUrl });
      }
    });

    return () => {
      mounted = false;
    };
  }, [selected?.subscriptionUrl]);

  async function copyLink() {
    if (!selected) return;
    const copied = await copyToClipboard(selected.subscriptionUrl);
    if (copied) {
      setNotice("测试链接已复制");
      setManualCopy("");
      return;
    }
    setManualCopy(selected.subscriptionUrl);
    setNotice("请手动复制下方链接");
  }

  if (loading) {
    return (
      <main className="shell shell-narrow">
        <section className="empty-state">
          <p className="eyebrow">内部测试</p>
          <h1>正在加载</h1>
        </section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="shell shell-narrow">
        <section className="empty-state">
          <p className="eyebrow">内部测试</p>
          <h1>需要登录后台</h1>
          <div className="button-row wide">
            <button className="primary" onClick={() => { window.location.href = "/admin"; }}>
              <Icon name="login" />
              去登录
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell shell-narrow">
      <section className="user-panel internal-test-panel">
        <div className="portal-head">
          <div>
            <p className="eyebrow">内部测试</p>
            <h1>无限次访问</h1>
          </div>
          <button className="ghost compact-button" onClick={() => { window.location.href = "/admin"; }}>
            返回后台
          </button>
        </div>

        <p className="muted-copy">仅供内部测试。这个链接不绑定客户、不计客户次数，泄露后可直接访问对应群缓存。</p>

        <section className="portal-section">
          <label>
            <span>选择群</span>
            <select value={selected?.groupName || ""} onChange={(event) => setSelectedGroup(event.target.value)}>
              {groups.map((group) => (
                <option key={group.groupName} value={group.groupName}>
                  {group.groupName}
                </option>
              ))}
            </select>
          </label>
        </section>

        {selected ? (
          <>
            <dl className="facts internal-facts">
              <div>
                <dt>绑定状态</dt>
                <dd>{selected.bound ? (selected.enabled ? "已绑定并启用" : "已绑定但停用") : "未绑定，走全局兜底"}</dd>
              </div>
              <div>
                <dt>缓存</dt>
                <dd>{selected.hasContent ? `已缓存，${Math.round(selected.contentSize / 1024)} KB` : "尚未缓存"}</dd>
              </div>
              <div>
                <dt>最后刷新</dt>
                <dd>{selected.lastRefreshedAt ? formatDateTime(selected.lastRefreshedAt) : "尚未刷新"}</dd>
              </div>
              {selected.lastError ? (
                <div>
                  <dt>最近错误</dt>
                  <dd>{selected.lastError}</dd>
                </div>
              ) : null}
            </dl>

            <div className="subscription-box">
              <span>{selected.subscriptionUrl}</span>
              <button className="ghost icon-button" title="复制测试链接" aria-label="复制测试链接" onClick={copyLink}>
                <Icon name="copy" />
              </button>
            </div>

            {qrState.url === selected.subscriptionUrl && qrState.dataUrl ? (
              <div className="subscribe-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrState.dataUrl} alt={`${selected.groupName} 内部测试二维码`} />
              </div>
            ) : null}

            <div className="button-row wide">
              <button className="primary" onClick={copyLink}>
                <Icon name="copy" />
                复制链接
              </button>
              <button className="secondary" onClick={() => window.open(selected.subscriptionUrl, "_blank", "noopener,noreferrer")}>
                <Icon name="link" />
                打开测试
              </button>
            </div>
          </>
        ) : (
          <p className="muted-copy">暂无可测试群。</p>
        )}

        {notice ? <p className="notice inline" role="status">{notice}</p> : null}

        {manualCopy ? (
          <div className="manual-copy inline-copy">
            <textarea
              readOnly
              value={manualCopy}
              rows={3}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
