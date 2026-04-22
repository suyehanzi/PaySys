import { NextResponse } from "next/server";
import { getCustomerById, getUpstreamStatusForGroup, logAccess } from "@/lib/db";
import { getCustomerStatus } from "@/lib/customer";
import { clientIp, jsonError, publicOrigin, userAgent } from "@/lib/http";
import { readCookie, USER_SESSION_COOKIE, verifyUserSessionValue } from "@/lib/user-auth";
import { refreshUpstreamForGroup } from "@/lib/upstream";

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

  const status = getCustomerStatus(customer);
  if (status !== "active") {
    const message =
      status === "disabled" ? "订阅已禁用" : status === "unpaid" ? "订阅未开通，请联系管理员登记" : "订阅已过期";
    return jsonError(message, 403);
  }

  if (!getUpstreamStatusForGroup(customer.groupName).hasContent) {
    try {
      await refreshUpstreamForGroup(customer.groupName);
    } catch {
      return jsonError("订阅缓存为空，自动刷新失败，请联系管理员", 503);
    }
  }

  const origin = publicOrigin(request);
  const subscriptionPath = `/sub/${customer.token}`;
  return NextResponse.json({
    ok: true,
    subscriptionPath,
    subscriptionUrl: `${origin}${subscriptionPath}`,
  });
}
