import type Stripe from "stripe";
import {
  appendQueryParams,
  getStripe,
  loadSiteProfileForCommerce,
  normalizeEmail,
  normalizeLongText,
  normalizeSameOriginReturnUrl,
  normalizeShortText,
} from "./booking";
import {
  getOwnerContact,
  sendProductPurchaseConfirmationEmail,
} from "./transactional-emails";
import type { DbCommerceOrder, DbSite, Env } from "./types";
import {
  applyPurchaseEmailTokens,
  productSendsPurchaseConfirmation,
  type ProductPurchaseConfirmationEmail,
} from "../../../shared/product-purchase-confirmation";

type ProductCheckoutBody = {
  buyerName?: unknown;
  buyerEmail?: unknown;
  buyerNote?: unknown;
  returnUrl?: unknown;
  pageId?: unknown;
  actionId?: unknown;
  campaign?: unknown;
};

type ProductRecord = {
  slug?: string;
  title?: string;
  price?: number;
  currency?: string;
  available?: boolean;
  confirmationEmail?: ProductPurchaseConfirmationEmail;
};

export class CommerceOrderInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CommerceOrderInputError";
  }
}

export async function createProductCheckout(
  env: Env,
  site: DbSite,
  productSlug: string,
  body: ProductCheckoutBody,
  requestUrl: string,
): Promise<{ url: string; sessionId: string; orderId: string }> {
  const buyerName = normalizeShortText(body.buyerName, 120);
  const buyerEmail = normalizeEmail(body.buyerEmail);
  const buyerNote = normalizeLongText(body.buyerNote, 2000);
  if (!buyerName) throw new CommerceOrderInputError("Your name is required.");
  if (!buyerEmail) throw new CommerceOrderInputError("Enter a valid email address.");
  const product = await findProduct(env, site, productSlug);
  if (!product || product.available === false) {
    throw new CommerceOrderInputError("Product is not available.", 404);
  }
  const amount = Number(product.price || 0);
  const currency = normalizeShortText(product.currency, 3).toLowerCase();
  if (!Number.isInteger(amount) || amount < 50 || !/^[a-z]{3}$/.test(currency)) {
    throw new CommerceOrderInputError("Product price is not ready for checkout.", 409);
  }
  const stripe = await getStripe(env, site.user_id);
  const managed = Boolean(
    env.ME3_COMMERCE_BRIDGE_ORIGIN && env.ME3_COMMERCE_BRIDGE_TOKEN,
  );
  if (!stripe && !managed) {
    throw new CommerceOrderInputError("Connect Stripe before using paid product actions.", 503);
  }
  const provider = stripe ? "stripe_direct" : "me3_cloud";
  const orderId = crypto.randomUUID();
  const pageId = normalizeShortText(body.pageId, 100) || null;
  const actionId = normalizeShortText(body.actionId, 100) || null;
  const campaign = normalizeShortText(body.campaign, 160) || null;
  await env.DB.prepare(
    `INSERT INTO commerce_orders
     (id, site_id, page_id, action_id, campaign, product_slug, product_title,
      buyer_name, buyer_email, buyer_note, amount_paid, currency, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      orderId,
      site.id,
      pageId,
      actionId,
      campaign,
      product.slug,
      product.title || product.slug,
      buyerName,
      buyerEmail,
      buyerNote || null,
      amount,
      currency,
      provider,
    )
    .run();

  const returnUrl = normalizeSameOriginReturnUrl(
    body.returnUrl,
    new URL(requestUrl).origin,
  );
  try {
    const checkout = stripe
      ? await createDirectCheckout(stripe, {
          orderId,
          site,
          product,
          amount,
          currency,
          buyerName,
          buyerEmail,
          buyerNote,
          pageId,
          actionId,
          campaign,
          returnUrl,
        })
      : await createManagedCheckout(env, {
          orderId,
          site,
          product,
          amount,
          currency,
          buyerName,
          buyerEmail,
          buyerNote,
          pageId,
          actionId,
          campaign,
          returnUrl,
        });
    await env.DB.prepare(
      `UPDATE commerce_orders
       SET checkout_session_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(checkout.sessionId, orderId)
      .run();
    return { ...checkout, orderId };
  } catch (error) {
    await env.DB.prepare(
      `UPDATE commerce_orders SET status = 'failed', updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(orderId)
      .run();
    throw error;
  }
}

export async function completeProductCheckout(
  env: Env,
  site: DbSite,
  sessionId: string,
): Promise<{ ok: true; order: DbCommerceOrder; alreadyCompleted?: true }> {
  const order = await getOrderBySession(env, site.id, sessionId);
  if (!order) throw new CommerceOrderInputError("Checkout session not found.", 404);
  if (order.status === "paid") return { ok: true, order, alreadyCompleted: true };
  if (order.provider === "me3_cloud") {
    const session = await retrieveManagedCheckout(env, sessionId);
    return finalizeProductOrder(env, site, order, {
      paid: session.paymentStatus === "paid",
      paymentIntentId: session.paymentIntentId || null,
      amount: session.amountTotal ?? null,
      currency: session.currency || null,
      orderId: session.orderId,
      siteId: session.siteId,
    });
  }
  const stripe = await getStripe(env, site.user_id);
  if (!stripe) throw new CommerceOrderInputError("Stripe is not configured.", 503);
  return finalizeStripeProductCheckout(
    env,
    site,
    await stripe.checkout.sessions.retrieve(sessionId),
  );
}

export async function finalizeStripeProductCheckout(
  env: Env,
  site: DbSite,
  session: Stripe.Checkout.Session,
): Promise<{ ok: true; order: DbCommerceOrder; alreadyCompleted?: true }> {
  const order = await getOrderBySession(env, site.id, session.id);
  if (!order) throw new CommerceOrderInputError("Checkout order not found.", 404);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  return finalizeProductOrder(env, site, order, {
    paid: session.payment_status === "paid",
    paymentIntentId,
    amount: session.amount_total,
    currency: session.currency,
    orderId: session.metadata?.order_id,
    siteId: session.metadata?.site_id,
  });
}

async function finalizeProductOrder(
  env: Env,
  site: DbSite,
  order: DbCommerceOrder,
  payment: {
    paid: boolean;
    paymentIntentId: string | null;
    amount: number | null;
    currency: string | null;
    orderId?: string | null;
    siteId?: string | null;
  },
) {
  if (!payment.paid) throw new CommerceOrderInputError("Payment has not completed.");
  if (payment.orderId !== order.id || payment.siteId !== site.id) {
    throw new CommerceOrderInputError("Checkout does not match this order.", 409);
  }
  if (order.status === "paid") return { ok: true as const, order, alreadyCompleted: true as const };
  await env.DB.prepare(
    `UPDATE commerce_orders
     SET status = 'paid', payment_intent_id = ?, amount_paid = ?, currency = ?,
         paid_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND site_id = ? AND status = 'pending'`,
  )
    .bind(
      payment.paymentIntentId,
      payment.amount,
      payment.currency,
      order.id,
      site.id,
    )
    .run();
  const updated = await getOrderBySession(env, site.id, order.checkout_session_id || "");
  if (!updated) throw new Error("Paid order could not be loaded");
  await sendProductConfirmation(env, site, updated);
  return { ok: true as const, order: updated };
}

async function findProduct(
  env: Env,
  site: DbSite,
  productSlug: string,
): Promise<ProductRecord | null> {
  const profile = await loadSiteProfileForCommerce(env, site);
  return (
    ((profile?.products || []) as ProductRecord[]).find(
      (product) => product.slug === productSlug,
    ) || null
  );
}

async function getOrderBySession(
  env: Env,
  siteId: string,
  sessionId: string,
): Promise<DbCommerceOrder | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, site_id, page_id, action_id, campaign, product_slug, product_title,
              buyer_name, buyer_email, buyer_note, amount_paid, currency, status,
              provider, checkout_session_id, payment_intent_id, paid_at, created_at, updated_at
       FROM commerce_orders WHERE site_id = ? AND checkout_session_id = ?`,
    )
      .bind(siteId, sessionId)
      .first<DbCommerceOrder>()) || null
  );
}

type CheckoutInput = {
  orderId: string;
  site: DbSite;
  product: ProductRecord;
  amount: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  buyerNote: string;
  pageId: string | null;
  actionId: string | null;
  campaign: string | null;
  returnUrl: string;
};

async function createDirectCheckout(
  stripe: Stripe,
  input: CheckoutInput,
): Promise<{ url: string; sessionId: string }> {
  const successUrl = appendQueryParams(input.returnUrl, {
    purchase: "success",
    session_id: "{CHECKOUT_SESSION_ID}",
  });
  const cancelUrl = appendQueryParams(input.returnUrl, { purchase: "cancelled" });
  const metadata = {
    purchase_kind: "product",
    order_id: input.orderId,
    site_id: input.site.id,
    product_slug: input.product.slug || "",
    page_id: input.pageId || "",
    action_id: input.actionId || "",
    campaign: input.campaign || "",
  };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.buyerEmail,
    line_items: [
      {
        price_data: {
          currency: input.currency,
          product_data: { name: input.product.title || input.product.slug || "ME3 offer" },
          unit_amount: input.amount,
        },
        quantity: 1,
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) throw new Error("Stripe checkout URL missing");
  return { url: session.url, sessionId: session.id };
}

async function createManagedCheckout(
  env: Env,
  input: CheckoutInput,
): Promise<{ url: string; sessionId: string }> {
  const response = await fetch(
    `${env.ME3_COMMERCE_BRIDGE_ORIGIN!.replace(/\/+$/, "")}/v1/commerce/checkout-sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ME3_COMMERCE_BRIDGE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderId: input.orderId,
        referenceId: input.orderId,
        kind: "product",
        siteId: input.site.id,
        ownerId: input.site.user_id,
        product: {
          id: input.product.slug,
          name: input.product.title,
          amount: input.amount,
          currency: input.currency,
        },
        customer: {
          name: input.buyerName,
          email: input.buyerEmail,
          note: input.buyerNote || undefined,
        },
        attribution: {
          pageId: input.pageId,
          actionId: input.actionId,
          campaign: input.campaign,
        },
        returnUrl: input.returnUrl,
      }),
    },
  );
  const data = (await response.json()) as {
    url?: string;
    sessionId?: string;
    error?: string;
  };
  if (!response.ok || !data.url || !data.sessionId) {
    throw new CommerceOrderInputError(data.error || "Managed checkout is unavailable.", 502);
  }
  return { url: data.url, sessionId: data.sessionId };
}

async function retrieveManagedCheckout(env: Env, sessionId: string) {
  if (!env.ME3_COMMERCE_BRIDGE_ORIGIN || !env.ME3_COMMERCE_BRIDGE_TOKEN) {
    throw new CommerceOrderInputError("Managed commerce bridge is not configured.", 503);
  }
  const response = await fetch(
    `${env.ME3_COMMERCE_BRIDGE_ORIGIN.replace(/\/+$/, "")}/v1/commerce/checkout-sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${env.ME3_COMMERCE_BRIDGE_TOKEN}` } },
  );
  const data = (await response.json()) as {
    paymentStatus?: string;
    paymentIntentId?: string | null;
    amountTotal?: number | null;
    currency?: string | null;
    orderId?: string | null;
    siteId?: string | null;
    error?: string;
  };
  if (!response.ok) {
    throw new CommerceOrderInputError(data.error || "Managed checkout could not be verified.", 502);
  }
  return data;
}

async function sendProductConfirmation(
  env: Env,
  site: DbSite,
  order: DbCommerceOrder,
): Promise<void> {
  const product = await findProduct(env, site, order.product_slug);
  if (!productSendsPurchaseConfirmation(product?.confirmationEmail)) return;
  const owner = await getOwnerContact(env, site.user_id);
  if (!owner.email) return;
  const tokens = {
    buyerName: order.buyer_name,
    buyerNote: order.buyer_note || "",
    productTitle: order.product_title,
    siteName: site.username,
    supportEmail: owner.email,
  };
  await sendProductPurchaseConfirmationEmail(env, {
    ownerId: site.user_id,
    hostName: owner.name || site.username,
    hostEmail: owner.email,
    buyerName: order.buyer_name,
    buyerEmail: order.buyer_email,
    productTitle: order.product_title,
    subject: applyPurchaseEmailTokens(product.confirmationEmail.subject, tokens),
    messageText: applyPurchaseEmailTokens(product.confirmationEmail.message, tokens),
  });
}
