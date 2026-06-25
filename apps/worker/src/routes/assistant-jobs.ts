import {
  AssistantJobsInputError,
  archiveAssistantJob,
  createAssistantJob,
  duplicateAssistantJob,
  ensureDefaultAssistantJobs,
  getAssistantJob,
  listAssistantJobIngressEvents,
  listAssistantJobRecipes,
  listAssistantJobs,
  recordAssistantJobIngressEvent,
  runAssistantJobNow,
  setAssistantJobPaused,
  updateAssistantJob,
  updateAssistantJobIngressEvent,
} from "../assistant-jobs";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";

export function registerAssistantJobsRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/assistant/jobs/recipes", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    return c.json(await listAssistantJobRecipes(c.env, ownerId));
  });

  app.get("/api/assistant/jobs/events", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await listAssistantJobIngressEvents(c.env, ownerId, c.req.query("status")));
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.post("/api/assistant/jobs/events/internal", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await recordAssistantJobIngressEvent(
          c.env,
          ownerId,
          await c.req.json().catch(() => ({})),
        ),
        201,
      );
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.post("/api/assistant/jobs/events/webhook", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      const body = await c.req.json().catch(() => ({}));
      return c.json(
        await recordAssistantJobIngressEvent(c.env, ownerId, {
          ...(typeof body === "object" && body !== null ? body : {}),
          sourceKind: "webhook",
        }),
        201,
      );
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.patch("/api/assistant/jobs/events/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await updateAssistantJobIngressEvent(
          c.env,
          ownerId,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.get("/api/assistant/jobs", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await ensureDefaultAssistantJobs(c.env, ownerId);
      return c.json(await listAssistantJobs(c.env, ownerId, c.req.query("status")));
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.get("/api/assistant/jobs/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await getAssistantJob(c.env, ownerId, c.req.param("id")));
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.post("/api/assistant/jobs", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await createAssistantJob(c.env, ownerId, await c.req.json().catch(() => ({}))),
        201,
      );
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.patch("/api/assistant/jobs/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await updateAssistantJob(
          c.env,
          ownerId,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.post("/api/assistant/jobs/:id/pause", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await setAssistantJobPaused(c.env, ownerId, c.req.param("id"), true));
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.post("/api/assistant/jobs/:id/resume", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await setAssistantJobPaused(c.env, ownerId, c.req.param("id"), false));
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.post("/api/assistant/jobs/:id/duplicate", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await duplicateAssistantJob(c.env, ownerId, c.req.param("id")), 201);
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.post("/api/assistant/jobs/:id/run", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await runAssistantJobNow(c.env, ownerId, c.req.param("id")), 201);
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });

  app.delete("/api/assistant/jobs/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await archiveAssistantJob(c.env, ownerId, c.req.param("id")));
    } catch (error) {
      return assistantJobsErrorResponse(c, error);
    }
  });
}

function assistantJobsErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof AssistantJobsInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}
