import {
  CommerceOrderInputError,
  completeProductCheckout,
  createProductCheckout,
} from "../commerce-orders";
import { getSiteByUsername } from "../booking";
import type { AppHono } from "../http/types";

export function registerCommerceRoutes(app: AppHono) {
  app.post("/api/shop/:username/:productSlug/checkout-session", async (c) => {
    const site = await getSiteByUsername(c.env, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body) return c.json({ error: "Invalid request body" }, 400);
    try {
      return c.json(
        await createProductCheckout(
          c.env,
          site,
          c.req.param("productSlug"),
          body,
          c.req.url,
        ),
      );
    } catch (error) {
      if (error instanceof CommerceOrderInputError) {
        return c.json({ error: error.message }, error.status as 400);
      }
      throw error;
    }
  });

  app.post("/api/shop/:username/complete-checkout", async (c) => {
    const site = await getSiteByUsername(c.env, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);
    const body = await c.req.json<{ sessionId?: unknown }>().catch(() => null);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) return c.json({ error: "Checkout session ID is required" }, 400);
    try {
      return c.json(await completeProductCheckout(c.env, site, sessionId));
    } catch (error) {
      if (error instanceof CommerceOrderInputError) {
        return c.json({ error: error.message }, error.status as 400);
      }
      throw error;
    }
  });
}
