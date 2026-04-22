import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getUpstreamStatusForAccount } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { refreshUpstreamAccount } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const { id } = await context.params;
  const accountId = Number(id);
  if (!Number.isInteger(accountId)) {
    return jsonError("账号 ID 无效", 400);
  }

  try {
    const result = await refreshUpstreamAccount(accountId);
    return NextResponse.json(result);
  } catch (error) {
    let status = null;
    try {
      status = getUpstreamStatusForAccount(accountId);
    } catch {
      status = null;
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "刷新账号失败",
        status,
      },
      { status: status ? 500 : 404 },
    );
  }
}
