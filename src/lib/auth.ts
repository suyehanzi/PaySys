import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "paysys_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "admin123";
}

function sessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || `local:${adminPassword()}:${process.cwd()}`;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function hash(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

export function usesDefaultAdminPassword(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

export function verifyAdminPassword(input: string): boolean {
  return crypto.timingSafeEqual(hash(input), hash(adminPassword()));
}

export function createAdminSessionValue(now = Date.now()): string {
  const payload = String(now);
  return `${payload}.${hmac(payload)}`;
}

export function verifyAdminSessionValue(value: string | undefined): boolean {
  if (!value) return false;
  const [timestamp, signature] = value.split(".");
  if (!timestamp || !signature) return false;
  if (hmac(timestamp) !== signature) return false;

  const createdAt = Number(timestamp);
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt <= ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
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

export function isAdminRequest(request: Request): boolean {
  return verifyAdminSessionValue(readCookie(request, ADMIN_SESSION_COOKIE));
}
