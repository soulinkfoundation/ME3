---
title: Managed commerce bridge contract
status: implementation-contract
updated: 2026-07-10
tracking: me3-0lx.13
---

# Managed commerce bridge contract

ME3 installations remain the source of truth for offers, booking holds, orders,
conversion attribution, and customer-facing confirmation. Managed ME3 commerce
only creates and verifies provider checkout sessions. It does not receive an
owner's raw Stripe secret key.

Self-hosted installations continue to use the existing direct Stripe path. A
managed installation enables the bridge with two Worker secrets:

- `ME3_COMMERCE_BRIDGE_ORIGIN`: the HTTPS origin of the ME3 Cloud commerce API.
- `ME3_COMMERCE_BRIDGE_TOKEN`: an installation-scoped bearer credential.

Do not commit either value. Provision and rotate them through the deployment
secret store.

## Checkout API

`POST /v1/commerce/checkout-sessions` accepts:

```json
{
  "referenceId": "owner-installation record id",
  "kind": "product or booking",
  "siteId": "site id",
  "ownerId": "owner id",
  "product": {
    "id": "offer id or slug",
    "name": "customer-facing title",
    "amount": 5000,
    "currency": "eur"
  },
  "customer": {
    "name": "Customer name",
    "email": "customer@example.com"
  },
  "attribution": {
    "pageId": "optional page id",
    "actionId": "optional action id",
    "campaign": "optional campaign"
  },
  "metadata": {},
  "returnUrl": "https://the-installation.example/me/offer"
}
```

Product checkouts also send `orderId`, equal to `referenceId`. Booking
checkouts send their signed booking hold fields in `metadata`. The bridge must:

- authenticate and authorize the installation token for the supplied owner;
- reject non-HTTPS or unapproved return URLs according to managed policy;
- use the installation-provided amount and currency only after applying server
  policy and connected-account ownership checks;
- create a one-time checkout session and preserve `kind`, `referenceId`,
  `siteId`, and the supplied metadata;
- return `{ "url": "https://...", "sessionId": "..." }`;
- treat repeated requests for the same installation, kind, and reference as
  idempotent.

`GET /v1/commerce/checkout-sessions/:sessionId` returns the bridge's verified
provider state:

```json
{
  "paymentStatus": "paid",
  "paymentIntentId": "provider payment id",
  "amountTotal": 5000,
  "currency": "eur",
  "orderId": "product order id when kind is product",
  "siteId": "site id",
  "metadata": {}
}
```

The installation verifies the returned identifiers and final amount before it
marks a product order paid or confirms a paid booking. Completion is
idempotent. ME3 Cloud should also consume Stripe webhooks so session retrieval
does not rely on an unverified browser redirect, but the owner installation is
still responsible for its local final state.

## Recommended Stripe model

Use Stripe Connect Express accounts with destination charges. The ME3 platform
creates checkout sessions, transfers funds to the connected account, and can
add an application fee later without changing the installation contract. Start
with a zero application fee while refund, dispute, tax, and support ownership is
being validated.

The managed service still needs explicit product decisions for:

1. who is the merchant of record and who owns refunds, disputes, and support;
2. whether ME3 takes an application fee and how it is presented;
3. which countries, currencies, and payment methods are supported at launch;
4. the connected-account onboarding and account-readiness UX;
5. the bridge origin, token issuance, rotation, rate limits, and audit retention.

Until those decisions are made, landing pages can publish link, signup, and free
booking actions. Paid actions fail closed unless direct Stripe or the managed
bridge is configured.
