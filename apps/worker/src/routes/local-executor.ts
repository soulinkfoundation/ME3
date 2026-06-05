import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";
import type { Env } from "../types";
import {
  LocalExecutorInputError,
  appendLocalExecutorRunProgress,
  authenticateLocalExecutorDaemon,
  cancelLocalExecutorRun,
  claimLocalExecutorRun,
  completeLocalExecutorPairing,
  completeLocalExecutorRun,
  createLocalExecutorPolicy,
  createLocalExecutorRun,
  deleteLocalExecutorPolicy,
  getLocalExecutorRun,
  getLocalExecutorStatus,
  listLocalExecutorAudit,
  listLocalExecutorPolicies,
  recordLocalExecutorHeartbeat,
  retryLocalExecutorRun,
  startLocalExecutorPairing,
  updateLocalExecutorPolicy,
} from "../local-executor";
import { isCorePluginEnabled } from "../plugins";

type LocalExecutorRouteDeps = OwnerRouteDeps & {
  getCoreApiOrigin(env: Env, requestUrl?: string): string;
};

export function registerLocalExecutorRoutes(app: AppHono, deps: LocalExecutorRouteDeps) {
  app.get("/api/local-executor/status", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(await getLocalExecutorStatus(c.env, ownerId));
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/pairing/start", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(
        await startLocalExecutorPairing(
          c.env,
          ownerId,
          await c.req.json().catch(() => ({})),
          { apiBase: `${deps.getCoreApiOrigin(c.env, c.req.url)}/api/local-executor` },
        ),
        201,
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.get("/api/local-executor/policies", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(await listLocalExecutorPolicies(c.env, ownerId));
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/policies", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(
        await createLocalExecutorPolicy(c.env, ownerId, await c.req.json().catch(() => ({}))),
        201,
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.patch("/api/local-executor/policies/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(
        await updateLocalExecutorPolicy(
          c.env,
          ownerId,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.delete("/api/local-executor/policies/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(await deleteLocalExecutorPolicy(c.env, ownerId, c.req.param("id")));
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/runs", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(
        await createLocalExecutorRun(c.env, ownerId, await c.req.json().catch(() => ({}))),
        201,
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.get("/api/local-executor/runs/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(await getLocalExecutorRun(c.env, ownerId, c.req.param("id")));
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/runs/:id/cancel", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(
        await cancelLocalExecutorRun(
          c.env,
          ownerId,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/runs/:id/retry", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(
        await retryLocalExecutorRun(
          c.env,
          ownerId,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.get("/api/local-executor/audit", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireLocalExecutorPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(await listLocalExecutorAudit(c.env, ownerId));
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/daemon/pairing/complete", async (c) => {
    try {
      return c.json(await completeLocalExecutorPairing(c.env, await c.req.json().catch(() => ({}))));
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/daemon/heartbeat", async (c) => {
    try {
      const auth = await authenticateLocalExecutorDaemon(
        c.env,
        c.req.header("Authorization") || null,
      );
      return c.json(
        await recordLocalExecutorHeartbeat(c.env, auth, await c.req.json().catch(() => ({}))),
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/daemon/runs/claim", async (c) => {
    try {
      const auth = await authenticateLocalExecutorDaemon(
        c.env,
        c.req.header("Authorization") || null,
      );
      return c.json(await claimLocalExecutorRun(c.env, auth, await c.req.json().catch(() => ({}))));
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/daemon/runs/:id/events", async (c) => {
    try {
      const auth = await authenticateLocalExecutorDaemon(
        c.env,
        c.req.header("Authorization") || null,
      );
      return c.json(
        await appendLocalExecutorRunProgress(
          c.env,
          auth,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });

  app.post("/api/local-executor/daemon/runs/:id/complete", async (c) => {
    try {
      const auth = await authenticateLocalExecutorDaemon(
        c.env,
        c.req.header("Authorization") || null,
      );
      return c.json(
        await completeLocalExecutorRun(
          c.env,
          auth,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return localExecutorErrorResponse(c, error);
    }
  });
}

async function requireLocalExecutorPlugin(c: AppContext) {
  if (await isCorePluginEnabled(c.env, "me3.local-executor")) return null;
  return c.json({ ok: false, error: "Local Executor is disabled" }, 403);
}

function localExecutorErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof LocalExecutorInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}
