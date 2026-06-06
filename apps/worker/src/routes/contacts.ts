import {
  convertAgentContactToClient,
  createAgentContact,
  deleteAgentContact,
  listAgentContacts,
  updateAgentContact,
  updateAgentContactOutreachStatus,
} from "../agent-chat";
import type { AppContext, AppHono } from "../http/types";
import { searchLocationQuery } from "../location-search";

type ContactsRouteDeps = {
  requireOwner(c: AppContext): Promise<string | null>;
  unauthorized(c: AppContext): Response;
};

export function registerContactsRoutes(app: AppHono, deps: ContactsRouteDeps) {
  const { requireOwner, unauthorized } = deps;

  app.get("/api/contacts", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);
    return c.json(await listAgentContacts(c.env, ownerId));
  });

  app.post("/api/contacts", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const contact = await createAgentContact(c.env, ownerId, await c.req.json().catch(() => null));
    if ("error" in contact) return c.json({ error: contact.error }, contact.status as any);
    return c.json({ ok: true, contact }, 201);
  });

  app.put("/api/contacts/:id", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const contact = await updateAgentContact(
      c.env,
      ownerId,
      c.req.param("id"),
      await c.req.json().catch(() => null),
    );
    if ("error" in contact) return c.json({ error: contact.error }, contact.status as any);
    return c.json({ ok: true, contact });
  });

  app.delete("/api/contacts/:id", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const result = await deleteAgentContact(c.env, ownerId, c.req.param("id"));
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.get("/api/locations/search", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const result = await searchLocationQuery(
      c.env,
      c.req.query("q"),
      c.req.query("limit"),
    );
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, result.status as any);
    }
    return c.json(result);
  });

  app.put("/api/contacts/:id/outreach-status", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const body = await c.req
      .json<{ outreachStatus?: string | null; nextFollowupAt?: string | null }>()
      .catch((): { outreachStatus?: string | null; nextFollowupAt?: string | null } => ({}));
    const contact = await updateAgentContactOutreachStatus(
      c.env,
      ownerId,
      c.req.param("id"),
      body,
    );
    if ("error" in contact) return c.json({ error: contact.error }, contact.status as any);
    return c.json({ ok: true, contact });
  });

  app.post("/api/contacts/:id/convert", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const contact = await convertAgentContactToClient(c.env, ownerId, c.req.param("id"));
    if ("error" in contact) return c.json({ error: contact.error }, contact.status as any);
    return c.json({ ok: true, contact });
  });
}
