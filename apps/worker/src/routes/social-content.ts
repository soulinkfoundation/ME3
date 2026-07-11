import {
  SocialContentPackageInputError,
  SocialPublishingGateError,
  SocialPublishingInputError,
  createQueuedSocialVariantPublicationAndEnqueue,
  getSocialContentPackage,
  getSocialPublishingRuntimeStatus,
  listSocialContentPackages,
  resolveSocialVariantPublicationOutcome,
  updateSocialAccountVariant,
  type UpdateSocialAccountVariantInput,
} from "../social-publishing";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";

export function registerSocialContentRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/social/packages", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      return c.json({
        packages: await listSocialContentPackages(c.env, ownerId, c.req.query("siteId")),
      });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.get("/api/social/packages/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const detail = await getSocialContentPackage(c.env, ownerId, c.req.param("id"));
      if (!detail) return c.json({ ok: false, error: "Social package not found" }, 404);
      return c.json({ package: detail });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.patch("/api/social/variants/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const body = await c.req.json<unknown>().catch((): unknown => ({}));

    try {
      await requireSocialPublishing(c);
      const variant = await updateSocialAccountVariant(
        c.env,
        ownerId,
        c.req.param("id"),
        (body && typeof body === "object" ? body : {}) as UpdateSocialAccountVariantInput,
      );
      if (!variant) return c.json({ ok: false, error: "Social variant not found" }, 404);
      return c.json({ ok: true, variant });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.post("/api/social/variants/:id/publish", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const publication = await createQueuedSocialVariantPublicationAndEnqueue(
        c.env,
        ownerId,
        c.req.param("id"),
      );
      if (!publication) return c.json({ ok: false, error: "Social variant not found" }, 404);
      return c.json({ ok: true, publication });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.post("/api/social/variants/:id/resolve", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const body = await c.req.json<unknown>().catch((): unknown => ({}));
    try {
      const publication = await resolveSocialVariantPublicationOutcome(
        c.env,
        ownerId,
        c.req.param("id"),
        body && typeof body === "object"
          ? body as { outcome?: unknown; platformPostUrl?: unknown }
          : {},
      );
      if (!publication) return c.json({ ok: false, error: "Social variant not found" }, 404);
      return c.json({ ok: true, publication });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });
}

async function requireSocialPublishing(c: AppContext): Promise<void> {
  const gate = await getSocialPublishingRuntimeStatus(c.env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);
}

function socialContentErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof SocialPublishingGateError) {
    return c.json({ ok: false, error: error.message, plugin: error.gate }, error.status as any);
  }
  if (error instanceof SocialContentPackageInputError || error instanceof SocialPublishingInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}
