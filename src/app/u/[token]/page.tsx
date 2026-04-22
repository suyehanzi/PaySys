import { UserPortal } from "@/components/UserPortal";
import { getCustomerByToken, getUpstreamStatus } from "@/lib/db";
import { getCustomerStatus } from "@/lib/customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function UserPage(context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const customer = getCustomerByToken(token);
  const upstream = getUpstreamStatus();

  if (!customer) {
    return (
      <main className="shell shell-narrow">
        <section className="empty-state">
          <p className="eyebrow">订阅入口</p>
          <h1>入口不存在</h1>
          <p>请重新获取订阅入口。</p>
        </section>
      </main>
    );
  }

  return <UserPortal customer={customer} status={getCustomerStatus(customer)} upstream={upstream} />;
}
