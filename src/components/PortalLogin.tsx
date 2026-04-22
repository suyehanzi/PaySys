"use client";

import { FormEvent, useState } from "react";
import { Icon } from "@/components/Icon";

export function PortalLogin() {
  const [qq, setQq] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registerQq, setRegisterQq] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registerNotice, setRegisterNotice] = useState("");
  const [showRegister, setShowRegister] = useState(false);

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

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setRegisterNotice("");
    try {
      const response = await fetch("/api/portal/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, qq: registerQq }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "提交失败");
      }
      setRegisterNotice("申请已提交，等待管理员分配群。");
      setDisplayName("");
      setRegisterQq("");
    } catch (err) {
      setRegisterNotice(err instanceof Error ? err.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell shell-narrow">
      <section className="login-panel">
        <h1>订阅中心</h1>
        <p className="login-hint">输入 QQ 查看订阅。</p>
        <form className="stack" onSubmit={login}>
          <label>
            <span>QQ 号</span>
            <input
              value={qq}
              onChange={(event) => setQq(event.target.value)}
              inputMode="numeric"
              autoComplete="username"
              placeholder="输入 QQ 号"
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

        <div className="portal-register">
          <button type="button" className="ghost compact-button" onClick={() => setShowRegister((value) => !value)}>
            <Icon name="plus" />
            新用户申请
          </button>
          {showRegister ? (
            <form className="stack portal-register-form" onSubmit={register}>
              <label>
                <span>昵称</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="输入昵称"
                  required
                />
              </label>
              <label>
                <span>QQ 号</span>
                <input
                  value={registerQq}
                  onChange={(event) => setRegisterQq(event.target.value)}
                  inputMode="numeric"
                  placeholder="输入 QQ 号"
                  required
                />
              </label>
              <button className="secondary" disabled={busy}>
                提交申请
              </button>
              {registerNotice ? <p className="notice inline" role="status">{registerNotice}</p> : null}
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
