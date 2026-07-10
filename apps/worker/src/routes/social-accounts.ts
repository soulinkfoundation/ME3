import {
  SocialPublishingGateError,
  SocialPublishingInputError,
  disconnectSocialPublishingAccount,
} from "../social-publishing";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";

export function registerSocialAccountRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.delete("/api/social/accounts/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      const disconnected = await disconnectSocialPublishingAccount(
        c.env,
        ownerId,
        c.req.param("id"),
      );
      if (!disconnected) return c.json({ ok: false, error: "Social account not found" }, 404);
      return c.json({ ok: true });
    } catch (error) {
      return socialAccountErrorResponse(c, error);
    }
  });
}

function socialAccountErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof SocialPublishingGateError) {
    return c.json({ ok: false, error: error.message, plugin: error.gate }, error.status as any);
  }
  if (error instanceof SocialPublishingInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}
