"use client";

import { FormEvent, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/Icon";
import { copyToClipboard } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/dates";
import type { CustomerStatus } from "@/lib/customer";
import type { Customer } from "@/lib/db";

export function PortalAccount({ customer, status }: { customer: Customer; status: CustomerStatus }) {
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [revealedUrl, setRevealedUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [hasPortalPassword, setHasPortalPassword] = useState(customer.hasPortalPassword);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const active = status === "active";
  const canGetSubscription = active && hasPortalPassword;
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

  function subscriptionUrlFromResponse(body: { subscriptionPath?: string; subscriptionUrl?: string }): string {
    const fallbackPath = `/sub/${customer.token}`;
    const path = body.subscriptionPath || (() => {
      try {
        return body.subscriptionUrl ? new URL(body.subscriptionUrl).pathname : fallbackPath;
      } catch {
        return fallbackPath;
      }
    })();

    return `${window.location.origin}${path}`;
  }

  async function copySubscription() {
    setNotice("");
    if (!hasPortalPassword) {
      setNotice("请先设置登录密码。");
      return;
    }
    const response = await fetch("/api/portal/subscription", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "获取失败");
      return;
    }

    const subscriptionUrl = subscriptionUrlFromResponse(body);
    setRevealedUrl(subscriptionUrl);
    if (!qrDataUrl) {
      setQrDataUrl(
        await QRCode.toDataURL(subscriptionUrl, {
          margin: 1,
          width: 220,
          color: {
            dark: "#172033",
            light: "#ffffff",
          },
        }),
      );
    }
    const copied = await copyToClipboard(subscriptionUrl);
    if (copied) {
      setNotice("订阅链接已复制。");
      setManualCopy("");
      return;
    }
    setManualCopy(subscriptionUrl);
    setNotice("请手动复制下方链接。");
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (password !== passwordConfirm) {
      setNotice("两次密码不一致。");
      return;
    }
    setPasswordBusy(true);
    try {
      const response = await fetch("/api/portal/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "保存失败");
      }
      setHasPortalPassword(true);
      setPassword("");
      setPasswordConfirm("");
      setNotice("密码已保存。");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "保存失败");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/portal/logout", { method: "POST" });
    window.location.href = "/portal";
  }

  return (
    <main className="shell shell-narrow">
      <section className="user-panel">
        <div className="portal-head">
          <div>
            <p className="eyebrow">我的订阅</p>
            <h1>{customer.displayName}</h1>
          </div>
          <button className="ghost compact-button" onClick={logout}>
            <Icon name="power" />
            退出
          </button>
        </div>
        <div className="status-line">
          <span className={`badge ${customer.isVip && status === "active" ? "vip" : status}`}>{statusText}</span>
          {customer.isVip && status === "active" ? null : <span>到期：{formatDateTime(customer.expiresAt)}</span>}
        </div>

        {!hasPortalPassword ? (
          <section className="portal-section portal-password-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">安全</p>
                <h2>设置登录密码</h2>
              </div>
            </div>
            <form className="stack portal-password-form" onSubmit={savePassword}>
              <label>
                <span className="sr-only">新密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="设置密码"
                  minLength={6}
                  required
                />
              </label>
              <label>
                <span className="sr-only">确认密码</span>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  autoComplete="new-password"
                  placeholder="确认密码"
                  minLength={6}
                  required
                />
              </label>
              <button className="secondary" disabled={passwordBusy}>
                <Icon name="save" />
                {passwordBusy ? "保存中..." : "保存密码"}
              </button>
            </form>
          </section>
        ) : null}

        <section className="portal-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">1</p>
              <h2>订阅链接</h2>
            </div>
          </div>
          {revealedUrl || !active || !hasPortalPassword ? (
            <div className="subscription-box">
              <span>{active ? revealedUrl || "先设置登录密码" : "暂不可获取"}</span>
            </div>
          ) : (
            <p className="muted-copy">点击“获取订阅”后显示。</p>
          )}
        </section>

        <section className="portal-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">2</p>
              <h2>扫描二维码订阅</h2>
            </div>
          </div>
          {canGetSubscription && qrDataUrl ? (
            <div className="subscribe-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="订阅二维码" />
            </div>
          ) : active ? (
            <p className="muted-copy">{hasPortalPassword ? "点击“获取订阅”后显示。" : "先设置登录密码。"}</p>
          ) : (
            <p className="error-text">{inactiveMessage}</p>
          )}
          {!active ? (
            <div className="pay-box">
              <div className="qr-placeholder">收款码</div>
              <p>付款请备注 QQ。</p>
            </div>
          ) : null}
        </section>

        <div className="portal-action">
          <button className="primary" onClick={copySubscription} disabled={!canGetSubscription}>
            <Icon name="copy" />
            获取订阅
          </button>
        </div>

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
