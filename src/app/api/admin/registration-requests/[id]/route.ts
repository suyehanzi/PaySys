import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { rejectRegistrationRequest } from "@/lib/db";
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
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) {
    return jsonError("申请 ID 无效", 400);
  }

  const registrationRequest = rejectRegistrationRequest(requestId);
  if (!registrationRequest) {
    return jsonError("申请不存在", 404);
  }

  return NextResponse.json({ ok: true, request: registrationRequest });
}
