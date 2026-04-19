import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { deleteCustomer, updateCustomer } from "@/lib/db";
import { parseDateInputToIso } from "@/lib/dates";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateCustomerSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  qq: z.string().optional(),
  groupName: z.string().optional(),
  expiresAt: z.string().optional(),
  disabled: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const { id } = await context.params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) {
    return jsonError("客户 ID 无效", 400);
  }

  const parsed = updateCustomerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("请求参数无效", 400);
  }

  try {
    const patch: {
      displayName?: string;
      qq?: string;
      groupName?: string;
      expiresAt?: string;
      disabled?: boolean;
      notes?: string;
    } = { ...parsed.data };
    if (parsed.data.expiresAt) {
      patch.expiresAt = parseDateInputToIso(parsed.data.expiresAt);
    } else {
      delete patch.expiresAt;
    }
    const customer = updateCustomer(customerId, patch);
    if (!customer) return jsonError("客户不存在", 404);
    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "更新客户失败", 400);
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
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) {
    return jsonError("客户 ID 无效", 400);
  }

  const deleted = deleteCustomer(customerId);
  if (!deleted) {
    return jsonError("客户不存在", 404);
  }

  return NextResponse.json({ ok: true });
}
