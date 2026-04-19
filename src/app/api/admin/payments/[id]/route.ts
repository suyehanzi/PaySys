import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { deletePayment } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const { id } = await context.params;
  const paymentId = Number(id);
  if (!Number.isInteger(paymentId)) {
    return jsonError("付款记录 ID 无效", 400);
  }

  const result = deletePayment(paymentId);
  if (!result.deleted) {
    return jsonError("付款记录不存在", 404);
  }

  return NextResponse.json({ ok: true, rolledBack: result.rolledBack });
}
