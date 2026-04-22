"use client";

import { FormEvent, useState } from "react";
import { Icon } from "@/components/Icon";

export function PortalLogin() {
  const [qq, setQq] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qq }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "登录失败");
      }
      window.location.href = "/portal/me";
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell shell-narrow">
      <section className="login-panel">
        <h1>订阅中心</h1>
        <p className="login-hint">首次输入后，本设备会自动记住。</p>
        <form className="stack" onSubmit={login}>
          <label>
            <span>QQ 号</span>
            <input
              value={qq}
              onChange={(event) => setQq(event.target.value)}
              inputMode="numeric"
              autoComplete="username"
              placeholder="请输入已登记的 QQ 号"
              autoFocus
              required
            />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="primary" disabled={busy}>
            <Icon name="login" />
            {busy ? "登录中..." : "查看订阅"}
          </button>
        </form>
      </section>
    </main>
  );
}
