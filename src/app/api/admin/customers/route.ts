import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { createCustomer, listCustomers } from "@/lib/db";
import { parseDateInputToIso } from "@/lib/dates";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createCustomerSchema = z.object({
  displayName: z.string().trim().min(1, "客户昵称不能为空"),
  qq: z.string().optional().default(""),
  groupName: z.string().optional().default(""),
  expiresAt: z.string().optional(),
  notes: z.string().optional().default(""),
});

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }
  return NextResponse.json({ ok: true, customers: listCustomers() });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const parsed = createCustomerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  try {
    const customer = createCustomer({
      ...parsed.data,
      expiresAt: parsed.data.expiresAt ? parseDateInputToIso(parsed.data.expiresAt) : undefined,
    });
    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "创建客户失败", 400);
  }
}
