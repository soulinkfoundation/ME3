import { JOURNAL_PLUGIN_ID } from "@me3-core/plugin-journal";
import {
  JournalInputError,
  deleteJournalDay,
  getJournalMedia,
  getJournalDay,
  listJournalArchive,
  uploadJournalMedia,
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

  app.post("/api/journal/media", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireJournalPlugin(c);
    if (blocked) return blocked;

    try {
      const form = await c.req.formData();
      const file = form.get("image") || form.get("file");
      if (!(file instanceof File)) {
        throw new JournalInputError("Journal image upload is required");
      }
      const date = form.get("date");
      return c.json(
        await uploadJournalMedia(c.env, ownerId, {
          date,
          file,
        }),
        201,
      );
    } catch (error) {
      return journalErrorResponse(c, error);
    }
  });

  app.get("/api/journal/media/:date/:filename", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const blocked = await requireJournalPlugin(c);
    if (blocked) return blocked;

    try {
      const media = await getJournalMedia(
        c.env,
        ownerId,
        c.req.param("date"),
        c.req.param("filename"),
      );
      return new Response(media.body, {
        headers: {
          "content-type": media.mimeType,
          "cache-control": "private, max-age=31536000, immutable",
          ...(media.size ? { "content-length": String(media.size) } : {}),
        },
      });
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
