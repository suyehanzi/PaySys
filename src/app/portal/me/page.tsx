import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PortalAccount } from "@/components/PortalAccount";
import { getCustomerById } from "@/lib/db";
import { getCustomerStatus } from "@/lib/customer";
import { USER_SESSION_COOKIE, verifyUserSessionValue } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PortalAccountPage() {
  const cookieStore = await cookies();
  const session = verifyUserSessionValue(cookieStore.get(USER_SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/portal");
  }

  const customer = getCustomerById(session.customerId);
  if (!customer) {
    redirect("/portal");
  }
  if (customer.sessionVersion !== session.sessionVersion) {
    redirect("/portal");
  }

  return <PortalAccount customer={customer} status={getCustomerStatus(customer)} />;
}
