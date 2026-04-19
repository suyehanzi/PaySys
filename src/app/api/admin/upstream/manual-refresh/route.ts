import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { refreshFromTemporaryUrl } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const manualRefreshSchema = z.object({
  temporaryUrl: z.string().url("临时订阅链接格式无效"),
});

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const parsed = manualRefreshSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  try {
    const result = await refreshFromTemporaryUrl(parsed.data.temporaryUrl);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "手动刷新失败", 500);
  }
}
