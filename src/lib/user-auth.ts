import crypto from "node:crypto";

export const USER_SESSION_COOKIE = "paysys_user_session";
export const USER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function sessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || `local:${process.cwd()}`;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function normalizeQq(input: string): string {
  return input.replace(/\D/g, "");
}

export function createUserSessionValue(customerId: number, sessionVersion: number, now = Date.now()): string {
  const payload = `${customerId}:${sessionVersion}:${now}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyUserSessionValue(value: string | undefined): { customerId: number; sessionVersion: number } | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || hmac(payload) !== signature) return null;

  const parts = payload.split(":");
  const [customerIdText, maybeVersionText, maybeTimestampText] = parts;
  const customerId = Number(customerIdText);
  const sessionVersion = parts.length >= 3 ? Number(maybeVersionText) : 1;
  const timestamp = Number(parts.length >= 3 ? maybeTimestampText : maybeVersionText);
  if (!Number.isInteger(customerId) || !Number.isInteger(sessionVersion) || !Number.isFinite(timestamp)) return null;
  if (Date.now() - timestamp > USER_SESSION_MAX_AGE_SECONDS * 1000) return null;

  return { customerId, sessionVersion };
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
