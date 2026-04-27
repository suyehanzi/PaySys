import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getUpstreamStatusForGroup, listUpstreamAccounts } from "@/lib/db";
import { jsonError, publicOrigin } from "@/lib/http";
import { createInternalGroupToken } from "@/lib/internal-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultGroups = ["1群", "2群"];

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAdminRequest(request)) {
    return jsonError("未登录", 401);
  }

  const accounts = listUpstreamAccounts();
  const names = new Set(defaultGroups);
  for (const account of accounts) {
    if (account.groupName) names.add(account.groupName);
  }

  const origin = publicOrigin(request);
  const groups = Array.from(names).map((groupName) => {
    const account = accounts.find((item) => item.groupName === groupName);
    const token = createInternalGroupToken(groupName);
    const subscriptionPath = `/internal-sub?group=${encodeURIComponent(groupName)}&token=${encodeURIComponent(token)}`;
    const status = getUpstreamStatusForGroup(groupName);
    return {
      groupName,
      subscriptionPath,
      subscriptionUrl: `${origin}${subscriptionPath}`,
      bound: Boolean(account),
      enabled: account?.enabled ?? true,
      ...status,
    };
  });

  return NextResponse.json({ ok: true, groups });
}
