import { NextResponse } from "next/server";
import { isAdminRequest, usesDefaultAdminPassword } from "@/lib/auth";
import {
  getUpstreamStatus,
  listAccessLogs,
  listCustomers,
  listRecentPayments,
  listRegistrationRequests,
  listUpstreamAccounts,
} from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  return NextResponse.json({
    ok: true,
    customers: listCustomers(),
    payments: listRecentPayments(20),
    registrationRequests: listRegistrationRequests(100),
    accessLogs: listAccessLogs(120),
    upstream: getUpstreamStatus(),
    upstreamAccounts: listUpstreamAccounts(),
    admin: {
      usingDefaultPassword: usesDefaultAdminPassword(),
    },
  });
}
