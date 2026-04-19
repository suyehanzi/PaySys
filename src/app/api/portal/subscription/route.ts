import { NextResponse } from "next/server";
import { getCustomerById, logAccess } from "@/lib/db";
import { isCustomerActive } from "@/lib/customer";
import { clientIp, jsonError, userAgent } from "@/lib/http";
import { readCookie, USER_SESSION_COOKIE, verifyUserSessionValue } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  logAccess({
    customerId: customer.id,
    action: "portal_get_subscription",
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  if (!isCustomerActive(customer)) {
    return jsonError(customer.disabled ? "订阅已禁用" : "订阅已过期", 403);
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    ok: true,
    subscriptionUrl: `${origin}/sub/${customer.token}`,
  });
}
