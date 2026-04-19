"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/Icon";
import { copyToClipboard } from "@/lib/clipboard";
import type { CustomerStatus } from "@/lib/customer";
import type { Customer } from "@/lib/db";

export function PortalAccount({ customer, status }: { customer: Customer; status: CustomerStatus }) {
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [revealedUrl, setRevealedUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const active = status === "active";
  async function copySubscription() {
    setNotice("");
    const response = await fetch("/api/portal/subscription", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "获取订阅失败");
      return;
    }

    const subscriptionUrl = body.subscriptionUrl as string;
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
    setNotice("浏览器禁止自动复制，请手动复制下方链接。");
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
            退出
          </button>
        </div>

        <section className="portal-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">1</p>
              <h2>订阅链接</h2>
            </div>
          </div>
          {revealedUrl || !active ? (
            <div className="subscription-box">
              <span>{active ? revealedUrl : "当前状态不可获取订阅链接"}</span>
            </div>
          ) : (
            <p className="muted-copy">点击页面下方“获取订阅”后显示链接。</p>
          )}
        </section>

        <section className="portal-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">2</p>
              <h2>扫描二维码订阅</h2>
            </div>
          </div>
          {active && qrDataUrl ? (
            <div className="subscribe-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="订阅二维码" />
            </div>
          ) : active ? (
            <p className="muted-copy">点击页面下方“获取订阅”后显示二维码。</p>
          ) : (
            <p className="error-text">已到期，请扫码付款后联系管理员开通。</p>
          )}
          {!active ? (
            <div className="pay-box">
              <div className="qr-placeholder">收款码</div>
              <p>付款时请备注 QQ 号，方便管理员核对。</p>
            </div>
          ) : null}
        </section>

        <div className="portal-action">
          <button className="primary" onClick={copySubscription} disabled={!active}>
            <Icon name="copy" />
            获取订阅
          </button>
        </div>

        {notice ? <p className="notice inline">{notice}</p> : null}

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
