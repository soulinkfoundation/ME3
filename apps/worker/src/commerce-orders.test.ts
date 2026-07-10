import { afterEach, describe, expect, it, vi } from "vitest";
import { completeProductCheckout, createProductCheckout } from "./commerce-orders";
import type { DbCommerceOrder, DbSite, Env } from "./types";

afterEach(() => vi.unstubAllGlobals());

const site: DbSite = {
  id: "site-1",
  user_id: "owner",
  username: "owner",
  site_type: "profile",
  template_id: null,
  custom_domain: null,
  custom_domain_status: null,
  custom_domain_cf_id: null,
  created_at: "2026-07-10T12:00:00Z",
  updated_at: "2026-07-10T12:00:00Z",
  published_at: "2026-07-10T12:00:00Z",
};

function createEnv() {
  const orders: DbCommerceOrder[] = [];
  const profile = new TextEncoder().encode(
    JSON.stringify({
      version: "0.1",
      handle: "owner",
      name: "Owner",
      products: [
        { slug: "clarity-kit", title: "Clarity Kit", price: 4900, currency: "EUR", available: true },
      ],
    }),
  );
  const DB = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...input: unknown[]) {
          values = input;
          return this;
        },
        async first<T>() {
          if (sql.includes("FROM site_files")) {
            return {
              site_id: site.id,
              path: "public/me.json",
              content: profile,
              content_type: "application/json",
              size: profile.byteLength,
              sha256: null,
              updated_at: site.updated_at,
            } as T;
          }
          if (sql.includes("FROM commerce_orders")) {
            return (orders.find(
              (order) => order.site_id === values[0] && order.checkout_session_id === values[1],
            ) || null) as T | null;
          }
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO commerce_orders")) {
            orders.push({
              id: values[0] as string,
              site_id: values[1] as string,
              page_id: values[2] as string | null,
              action_id: values[3] as string | null,
              campaign: values[4] as string | null,
              product_slug: values[5] as string,
              product_title: values[6] as string,
              buyer_name: values[7] as string,
              buyer_email: values[8] as string,
              buyer_note: values[9] as string | null,
              amount_paid: values[10] as number,
              currency: values[11] as string,
              status: "pending",
              provider: values[12] as "me3_cloud",
              checkout_session_id: null,
              payment_intent_id: null,
              paid_at: null,
              created_at: site.created_at,
              updated_at: site.updated_at,
            });
          } else if (sql.includes("checkout_session_id = ?")) {
            const order = orders.find((candidate) => candidate.id === values[1]);
            if (order) order.checkout_session_id = values[0] as string;
          } else if (sql.includes("status = 'paid'")) {
            const order = orders.find((candidate) => candidate.id === values[3]);
            if (order) {
              order.status = "paid";
              order.payment_intent_id = values[0] as string;
              order.amount_paid = values[1] as number;
              order.currency = values[2] as string;
              order.paid_at = "2026-07-10T12:02:00Z";
            }
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
  return {
    env: {
      DB,
      ME3_COMMERCE_BRIDGE_ORIGIN: "https://commerce.me3.app",
      ME3_COMMERCE_BRIDGE_TOKEN: "bridge-token",
    } as unknown as Env,
    orders,
  };
}

describe("managed commerce orders", () => {
  it("keeps the order locally while delegating payment creation and verification", async () => {
    const { env, orders } = createEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ url: "https://checkout.stripe.test/session", sessionId: "cs_managed" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const checkout = await createProductCheckout(
      env,
      site,
      "clarity-kit",
      {
        buyerName: "Buyer",
        buyerEmail: "buyer@example.com",
        pageId: "page-1",
        actionId: "primary-action",
        campaign: "launch",
        returnUrl: "https://owner.example/clarity",
      },
      "https://owner.example/api/shop/owner/clarity-kit/checkout-session",
    );
    const statusPayload = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(statusPayload).toMatchObject({
      orderId: checkout.orderId,
      siteId: site.id,
      product: { id: "clarity-kit", amount: 4900, currency: "eur" },
      attribution: { pageId: "page-1", actionId: "primary-action", campaign: "launch" },
    });
    expect(orders[0]).toMatchObject({
      id: checkout.orderId,
      status: "pending",
      provider: "me3_cloud",
      checkout_session_id: "cs_managed",
    });

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          paymentStatus: "paid",
          paymentIntentId: "pi_managed",
          amountTotal: 4900,
          currency: "eur",
          orderId: checkout.orderId,
          siteId: site.id,
        }),
        { status: 200 },
      ),
    );
    const completed = await completeProductCheckout(env, site, "cs_managed");
    expect(completed.order).toMatchObject({ status: "paid", payment_intent_id: "pi_managed" });
  });
});
