import type { AppHono, OwnerRouteDeps } from "../http/types";
import {
  getPushNotificationDevice,
  PushNotificationInputError,
  registerPushNotificationDevice,
  unregisterPushNotificationDevice,
} from "../push-notifications";

export function registerPushNotificationRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/mobile/push/:deviceId", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      return c.json(await getPushNotificationDevice(c.env, c.req.param("deviceId")));
    } catch (error) {
      return pushError(c, error);
    }
  });

  app.put("/api/mobile/push", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      return c.json(
        await registerPushNotificationDevice(c.env, await c.req.json().catch(() => ({}))),
      );
    } catch (error) {
      return pushError(c, error);
    }
  });

  app.delete("/api/mobile/push/:deviceId", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      return c.json(await unregisterPushNotificationDevice(c.env, c.req.param("deviceId")));
    } catch (error) {
      return pushError(c, error);
    }
  });
}

function pushError(c: Parameters<OwnerRouteDeps["unauthorized"]>[0], error: unknown) {
  if (error instanceof PushNotificationInputError) {
    return c.json({ ok: false, error: error.message }, error.status as never);
  }
  throw error;
}
