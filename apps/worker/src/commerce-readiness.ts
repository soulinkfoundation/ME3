import type { Me3SiteProfile } from "@me3-core/site-renderer";
import { isCommerceReady } from "./commerce-settings";
import type { Env } from "./types";

type BookingOffer = {
  pricing?: { enabled?: boolean };
};

type BookIntentWithOffers = {
  offers?: BookingOffer[];
  bookingTypes?: Array<{ offers?: BookingOffer[] }>;
};

export function profileRequiresCommerce(profile: Me3SiteProfile): boolean {
  if ((profile.products || []).some((product) => product.available !== false)) return true;

  const book = profile.intents?.book as BookIntentWithOffers | undefined;
  if ((book?.offers || []).some((offer) => offer.pricing?.enabled === true)) return true;
  return (book?.bookingTypes || []).some((bookingType) =>
    (bookingType.offers || []).some((offer) => offer.pricing?.enabled === true),
  );
}

export async function getProfileCommercePublishBlockReason(
  env: Env,
  ownerId: string,
  profile: Me3SiteProfile,
): Promise<string | null> {
  if (!profileRequiresCommerce(profile) || await isCommerceReady(env, ownerId)) return null;
  return "Connect Stripe in Settings → Payments before publishing paid bookings or products.";
}
