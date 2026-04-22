import { getUpstreamContentForGroup } from "@/lib/db";
import { verifyInternalGroupToken } from "@/lib/internal-links";
import { refreshUpstreamForGroup } from "@/lib/upstream";

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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const groupName = url.searchParams.get("group")?.trim() || "";
  const token = url.searchParams.get("token") || "";

  if (!groupName || !token || !verifyInternalGroupToken(groupName, token)) {
    return text("内部测试链接无效", 403);
  }

  let upstream = getUpstreamContentForGroup(groupName);
  if (!upstream.content) {
    try {
      await refreshUpstreamForGroup(groupName);
      upstream = getUpstreamContentForGroup(groupName);
    } catch {
      return text("该群订阅缓存为空，自动刷新失败", 503);
    }
  }

  if (!upstream.content) {
    return text("该群订阅缓存为空", 503);
  }

  return new Response(upstream.content, {
    status: 200,
    headers: {
      "content-type": subscriptionContentType(upstream.content, upstream.contentType),
      "cache-control": "no-store",
    },
  });
}
