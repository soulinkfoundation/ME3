import {
  SocialPostInputError,
  SocialPublishingGateError,
  SocialPublishingInputError,
  cancelPublication,
  createPostVersionPublication,
  createSocialPost,
  getSocialPost,
  getSocialPublishingRuntimeStatus,
  listPostVersionPublications,
  listSocialPosts,
  resolvePublicationOutcome,
  updatePostVersion,
  type CreatePublicationInput,
  type CreateSocialPostInput,
  type UpdatePostVersionInput,
} from "../social-publishing";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";

export function registerSocialContentRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/social/posts", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      return c.json({
        posts: await listSocialPosts(c.env, ownerId, c.req.query("siteId")),
      });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.post("/api/social/posts", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const body = await c.req.json<unknown>().catch((): unknown => ({}));

    try {
      await requireSocialPublishing(c);
      const input = (body && typeof body === "object" ? body : {}) as CreateSocialPostInput;
      const post = await createSocialPost(c.env, ownerId, {
        ...input,
        createdBy: "user",
      });
      return c.json({ ok: true, post }, 201);
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.get("/api/social/posts/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const post = await getSocialPost(c.env, ownerId, c.req.param("id"));
      if (!post) return c.json({ ok: false, error: "Social Post not found" }, 404);
      return c.json({ post });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.patch("/api/social/versions/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const body = await c.req.json<unknown>().catch((): unknown => ({}));

    try {
      await requireSocialPublishing(c);
      const version = await updatePostVersion(
        c.env,
        ownerId,
        c.req.param("id"),
        (body && typeof body === "object" ? body : {}) as UpdatePostVersionInput,
      );
      if (!version) return c.json({ ok: false, error: "Post Version not found" }, 404);
      return c.json({ ok: true, version });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.get("/api/social/versions/:id/publications", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const publications = await listPostVersionPublications(
        c.env,
        ownerId,
        c.req.param("id"),
      );
      return c.json({ publications });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.post("/api/social/versions/:id/publications", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const body = await c.req.json<unknown>().catch((): unknown => ({}));

    try {
      await requireSocialPublishing(c);
      const input = (body && typeof body === "object" ? body : {}) as CreatePublicationInput;
      const publication = await createPostVersionPublication(
        c.env,
        ownerId,
        c.req.param("id"),
        { ...input, requestedByType: "owner" },
      );
      if (!publication) return c.json({ ok: false, error: "Post Version not found" }, 404);
      return c.json({ ok: true, publication }, 201);
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.post("/api/social/versions/:id/publish", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const publication = await createPostVersionPublication(
        c.env,
        ownerId,
        c.req.param("id"),
        { requestedByType: "owner" },
      );
      if (!publication) return c.json({ ok: false, error: "Post Version not found" }, 404);
      return c.json({ ok: true, publication });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.delete("/api/social/publications/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const publication = await cancelPublication(c.env, ownerId, c.req.param("id"));
      if (!publication) return c.json({ ok: false, error: "Publication not found" }, 404);
      return c.json({ ok: true, publication });
    } catch (error) {
      return socialContentErrorResponse(c, error);
    }
  });

  app.post("/api/social/publications/:id/resolve", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const body = await c.req.json<unknown>().catch((): unknown => ({}));

    try {
      await requireSocialPublishing(c);
      const publication = await resolvePublicationOutcome(
        c.env,
        ownerId,
        c.req.param("id"),
        body && typeof body === "object"
          ? body as { outcome?: unknown; platformPostUrl?: unknown }
          : {},
      );
      if (!publication) return c.json({ ok: false, error: "Publication not found" }, 404);
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
  if (error instanceof SocialPostInputError || error instanceof SocialPublishingInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}
