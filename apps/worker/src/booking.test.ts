import { describe, expect, it } from "vitest";
import {
  createConfirmedOneToOneBooking,
  resolvePaidOneToOneOffer,
  serializePublicBookingOffer,
  type CoreBookIntent,
  type ResolvedOneToOneBookingOffer,
} from "./booking";
import type { DbBooking, DbSite, Env } from "./types";

const site: DbSite = {
  id: "site-1",
  user_id: "owner",
  username: "owner",
  site_type: "profile",
  template_id: null,
  custom_domain: null,
  custom_domain_status: null,
  custom_domain_cf_id: null,
  created_at: "2026-07-31T10:00:00Z",
  updated_at: "2026-07-31T10:00:00Z",
  published_at: "2026-07-31T10:00:00Z",
};

const manualOffer: ResolvedOneToOneBookingOffer = {
  id: "session",
  title: "Session",
  duration: 60,
  availability: { timezone: "Europe/Dublin", windows: {} },
  pricing: {
    enabled: true,
    suggestedAmount: 80,
    currency: "EUR",
    paymentMethod: "manual",
    paymentInstructions: "Pay at https://pay.example/session",
  },
};

describe("manual booking payments", () => {
  it("does not expose payment instructions or send manual offers to checkout", () => {
    const book = {
      enabled: true,
      offers: [manualOffer],
      availability: manualOffer.availability,
    } as CoreBookIntent;

    expect(resolvePaidOneToOneOffer(book, manualOffer.id)).toBeNull();
    expect(serializePublicBookingOffer(manualOffer)).toEqual({
      id: "session",
      title: "Session",
      duration: 60,
      pricing: {
        enabled: true,
        suggestedAmount: 80,
        currency: "EUR",
        paymentMethod: "manual",
      },
    });
  });

  it("stores the amount due while confirming without a payment intent", async () => {
    let insertValues: unknown[] = [];
    const booking: DbBooking = {
      id: "booking-1",
      site_id: site.id,
      offer_id: manualOffer.id,
      booking_type: "one_to_one",
      guest_name: "Guest",
      guest_email: "guest@example.com",
      starts_at: "2026-08-03T09:00:00.000Z",
      ends_at: "2026-08-03T10:00:00.000Z",
      duration_minutes: 60,
      calendar_event_id: null,
      status: "confirmed",
      notes: null,
      created_at: "2026-07-31T10:00:00Z",
      cancelled_at: null,
      payment_intent_id: null,
      amount_paid: null,
      suggested_amount: 9500,
      currency: "eur",
      payment_status: "not_required",
      is_free_booking: 0,
      paid_at: null,
    };
    const DB = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            if (sql.includes("INSERT INTO bookings")) insertValues = values;
            return this;
          },
          async run() {
            return { meta: { changes: 1 } };
          },
          async first<T>() {
            return (sql.includes("FROM bookings") ? booking : null) as T | null;
          },
        };
      },
    };

    const result = await createConfirmedOneToOneBooking(
      { DB } as unknown as Env,
      {
        site,
        bookIntent: { enabled: true } as CoreBookIntent,
        offer: manualOffer,
        guestName: "Guest",
        guestEmail: "guest@example.com",
        notes: "",
        slot: {
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
        },
        amountDueCents: 9500,
        paymentCurrency: "eur",
      },
    );

    expect(result).toEqual(booking);
    expect(insertValues).toEqual(expect.arrayContaining([9500, "eur", 0]));
    expect(insertValues).not.toContain(expect.stringMatching(/^pi_/));
  });
});
