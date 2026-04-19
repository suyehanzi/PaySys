import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export function userAgent(request: Request): string {
  return request.headers.get("user-agent") || "";
}

export function publicOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin.replace(/\/$/, "");
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    return `${forwardedProto.split(",")[0].trim()}://${forwardedHost.split(",")[0].trim()}`;
  }

  const host = request.headers.get("host");
  if (host && !host.startsWith("0.0.0.0")) {
    const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
    return `${proto.split(",")[0].trim()}://${host}`;
  }

  return new URL(request.url).origin;
}
