import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerByQq, logAccess, verifyCustomerPortalPassword } from "@/lib/db";
import { jsonError } from "@/lib/http";
import {
  createUserSessionValue,
  normalizeQq,
  USER_SESSION_COOKIE,
  USER_SESSION_MAX_AGE_SECONDS,
} from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  qq: z.string().min(4, "请输入 QQ 号"),
  password: z.string().max(128, "密码太长").optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  const qq = normalizeQq(parsed.data.qq);
  if (!qq) {
    return jsonError("请输入 QQ 号", 400);
  }

  const customer = getCustomerByQq(qq);
  if (!customer) {
    return jsonError("没有找到这个 QQ 对应的订阅，请联系管理员", 404);
  }
  if (customer.hasPortalPassword) {
    const password = parsed.data.password?.trim() || "";
    if (!password) {
      return jsonError("请输入密码", 401);
    }
    if (!verifyCustomerPortalPassword(customer.id, password)) {
      return jsonError("密码不正确", 401);
    }
  }

  logAccess({
    customerId: customer.id,
    action: "portal_login",
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
    userAgent: request.headers.get("user-agent") || "",
  });

  const response = NextResponse.json({ ok: true, hasPortalPassword: customer.hasPortalPassword });
  response.cookies.set(USER_SESSION_COOKIE, createUserSessionValue(customer.id, customer.sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: USER_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
