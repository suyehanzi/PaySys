import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { approveRegistrationRequest } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const approveSchema = z.object({
  groupName: z.string().trim().min(1, "请选择群名"),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const { id } = await context.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) {
    return jsonError("申请 ID 无效", 400);
  }

  const parsed = approveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  try {
    const result = approveRegistrationRequest(requestId, parsed.data.groupName);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "处理申请失败", 400);
  }
}
