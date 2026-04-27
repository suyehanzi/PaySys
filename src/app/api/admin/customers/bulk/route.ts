import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { listCustomers, setCustomersGroup, setCustomersVip } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bulkCustomerSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "请选择客户").max(200, "一次最多处理 200 个客户"),
  isVip: z.boolean().optional(),
  groupName: z.string().trim().min(1, "群名不能为空").optional(),
}).refine(
  (data) => data.isVip !== undefined || data.groupName !== undefined,
  "请选择要批量处理的内容",
).refine(
  (data) => !(data.isVip !== undefined && data.groupName !== undefined),
  "一次只能执行一种批量操作",
);

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const parsed = bulkCustomerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  try {
    const updated = parsed.data.groupName
      ? setCustomersGroup(parsed.data.ids, parsed.data.groupName)
      : setCustomersVip(parsed.data.ids, parsed.data.isVip!);
    return NextResponse.json({ ok: true, updated, customers: listCustomers() });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "批量处理失败", 400);
  }
}
