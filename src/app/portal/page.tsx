import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PortalLogin } from "@/components/PortalLogin";
import { getCustomerById } from "@/lib/db";
import { USER_SESSION_COOKIE, verifyUserSessionValue } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PortalLoginPage() {
  const cookieStore = await cookies();
  const session = verifyUserSessionValue(cookieStore.get(USER_SESSION_COOKIE)?.value);
  const customer = session ? getCustomerById(session.customerId) : null;
  if (session && customer && customer.sessionVersion === session.sessionVersion) {
    redirect("/portal/me");
  }

  return <PortalLogin />;
}
