import { NextResponse } from "next/server";
import { getCustomerByToken, getUpstreamStatus, logAccess } from "@/lib/db";
import { isCustomerActive } from "@/lib/customer";
import { clientIp, jsonError, userAgent } from "@/lib/http";
import { refreshUpstreamAutomatically } from "@/lib/upstream";

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

  if (!isCustomerActive(customer)) {
    return jsonError(customer.disabled ? "订阅已禁用" : "订阅已过期", 403);
  }

  try {
    const result = await refreshUpstreamAutomatically();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "自动刷新失败，请联系管理员处理",
        status: getUpstreamStatus(),
      },
      { status: 500 },
    );
  }
}
