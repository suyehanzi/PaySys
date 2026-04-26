import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerById, logAccess, setCustomerPortalPassword } from "@/lib/db";
import { clientIp, jsonError, userAgent } from "@/lib/http";
import { readCookie, USER_SESSION_COOKIE, verifyUserSessionValue } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const passwordSchema = z.object({
  password: z.string().trim().min(6, "密码至少 6 位").max(128, "密码太长"),
});

export async function POST(request: Request): Promise<NextResponse> {
  const session = verifyUserSessionValue(readCookie(request, USER_SESSION_COOKIE));
  if (!session) {
    return jsonError("未登录", 401);
  }

  const customer = getCustomerById(session.customerId);
  if (!customer) {
    return jsonError("账号不存在，请重新登录", 404);
  }
  if (customer.sessionVersion !== session.sessionVersion) {
    return jsonError("登录已失效，请重新输入 QQ 号", 401);
  }

  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  const updated = setCustomerPortalPassword(customer.id, parsed.data.password);
  if (!updated) {
    return jsonError("账号不存在，请重新登录", 404);
  }

  logAccess({
    customerId: customer.id,
    action: "portal_password_update",
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return NextResponse.json({
    ok: true,
    hasPortalPassword: updated.hasPortalPassword,
    passwordSetAt: updated.passwordSetAt,
  });
}
