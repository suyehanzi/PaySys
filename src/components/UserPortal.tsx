"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { copyToClipboard } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/dates";
import type { CustomerStatus } from "@/lib/customer";
import type { Customer, UpstreamStatus } from "@/lib/db";

export function UserPortal({
  customer,
  status,
  upstream,
}: {
  customer: Customer;
  status: CustomerStatus;
  upstream: UpstreamStatus;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [cache, setCache] = useState(upstream);

  const active = status === "active";
  const statusText =
    status === "active"
      ? customer.isVip
        ? "VIP"
        : "正常"
      : status === "unpaid"
        ? "未登记付款"
        : status === "expired"
          ? "已过期"
          : "已禁用";
  const inactiveMessage =
    status === "unpaid"
      ? "未开通，请联系管理员。"
      : status === "expired"
        ? "已过期，请续费。"
        : "订阅已禁用。";
  const subscriptionUrl = useMemo(() => {
    if (typeof window === "undefined") return `/sub/${customer.token}`;
    return `${window.location.origin}/sub/${customer.token}`;
  }, [customer.token]);

  async function refresh() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/user/${customer.token}/refresh`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "刷新失败");
      }
      setCache(body.status);
      setNotice(body.skipped === "cooldown" ? "刚刷新过，当前订阅已可用。" : "订阅已刷新。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刷新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function copySubscription() {
    const copied = await copyToClipboard(subscriptionUrl);
    if (copied) {
      setNotice("订阅地址已复制。");
      setManualCopy("");
      return;
    }
    setManualCopy(subscriptionUrl);
    setNotice("请手动复制下方地址。");
  }

  return (
    <main className="shell shell-narrow">
      <section className="user-panel">
        <p className="eyebrow">个人订阅</p>
        <h1>{customer.displayName}</h1>
        <div className="status-line">
          <span className={`badge ${customer.isVip && status === "active" ? "vip" : status}`}>{statusText}</span>
          {customer.isVip && status === "active" ? null : <span>到期：{formatDateTime(customer.expiresAt)}</span>}
        </div>

        <dl className="facts">
          <div>
            <dt>订阅缓存</dt>
            <dd>{cache.hasContent ? `已缓存，${Math.round(cache.contentSize / 1024)} KB` : "尚未缓存"}</dd>
          </div>
          <div>
            <dt>最后刷新</dt>
            <dd>{cache.lastRefreshedAt ? formatDateTime(cache.lastRefreshedAt) : "尚未刷新"}</dd>
          </div>
        </dl>

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

        <div className="subscription-box">
          <span>{active ? subscriptionUrl : "暂不可获取"}</span>
          <button
            className="ghost icon-button"
            disabled={!active}
            title="复制订阅地址"
            aria-label="复制订阅地址"
            onClick={copySubscription}
          >
            <Icon name="copy" />
          </button>
        </div>

        <div className="button-row wide">
          <button className="primary" onClick={refresh} disabled={!active || busy}>
            <Icon name="refresh" />
            刷新订阅
          </button>
          <button className="secondary" onClick={copySubscription} disabled={!active}>
            <Icon name="copy" />
            复制地址
          </button>
        </div>

        {!active ? (
          <p className="error-text">{inactiveMessage}</p>
        ) : null}
      </section>
    </main>
  );
}
