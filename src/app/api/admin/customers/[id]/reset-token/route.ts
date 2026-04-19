import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getCustomerById, resetCustomerData } from "@/lib/db";
import { jsonError } from "@/lib/http";

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
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) {
    return jsonError("客户 ID 无效", 400);
  }

  const current = getCustomerById(customerId);
  if (!current) {
    return jsonError("客户不存在", 404);
  }
  if (current.disabled) {
    return jsonError("客户已禁用，请先启用后再重置", 403);
  }

  const customer = resetCustomerData(customerId);
  if (!customer) {
    return jsonError("客户不存在", 404);
  }

  return NextResponse.json({ ok: true, customer });
}
