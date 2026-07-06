import {
  MobilePairingInputError,
  approveMobilePairing,
  claimMobilePairing,
  claimMobileTokenFromHostedSession,
  getMobileConfig,
  getMobilePairingApproval,
  refreshMobileToken,
  revokeMobileToken,
  startMobilePairing,
} from "../mobile-pairing";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";
import type { Env } from "../types";

type MobileRouteDeps = OwnerRouteDeps & {
  getCoreApiOrigin(env: Env, requestUrl?: string): string;
  getCoreWebOrigin(env: Env, requestUrl?: string): string;
};

export function registerMobileRoutes(app: AppHono, deps: MobileRouteDeps) {
  app.get("/api/mobile/config", async (c) => {
    try {
      return c.json(await getMobileConfig(c.env, origins(c, deps)));
    } catch (error) {
      return mobileErrorResponse(c, error);
    }
  });

  app.post("/api/mobile/pairing/start", async (c) => {
    try {
      return c.json(
        await startMobilePairing(c.env, await c.req.json().catch(() => ({})), origins(c, deps)),
        201,
      );
    } catch (error) {
      return mobileErrorResponse(c, error);
    }
  });

  app.get("/api/mobile/pairing/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await getMobilePairingApproval(c.env, ownerId, c.req.param("id")));
    } catch (error) {
      return mobileErrorResponse(c, error);
    }
  });

  app.post("/api/mobile/pairing/:id/approve", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await approveMobilePairing(
          c.env,
          ownerId,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return mobileErrorResponse(c, error);
    }
  });

  app.post("/api/mobile/pairing/claim", async (c) => {
    try {
      return c.json(
        await claimMobilePairing(c.env, await c.req.json().catch(() => ({})), origins(c, deps)),
      );
    } catch (error) {
      return mobileErrorResponse(c, error);
    }
  });

  app.post("/api/mobile/token", async (c) => {
    try {
      return c.json(
        await claimMobileTokenFromHostedSession(
          c.env,
          await c.req.json().catch(() => ({})),
          origins(c, deps),
        ),
      );
    } catch (error) {
      return mobileErrorResponse(c, error);
    }
  });

  app.post("/api/mobile/token/refresh", async (c) => {
    try {
      return c.json(
        await refreshMobileToken(c.env, await c.req.json().catch(() => ({})), origins(c, deps)),
      );
    } catch (error) {
      return mobileErrorResponse(c, error);
    }
  });

  app.post("/api/mobile/token/revoke", async (c) => {
    try {
      return c.json(await revokeMobileToken(c.env, await c.req.json().catch(() => ({}))));
    } catch (error) {
      return mobileErrorResponse(c, error);
    }
  });
}

function origins(c: AppContext, deps: MobileRouteDeps) {
  return {
    apiOrigin: deps.getCoreApiOrigin(c.env, c.req.url),
    webOrigin: deps.getCoreWebOrigin(c.env, c.req.url),
  };
}

function mobileErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof MobilePairingInputError) {
    return c.json({ ok: false, error: error.message }, error.status as never);
  }
  throw error;
}
