import {
  CalendarSourceInputError,
  importIcsUpload,
  removeCalendarSource,
  refreshCalendarSource,
  subscribeIcsUrl,
} from "../calendar-sources";
import type { AppHono, OwnerRouteDeps } from "../http/types";

export function registerCalendarSourceRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.post("/api/calendar/import/ics", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await importIcsUpload(c.env, ownerId, await c.req.formData()),
        201,
      );
    } catch (error) {
      if (error instanceof CalendarSourceInputError) {
        return c.json({ error: error.message }, error.status as any);
      }
      throw error;
    }
  });

  app.post("/api/calendar/sources/ics-url", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await subscribeIcsUrl(c.env, ownerId, await c.req.json().catch(() => null)),
        201,
      );
    } catch (error) {
      if (error instanceof CalendarSourceInputError) {
        return c.json({ error: error.message }, error.status as any);
      }
      throw error;
    }
  });

  app.post("/api/calendar/sources/:sourceId/refresh", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await refreshCalendarSource(c.env, ownerId, c.req.param("sourceId")),
      );
    } catch (error) {
      if (error instanceof CalendarSourceInputError) {
        return c.json({ error: error.message }, error.status as any);
      }
      throw error;
    }
  });

  app.delete("/api/calendar/sources/:sourceId", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await removeCalendarSource(c.env, ownerId, c.req.param("sourceId")),
      );
    } catch (error) {
      if (error instanceof CalendarSourceInputError) {
        return c.json({ error: error.message }, error.status as any);
      }
      throw error;
    }
  });
}
