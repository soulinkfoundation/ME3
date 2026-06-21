import { JOURNAL_PLUGIN_ID } from "@me3-core/plugin-journal";
import {
  JournalInputError,
  deleteJournalDay,
  getJournalDay,
  listJournalArchive,
  updateJournalDay,
} from "../journal";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";
import { isCorePluginEnabled } from "../plugins";

export function registerJournalRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/journal/days/:date", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireJournalPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(await getJournalDay(c.env, ownerId, c.req.param("date")));
    } catch (error) {
      return journalErrorResponse(c, error);
    }
  });

  app.patch("/api/journal/days/:date", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireJournalPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(
        await updateJournalDay(
          c.env,
          ownerId,
          c.req.param("date"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return journalErrorResponse(c, error);
    }
  });

  app.delete("/api/journal/days/:date", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireJournalPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(await deleteJournalDay(c.env, ownerId, c.req.param("date")));
    } catch (error) {
      return journalErrorResponse(c, error);
    }
  });

  app.get("/api/journal/archive", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireJournalPlugin(c);
    if (blocked) return blocked;

    try {
      return c.json(
        await listJournalArchive(c.env, ownerId, {
          limit: c.req.query("limit"),
        }),
      );
    } catch (error) {
      return journalErrorResponse(c, error);
    }
  });
}

async function requireJournalPlugin(c: AppContext) {
  if (await isCorePluginEnabled(c.env, JOURNAL_PLUGIN_ID)) return null;
  return c.json({ ok: false, error: "ME3 Journal is disabled" }, 403);
}

function journalErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof JournalInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}
