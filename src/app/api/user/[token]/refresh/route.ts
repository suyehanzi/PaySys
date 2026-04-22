import { NextResponse } from "next/server";
import { getCustomerByToken, getUpstreamStatusForGroup, logAccess } from "@/lib/db";
import { getCustomerStatus } from "@/lib/customer";
import { clientIp, jsonError, userAgent } from "@/lib/http";
import { refreshUpstreamForGroup } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;
  const customer = getCustomerByToken(token);
  if (!customer) {
    return jsonError("订阅入口不存在", 404);
  }

  logAccess({
    customerId: customer.id,
    action: "user_refresh",
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  const status = getCustomerStatus(customer);
  if (status !== "active") {
    const message =
      status === "disabled" ? "订阅已禁用" : status === "unpaid" ? "订阅未开通，请联系管理员登记" : "订阅已过期";
    return jsonError(message, 403);
  }

  try {
    const result = await refreshUpstreamForGroup(customer.groupName);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "自动刷新失败，请联系管理员处理",
        status: getUpstreamStatusForGroup(customer.groupName),
      },
      { status: 500 },
    );
  }
}
