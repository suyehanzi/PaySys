import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { createUpstreamAccount, listUpstreamAccounts } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createAccountSchema = z.object({
  groupName: z.string().trim().min(1, "群名不能为空"),
  label: z.string().optional().default(""),
  email: z.string().trim().min(1, "账号不能为空"),
  password: z.string().trim().min(1, "密码不能为空"),
  enabled: z.boolean().optional().default(true),
});

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }
  return NextResponse.json({ ok: true, upstreamAccounts: listUpstreamAccounts() });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const parsed = createAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  try {
    const account = createUpstreamAccount(parsed.data);
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建账号失败";
    return jsonError(message.includes("UNIQUE") ? "该群名已绑定账号" : message, 400);
  }
}
