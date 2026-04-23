import { NextResponse } from "next/server";
import { notifyRegistrationRequest } from "@/lib/bark";
import { z } from "zod";
import { createRegistrationRequest } from "@/lib/db";
import { jsonError, publicOrigin } from "@/lib/http";
import { normalizeQq } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registerSchema = z.object({
  displayName: z.string().trim().min(1, "请输入昵称").max(40, "昵称太长了"),
  qq: z.string().min(4, "请输入 QQ 号"),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "请求参数无效", 400);
  }

  const qq = normalizeQq(parsed.data.qq);
  if (!qq) {
    return jsonError("请输入 QQ 号", 400);
  }

  try {
    const registrationRequest = createRegistrationRequest({
      displayName: parsed.data.displayName,
      qq,
    });
    const origin = publicOrigin(request);
    await notifyRegistrationRequest({
      displayName: registrationRequest.displayName,
      qq: registrationRequest.qq,
      portalUrl: `${origin}/portal`,
      adminUrl: `${origin}/admin`,
    });
    return NextResponse.json({ ok: true, request: registrationRequest });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "提交申请失败", 400);
  }
}
