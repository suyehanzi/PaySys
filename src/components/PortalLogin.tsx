"use client";

import { FormEvent, useState } from "react";
import { Icon } from "@/components/Icon";

export function PortalLogin() {
  const [qq, setQq] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registerQq, setRegisterQq] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
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
        body: JSON.stringify({ qq, password }),
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
      if (registerPassword !== registerPasswordConfirm) {
        throw new Error("两次密码不一致");
      }
      const response = await fetch("/api/portal/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, qq: registerQq, password: registerPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "提交失败");
      }
      setRegisterNotice("已提交，等待分配。");
      setDisplayName("");
      setRegisterQq("");
      setRegisterPassword("");
      setRegisterPasswordConfirm("");
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
        <form className="stack" onSubmit={login}>
          <label>
            <span className="sr-only">QQ 号</span>
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
          <label>
            <span className="sr-only">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="密码（如已设置）"
            />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="primary" disabled={busy}>
            <Icon name="login" />
            {busy ? "登录中..." : "查看订阅"}
          </button>
        </form>

        <div className="portal-register">
          <button
            type="button"
            className="portal-register-toggle"
            aria-expanded={showRegister}
            onClick={() => setShowRegister((value) => !value)}
          >
            <Icon name="plus" />
            申请加入
          </button>
          {showRegister ? (
            <form className="stack portal-register-form" onSubmit={register}>
              <label>
                <span className="sr-only">群名字</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="请填入你的群名字"
                  required
                />
              </label>
              <label>
                <span className="sr-only">QQ 号</span>
                <input
                  value={registerQq}
                  onChange={(event) => setRegisterQq(event.target.value)}
                  inputMode="numeric"
                  placeholder="QQ 号"
                  required
                />
              </label>
              <label>
                <span className="sr-only">设置密码</span>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
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
                  value={registerPasswordConfirm}
                  onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                  autoComplete="new-password"
                  placeholder="确认密码"
                  minLength={6}
                  required
                />
              </label>
              <button className="secondary" disabled={busy}>
                提交
              </button>
              {registerNotice ? <p className="notice inline" role="status">{registerNotice}</p> : null}
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
