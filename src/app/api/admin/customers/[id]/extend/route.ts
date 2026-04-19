import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { extendCustomer, getCustomerById } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { normalizePaymentInput } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const extendSchema = z.object({
  amount: z.coerce.number().min(0, "金额不能小于 0"),
  periodDays: z.coerce.number().int().min(1).max(3650),
  notes: z.string().optional().default(""),
});

export async function POST(
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

  const customer = getCustomerById(customerId);
  if (!customer) {
    return jsonError("客户不存在", 404);
  }
  if (customer.disabled) {
    return jsonError("客户已禁用，请先启用后再登记续费", 403);
  }

  const parsed = extendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  try {
    const result = extendCustomer({ customerId, ...normalizePaymentInput(parsed.data) });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "登记续费失败", 400);
  }
}
