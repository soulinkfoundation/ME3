import Stripe from "stripe";
import { resolveTimeZone } from "../calendar";
import { scheduleBookingRemindersForBooking } from "../booking-reminders";
import {
  appendQueryParams,
  confirmBookingHold,
  createBookingHold,
  createConfirmedFreeOneToOneBooking,
  findActiveBookingHoldByToken,
  findActiveBookingHoldOverlap,
  findConfirmedBookingOverlap,
  generateAvailableBookingSlots,
  getSiteByUsername,
  getStripe,
  loadSiteProfileForCommerce,
  normalizeBookingAmount,
  normalizeEmail,
  normalizeLongText,
  normalizeSameOriginReturnUrl,
  normalizeShortText,
  releaseBookingHold,
  resolveBookingSlot,
  resolveOneToOneBookingOffer,
  resolvePaidOneToOneOffer,
  resolvePublicBookingSlot,
  resolvePublicOneToOneBookingOffer,
  serializeBooking,
  serializePublicBookingOffer,
  validateBookingAvailability,
  type CoreBookIntent,
  type FreeBookingBody,
  type PaidBookingCheckoutBody,
  type PaidBookingCompletionBody,
  type PublicBookingConfirmBody,
} from "../booking";
import type { AppHono } from "../http/types";
import {
  bookingDetailsFromBooking,
  getOwnerContact,
  sendBookingConfirmationEmails,
} from "../transactional-emails";
import type { DbBooking, DbSite, Env } from "../types";

export function registerBookingRoutes(app: AppHono) {
  app.get("/api/book/:username/slots", async (c) => {
    const site = await getSiteByUsername(c.env, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const localDate = normalizeShortText(c.req.query("date"), 20);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      return c.json({ error: "date is required in YYYY-MM-DD format" }, 400);
    }

    const profile = await loadSiteProfileForCommerce(c.env, site);
    const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
    if (!bookIntent?.enabled) return c.json({ error: "Booking is not enabled for this site" }, 404);

    const resolved = resolvePublicOneToOneBookingOffer(
      bookIntent,
      normalizeShortText(c.req.query("offerId"), 100),
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, resolved.status);

    const timezone = resolveTimeZone(resolved.offer.availability.timezone);
    const slots = await generateAvailableBookingSlots(c.env, {
      siteId: site.id,
      offer: resolved.offer,
      localDate,
      timezone,
    });

    return c.json({
      ok: true,
      date: localDate,
      timezone,
      offer: serializePublicBookingOffer(resolved.offer),
      slots,
    });
  });

  app.post("/api/book/:username/confirm", async (c) => {
    const username = c.req.param("username");
    const site = await getSiteByUsername(c.env, username);
    if (!site) return c.json({ error: "Site not found" }, 404);

    const body = await c.req.json<PublicBookingConfirmBody>().catch(() => null);
    if (!body) return c.json({ error: "Invalid request body" }, 400);

    const guestName = normalizeShortText(body.guestName, 120);
    const guestEmail = normalizeEmail(body.guestEmail);
    const notes = normalizeLongText(body.notes, 2000);
    const slotStart = normalizeShortText(body.slotStart, 80);
    const slotEnd = normalizeShortText(body.slotEnd, 80);

    if (!slotStart || !slotEnd || !guestName) {
      return c.json({ error: "slotStart, slotEnd, and guestName are required" }, 400);
    }
    if (!guestEmail) {
      return c.json({ error: "Enter a valid email address" }, 400);
    }

    const profile = await loadSiteProfileForCommerce(c.env, site);
    const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
    if (!bookIntent?.enabled) return c.json({ error: "Booking is not enabled for this site" }, 404);

    const resolved = resolvePublicOneToOneBookingOffer(
      bookIntent,
      normalizeShortText(body.offerId, 100),
    );
    if ("error" in resolved) return c.json({ error: resolved.error }, resolved.status);

    const offer = resolved.offer;
    if (offer.pricing?.enabled) {
      return c.json(
        {
          error: "Use checkout for paid booking offers",
          action: "createBookingCheckout",
          checkoutUrl: `/api/book/${encodeURIComponent(username)}/checkout-session`,
        },
        402,
      );
    }

    const timezone = resolveTimeZone(offer.availability.timezone);
    const slot = resolvePublicBookingSlot({
      slotStart,
      slotEnd,
      durationMinutes: offer.duration,
      timezone,
    });
    if ("error" in slot) return c.json({ error: slot.error }, 400);
    if (slot.startsAtMs <= Date.now() + 5 * 60_000) {
      return c.json({ error: "Choose a future booking time" }, 400);
    }

    const availabilityError = validateBookingAvailability(
      offer.availability,
      slot.localDate,
      slot.localTime,
      offer.duration,
    );
    if (availabilityError) return c.json({ error: availabilityError }, 400);

    const overlap = await findConfirmedBookingOverlap(c.env, {
      siteId: site.id,
      offerId: offer.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
    if (overlap) return c.json({ error: "That time has already been booked" }, 409);

    const activeHold = await findActiveBookingHoldOverlap(c.env, {
      siteId: site.id,
      offerId: offer.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
    if (activeHold) {
      return c.json({ error: "That time is being held for another checkout. Try another slot or check back shortly." }, 409);
    }

    const booking = await createConfirmedFreeOneToOneBooking(c.env, {
      site,
      bookIntent,
      offer,
      guestName,
      guestEmail,
      notes,
      slot,
    });

    if (booking) {
      await sendConfirmationEmailsForBooking(c.env, {
        site,
        profile,
        booking,
        bookingTitle: offer.title,
        timezone,
      });
    }

    return c.json({ ok: true, booking: booking ? serializeBooking(booking) : null });
  });

  app.post("/api/book/:username/free", async (c) => {
    const site = await getSiteByUsername(c.env, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const body = await c.req.json<FreeBookingBody>().catch(() => null);
    if (!body) return c.json({ error: "Invalid request body" }, 400);

    const guestName = normalizeShortText(body.guestName, 120);
    const guestEmail = normalizeEmail(body.guestEmail);
    const notes = normalizeLongText(body.notes, 2000);
    const localDate = normalizeShortText(body.localDate, 20);
    const localTime = normalizeShortText(body.localTime, 20);

    if (!guestName || !localDate || !localTime) {
      return c.json({ error: "Name, date, and time are required" }, 400);
    }
    if (!guestEmail) {
      return c.json({ error: "Enter a valid email address" }, 400);
    }

    const profile = await loadSiteProfileForCommerce(c.env, site);
    const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
    if (!bookIntent?.enabled) return c.json({ error: "Booking is not enabled for this site" }, 404);

    const offer = resolveOneToOneBookingOffer(bookIntent, normalizeShortText(body.offerId, 100));
    if (!offer) return c.json({ error: "Booking offer not found" }, 404);
    if (offer.pricing?.enabled) {
      return c.json({ error: "Use checkout for paid booking offers" }, 400);
    }

    const slot = resolveBookingSlot({
      localDate,
      localTime,
      durationMinutes: offer.duration,
      timezone: resolveTimeZone(offer.availability.timezone),
    });
    if (!slot) return c.json({ error: "Invalid booking date or time" }, 400);
    if (slot.startsAtMs <= Date.now() + 5 * 60_000) {
      return c.json({ error: "Choose a future booking time" }, 400);
    }

    const availabilityError = validateBookingAvailability(
      offer.availability,
      localDate,
      localTime,
      offer.duration,
    );
    if (availabilityError) return c.json({ error: availabilityError }, 400);

    const overlap = await findConfirmedBookingOverlap(c.env, {
      siteId: site.id,
      offerId: offer.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
    if (overlap) return c.json({ error: "That time has already been booked" }, 409);

    const activeHold = await findActiveBookingHoldOverlap(c.env, {
      siteId: site.id,
      offerId: offer.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
    if (activeHold) {
      return c.json({ error: "That time is being held for another checkout. Try another slot or check back shortly." }, 409);
    }

    const bookingId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO bookings
       (id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
        duration_minutes, status, notes, created_at, payment_intent_id, amount_paid,
        suggested_amount, currency, payment_status, is_free_booking, paid_at)
       VALUES (?, ?, ?, 'one_to_one', ?, ?, ?, ?, ?, 'confirmed', ?, datetime('now'),
               NULL, NULL, NULL, NULL, 'not_required', 1, NULL)`,
    )
      .bind(
        bookingId,
        site.id,
        offer.id,
        guestName,
        guestEmail,
        slot.startsAt,
        slot.endsAt,
        offer.duration,
        notes || null,
      )
      .run();

    const booking = await c.env.DB.prepare(
      `SELECT id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
              duration_minutes, calendar_event_id, status, notes, created_at, cancelled_at,
              payment_intent_id, amount_paid, suggested_amount, currency, payment_status,
              is_free_booking, paid_at
       FROM bookings
       WHERE id = ?`,
    )
      .bind(bookingId)
      .first<DbBooking>();

    if (booking) {
      scheduleBookingRemindersForBooking(c.env, {
        booking,
        bookingTitle: offer.title,
        timezone: resolveTimeZone(offer.availability.timezone),
        reminders: bookIntent.reminders,
      }).catch((error) => {
        console.error("Failed to schedule booking reminders:", error);
      });
      await sendConfirmationEmailsForBooking(c.env, {
        site,
        profile,
        booking,
        bookingTitle: offer.title,
        timezone: resolveTimeZone(offer.availability.timezone),
      });
    }

    return c.json({ ok: true, booking: booking ? serializeBooking(booking) : { id: bookingId } });
  });

  app.post("/api/book/:username/checkout-session", async (c) => {
    const site = await getSiteByUsername(c.env, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const stripe = await getStripe(c.env, site.user_id);
    if (!stripe) return c.json({ error: "Stripe is not configured for this ME3 Core install" }, 503);

    const body = await c.req.json<PaidBookingCheckoutBody>().catch(() => null);
    if (!body) return c.json({ error: "Invalid request body" }, 400);

    const guestName = normalizeShortText(body.guestName, 120);
    const guestEmail = normalizeEmail(body.guestEmail);
    const notes = normalizeLongText(body.notes, 2000);
    const localDate = normalizeShortText(body.localDate, 20);
    const localTime = normalizeShortText(body.localTime, 20);

    if (!guestName || !localDate || !localTime) {
      return c.json({ error: "Name, date, and time are required" }, 400);
    }
    if (!guestEmail) {
      return c.json({ error: "Enter a valid email address" }, 400);
    }

    const profile = await loadSiteProfileForCommerce(c.env, site);
    const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
    if (!bookIntent?.enabled) return c.json({ error: "Booking is not enabled for this site" }, 404);

    const offer = resolvePaidOneToOneOffer(bookIntent, normalizeShortText(body.offerId, 100));
    if (!offer) return c.json({ error: "Paid booking offer not found" }, 404);

    const pricing = offer.pricing;
    const amount = normalizeBookingAmount(body.amount, pricing);
    if (!amount.ok) return c.json({ error: amount.error }, 400);

    const slot = resolveBookingSlot({
      localDate,
      localTime,
      durationMinutes: offer.duration,
      timezone: resolveTimeZone(offer.availability.timezone),
    });
    if (!slot) return c.json({ error: "Invalid booking date or time" }, 400);
    if (slot.startsAtMs <= Date.now() + 5 * 60_000) {
      return c.json({ error: "Choose a future booking time" }, 400);
    }

    const availabilityError = validateBookingAvailability(
      offer.availability,
      localDate,
      localTime,
      offer.duration,
    );
    if (availabilityError) return c.json({ error: availabilityError }, 400);

    const overlap = await findConfirmedBookingOverlap(c.env, {
      siteId: site.id,
      offerId: offer.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
    if (overlap) return c.json({ error: "That time has already been booked" }, 409);

    const activeHold = await findActiveBookingHoldOverlap(c.env, {
      siteId: site.id,
      offerId: offer.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
    if (activeHold) {
      return c.json({ error: "That time is being held for another checkout. Try another slot or check back shortly." }, 409);
    }

    const holdToken = crypto.randomUUID();
    const holdExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    await createBookingHold(c.env, {
      siteId: site.id,
      offerId: offer.id,
      holdToken,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      expiresAt: holdExpiresAt,
    });

    const requestOrigin = new URL(c.req.url).origin;
    const returnUrl = normalizeSameOriginReturnUrl(body.returnUrl, requestOrigin);
    const successUrl = appendQueryParams(returnUrl, {
      booking: "success",
      session_id: "{CHECKOUT_SESSION_ID}",
    });
    const cancelUrl = appendQueryParams(returnUrl, { booking: "cancelled" });

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: guestEmail,
        line_items: [
          {
            price_data: {
              currency: amount.currency,
              product_data: {
                name: offer.title,
                description: `${localDate} ${localTime} (${offer.duration} minutes)`,
              },
              unit_amount: amount.amountCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: {
            purchase_kind: "booking",
            site_id: site.id,
            offer_id: offer.id,
            booking_type: "one_to_one",
            hold_token: holdToken,
            guest_name: guestName,
            guest_email: guestEmail,
            notes,
            starts_at: slot.startsAt,
            ends_at: slot.endsAt,
            duration_minutes: String(offer.duration),
          },
        },
        metadata: {
          purchase_kind: "booking",
          site_id: site.id,
          offer_id: offer.id,
          booking_type: "one_to_one",
          hold_token: holdToken,
          guest_name: guestName,
          guest_email: guestEmail,
          notes,
          starts_at: slot.startsAt,
          ends_at: slot.endsAt,
          duration_minutes: String(offer.duration),
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      });

      return c.json({ url: session.url, sessionId: session.id });
    } catch (error) {
      await releaseBookingHold(c.env, holdToken);
      throw error;
    }
  });

  app.post("/api/book/:username/complete-checkout", async (c) => {
    const site = await getSiteByUsername(c.env, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const stripe = await getStripe(c.env, site.user_id);
    if (!stripe) return c.json({ error: "Stripe is not configured for this ME3 Core install" }, 503);

    const body = await c.req.json<PaidBookingCompletionBody>().catch(() => null);
    const sessionId = normalizeShortText(body?.sessionId, 200);
    if (!sessionId) return c.json({ error: "Missing Stripe Checkout session ID" }, 400);

    const result = await finalizePaidBookingCheckout(
      c.env,
      site,
      await stripe.checkout.sessions.retrieve(sessionId),
    );
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.post("/api/stripe/webhook", async (c) => {
    const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
    const signature = c.req.header("stripe-signature");
    if (!webhookSecret) return c.json({ error: "Stripe webhook secret is not configured" }, 503);
    if (!signature) return c.json({ error: "Missing Stripe signature" }, 400);

    let event: Stripe.Event;
    const rawBody = await c.req.text();
    try {
      const stripe = new Stripe("sk_test_me3_webhook_verifier", {
        apiVersion: "2025-02-24.acacia",
      });
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch {
      return c.json({ error: "Invalid Stripe webhook signature" }, 400);
    }

    if (event.type !== "checkout.session.completed") {
      return c.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.purchase_kind !== "booking") {
      return c.json({ received: true });
    }

    const site = await getSiteById(c.env, session.metadata.site_id || "");
    if (!site) return c.json({ received: true, error: "site_not_found" });

    const result = await finalizePaidBookingCheckout(c.env, site, session);
    if ("error" in result) {
      console.error("Stripe booking webhook failed:", result.error);
      return c.json({ received: true, error: result.error });
    }

    return c.json({ received: true, booking: result.booking });
  });
}

async function finalizePaidBookingCheckout(
  env: Env,
  site: DbSite,
  session: Stripe.Checkout.Session,
): Promise<
  | { ok: true; booking: ReturnType<typeof serializeBooking> | { id: string }; alreadyCompleted?: true }
  | { error: string; status: number }
> {
  if (session.payment_status !== "paid") {
    return { error: "Payment has not completed yet", status: 400 };
  }

  const metadata = session.metadata || {};
  if (metadata.purchase_kind !== "booking" || metadata.site_id !== site.id) {
    return { error: "Checkout session does not match this site", status: 400 };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  if (!paymentIntentId) return { error: "Stripe payment intent missing from session", status: 400 };

  const existing = await env.DB.prepare(bookingSelectSql("WHERE payment_intent_id = ?"))
    .bind(paymentIntentId)
    .first<DbBooking>();
  if (existing) {
    return { ok: true, booking: serializeBooking(existing), alreadyCompleted: true };
  }

  const offerId = metadata.offer_id || null;
  const startsAt = metadata.starts_at || "";
  const endsAt = metadata.ends_at || "";
  const durationMinutes = Number(metadata.duration_minutes || 0);
  const guestName = metadata.guest_name || "";
  const guestEmail = metadata.guest_email || "";
  const notes = metadata.notes || "";
  const holdToken = metadata.hold_token || "";

  if (!offerId || !startsAt || !endsAt || !durationMinutes || !guestName || !guestEmail || !holdToken) {
    return { error: "Checkout session is missing booking details", status: 400 };
  }

  const hold = await findActiveBookingHoldByToken(env, holdToken);
  if (!hold || hold.site_id !== site.id || hold.offer_id !== offerId || hold.slot_start !== startsAt || hold.slot_end !== endsAt) {
    return {
      error: "Booking hold expired. Payment succeeded, but the booking was not confirmed automatically.",
      status: 409,
    };
  }

  const overlap = await findConfirmedBookingOverlap(env, {
    siteId: site.id,
    offerId,
    startsAt,
    endsAt,
  });
  if (overlap) {
    await releaseBookingHold(env, holdToken);
    return {
      error: "That time has already been booked. Payment succeeded, but the booking was not confirmed automatically.",
      status: 409,
    };
  }

  const bookingId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO bookings
     (id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
      duration_minutes, status, notes, created_at, payment_intent_id, amount_paid,
      suggested_amount, currency, payment_status, is_free_booking, paid_at)
     VALUES (?, ?, ?, 'one_to_one', ?, ?, ?, ?, ?, 'confirmed', ?, datetime('now'),
             ?, ?, ?, ?, 'succeeded', 0, datetime('now'))`,
  )
    .bind(
      bookingId,
      site.id,
      offerId,
      guestName,
      guestEmail,
      startsAt,
      endsAt,
      durationMinutes,
      notes || null,
      paymentIntentId,
      session.amount_total || null,
      session.amount_subtotal || session.amount_total || null,
      session.currency || null,
    )
    .run();

  await confirmBookingHold(env, holdToken, bookingId);

  const booking = await env.DB.prepare(bookingSelectSql("WHERE id = ?"))
    .bind(bookingId)
    .first<DbBooking>();
  if (!booking) return { ok: true, booking: { id: bookingId } as ReturnType<typeof serializeBooking> };

  const profile = await loadSiteProfileForCommerce(env, site);
  const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
  const offer = bookIntent ? resolveOneToOneBookingOffer(bookIntent, offerId) : null;
  const timezone = resolveTimeZone(offer?.availability.timezone);
  scheduleBookingRemindersForBooking(env, {
    booking,
    bookingTitle: offer?.title || "Book a session",
    timezone,
    reminders: bookIntent?.reminders,
  }).catch((error) => {
    console.error("Failed to schedule booking reminders:", error);
  });
  await sendConfirmationEmailsForBooking(env, {
    site,
    profile,
    booking,
    bookingTitle: offer?.title || "Book a session",
    timezone,
  });

  return { ok: true, booking: serializeBooking(booking) };
}

async function sendConfirmationEmailsForBooking(
  env: Env,
  input: {
    site: DbSite;
    profile: Awaited<ReturnType<typeof loadSiteProfileForCommerce>>;
    booking: DbBooking;
    bookingTitle: string;
    timezone: string;
  },
) {
  const owner = await getOwnerContact(env, input.site.user_id);
  const bookIntent = input.profile?.intents?.book as CoreBookIntent | undefined;
  const confirmationEmail = bookIntent?.confirmationEmail;
  const hostName = input.profile?.name || owner.name || input.site.username;
  const result = await sendBookingConfirmationEmails(
    env,
    bookingDetailsFromBooking({
      booking: input.booking,
      ownerId: input.site.user_id,
      hostName,
      hostEmail: owner.email,
      siteName: hostName,
      bookingTitle: input.bookingTitle,
      timezone: input.timezone,
      guestMessageText: normalizeLongText(confirmationEmail?.message, 8000),
      sendHostCopy: confirmationEmail?.sendHostCopy !== false,
    }),
  );

  if (result.guest.status === "failed" || result.host.status === "failed") {
    console.error("Booking confirmation email issue:", result);
  }
}

async function getSiteById(env: Env, siteId: string): Promise<DbSite | null> {
  if (!siteId) return null;
  return (
    (await env.DB.prepare(
      `SELECT id, user_id, username, site_type, template_id, custom_domain,
              custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
       FROM sites
       WHERE id = ?`,
    )
      .bind(siteId)
      .first<DbSite>()) || null
  );
}

function bookingSelectSql(where: string) {
  return `SELECT id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
                 duration_minutes, calendar_event_id, status, notes, created_at, cancelled_at,
                 payment_intent_id, amount_paid, suggested_amount, currency, payment_status,
                 is_free_booking, paid_at
          FROM bookings
          ${where}`;
}
