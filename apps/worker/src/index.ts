import { Hono } from "hono";
import { cors } from "hono/cors";
import { Me3UserAgent } from "./user-agent";
import type { Env, OwnerProfile } from "./types";

export { Me3UserAgent };

type BootstrapBody = Partial<OwnerProfile> & { bootstrapCode?: string };
type ChatBody = { message?: string };

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => origin || c.env.CORE_WEB_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "me3-core",
    environment: c.env.ENVIRONMENT,
    bindings: {
      db: Boolean(c.env.DB),
      userAgent: Boolean(c.env.ME3_USER_AGENT),
      workersAi: Boolean(c.env.AI),
    },
    setupRequired: getSetupRequired(c.env),
  });
});

app.get("/api/config", (c) => {
  return c.json({
    apiOrigin: c.env.CORE_API_ORIGIN,
    webOrigin: c.env.CORE_WEB_ORIGIN,
    ai: {
      defaultProvider: c.env.ME3_AI_DEFAULT_PROVIDER ?? "not-configured",
      defaultModel: c.env.ME3_AI_DEFAULT_MODEL ?? "not-configured",
      chatProvider: c.env.ME3_AI_CHAT_PROVIDER ?? "not-configured",
      chatModel: c.env.ME3_AI_CHAT_MODEL ?? "not-configured",
    },
    setupRequired: getSetupRequired(c.env),
  });
});

app.post("/api/admin/bootstrap", async (c) => {
  const body = await c.req.json<BootstrapBody>().catch((): BootstrapBody => ({}));

  if (c.env.ADMIN_BOOTSTRAP_CODE && body.bootstrapCode !== c.env.ADMIN_BOOTSTRAP_CODE) {
    return c.json({ ok: false, error: "Invalid bootstrap code" }, 401);
  }

  const owner: OwnerProfile = {
    id: "owner",
    email: body.email ?? null,
    name: body.name ?? "ME3 Core Owner",
    username: body.username ?? "owner",
    bio: body.bio ?? "Personal AI assistant powered by ME3 Core.",
    avatar_url: body.avatar_url ?? null,
    timezone: body.timezone ?? "UTC",
  };

  await c.env.DB.prepare(
    `INSERT INTO owner_profile (id, email, name, username, bio, avatar_url, timezone, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       username = excluded.username,
       bio = excluded.bio,
       avatar_url = excluded.avatar_url,
       timezone = excluded.timezone,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(owner.id, owner.email, owner.name, owner.username, owner.bio, owner.avatar_url, owner.timezone)
    .run();

  return c.json({ ok: true, owner });
});

app.post("/api/assistant/chat", async (c) => {
  const body = await c.req.json<ChatBody>().catch((): ChatBody => ({}));
  const message = body.message?.trim();

  if (!message) {
    return c.json({ ok: false, error: "Message is required" }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO assistant_messages (id, owner_id, role, content) VALUES (?, ?, ?, ?)",
  )
    .bind(id, "owner", "user", message)
    .run();

  return c.json({
    ok: true,
    reply: "ME3 Core assistant shell is booted. Model execution will be wired in the first bootable slice.",
    setupRequired: getSetupRequired(c.env),
  });
});

app.get("/.well-known/me.json", async (c) => {
  const owner = await getOwnerProfile(c.env);

  return c.json({
    id: c.env.CORE_API_ORIGIN,
    type: "Person",
    name: owner?.name ?? "ME3 Core Owner",
    username: owner?.username ?? "owner",
    bio: owner?.bio ?? "Personal AI assistant powered by ME3 Core.",
    url: c.env.CORE_WEB_ORIGIN,
    intents: {
      chat: `${c.env.CORE_API_ORIGIN}/api/assistant/chat`,
    },
  });
});

async function getOwnerProfile(env: Env): Promise<OwnerProfile | null> {
  const result = await env.DB.prepare(
    "SELECT id, email, name, username, bio, avatar_url, timezone FROM owner_profile WHERE id = ?",
  )
    .bind("owner")
    .first<OwnerProfile>();

  return result ?? null;
}

function getSetupRequired(env: Env): string[] {
  const missing: string[] = [];

  if (!env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!env.TOKEN_ENCRYPTION_KEY) missing.push("TOKEN_ENCRYPTION_KEY");
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY && !env.AI) {
    missing.push("AI_PROVIDER");
  }

  return missing;
}

export default app;
