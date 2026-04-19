import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { refreshUpstreamAutomatically } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  try {
    const result = await refreshUpstreamAutomatically();
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "自动刷新失败", 500);
  }
}
