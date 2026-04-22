import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { deleteUpstreamAccount, updateUpstreamAccount } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateAccountSchema = z.object({
  groupName: z.string().trim().min(1).optional(),
  label: z.string().optional(),
  email: z.string().trim().min(1).optional(),
  password: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
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

  const parsed = updateAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("请求参数无效", 400);
  }

  try {
    const account = updateUpstreamAccount(accountId, parsed.data);
    if (!account) return jsonError("上游账号不存在", 404);
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新账号失败";
    return jsonError(message.includes("UNIQUE") ? "该群名已绑定账号" : message, 400);
  }
}

export async function DELETE(
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

  const deleted = deleteUpstreamAccount(accountId);
  if (!deleted) {
    return jsonError("上游账号不存在", 404);
  }

  return NextResponse.json({ ok: true });
}
