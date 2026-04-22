import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { listCustomers, setCustomersVip } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bulkCustomerSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "请选择客户").max(200, "一次最多处理 200 个客户"),
  isVip: z.boolean(),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const parsed = bulkCustomerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  const updated = setCustomersVip(parsed.data.ids, parsed.data.isVip);
  return NextResponse.json({ ok: true, updated, customers: listCustomers() });
}
