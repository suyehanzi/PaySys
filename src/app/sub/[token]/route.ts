import { getCustomerByToken, getUpstreamContent, logAccess } from "@/lib/db";
import { getCustomerStatus } from "@/lib/customer";
import { clientIp, userAgent } from "@/lib/http";
import { refreshUpstreamAutomatically } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function subscriptionContentType(content: string, fallback: string): string {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "application/json; charset=utf-8";
  }

  if (
    /^mixed-port:/m.test(trimmed) ||
    /^proxies:/m.test(trimmed) ||
    /^proxy-groups:/m.test(trimmed) ||
    /^rules:/m.test(trimmed)
  ) {
    return "application/yaml; charset=utf-8";
  }

  if (!fallback || fallback.toLowerCase().includes("text/html")) {
    return "text/plain; charset=utf-8";
  }

  return fallback;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  const customer = getCustomerByToken(token);
  if (!customer) {
    return text("订阅入口不存在", 404);
  }

  logAccess({
    customerId: customer.id,
    action: "subscription_fetch",
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  const status = getCustomerStatus(customer);
  if (status !== "active") {
    const message =
      status === "disabled"
        ? "订阅已禁用"
        : status === "unpaid"
          ? "订阅未开通，请联系管理员登记"
          : "订阅已过期，请联系管理员续费";
    return text(message, 403);
  }

  let upstream = getUpstreamContent();
  if (!upstream.content) {
    try {
      await refreshUpstreamAutomatically();
      upstream = getUpstreamContent();
    } catch {
      return text("订阅缓存为空，自动刷新失败，请联系管理员", 503);
    }
  }
  if (!upstream.content) {
    return text("订阅缓存为空，请先在个人页面刷新或联系管理员", 503);
  }

  return new Response(upstream.content, {
    status: 200,
    headers: {
      "content-type": subscriptionContentType(upstream.content, upstream.contentType),
      "cache-control": "no-store",
    },
  });
}
