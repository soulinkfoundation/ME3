import {
  AssistantSkillsInputError,
  createAssistantSkill,
  deleteAssistantSkill,
  listAssistantSkills,
  updateAssistantSkill,
} from "../assistant-skills";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";

export function registerAssistantSkillsRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/assistant/skills", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json({ skills: await listAssistantSkills(c.env, ownerId) });
    } catch (error) {
      return assistantSkillsErrorResponse(c, error);
    }
  });

  app.post("/api/assistant/skills", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await createAssistantSkill(
          c.env,
          ownerId,
          await c.req.json().catch(() => ({})),
        ),
        201,
      );
    } catch (error) {
      return assistantSkillsErrorResponse(c, error);
    }
  });

  app.patch("/api/assistant/skills/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(
        await updateAssistantSkill(
          c.env,
          ownerId,
          c.req.param("id"),
          await c.req.json().catch(() => ({})),
        ),
      );
    } catch (error) {
      return assistantSkillsErrorResponse(c, error);
    }
  });

  app.delete("/api/assistant/skills/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      return c.json(await deleteAssistantSkill(c.env, ownerId, c.req.param("id")));
    } catch (error) {
      return assistantSkillsErrorResponse(c, error);
    }
  });
}

function assistantSkillsErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof AssistantSkillsInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}
