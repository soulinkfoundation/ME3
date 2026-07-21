import {
  getSocialMediaDeliveryResponse,
  SocialMediaDeliveryError,
} from "../social-media-delivery";
import type { AppHono } from "../http/types";

export function registerSocialMediaDeliveryRoutes(app: AppHono) {
  app.get("/api/social/media/:token", async (c) => {
    try {
      return await getSocialMediaDeliveryResponse(c.env, c.req.param("token"), {
        rangeHeader: c.req.header("Range"),
      });
    } catch (error) {
      return deliveryErrorResponse(error);
    }
  });

  app.on("HEAD", "/api/social/media/:token", async (c) => {
    try {
      return await getSocialMediaDeliveryResponse(c.env, c.req.param("token"), { head: true });
    } catch (error) {
      return deliveryErrorResponse(error);
    }
  });
}

function deliveryErrorResponse(error: unknown): Response {
  if (error instanceof SocialMediaDeliveryError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  throw error;
}
