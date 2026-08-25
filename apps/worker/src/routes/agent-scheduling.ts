import {
  AgentSchedulingError,
  getAgentSchedulingConnectionByDispatchToken,
  parseAgentSchedulingRelayMessage,
  performAgentSchedulingOwnerAction,
  receiveAgentSchedulingRelay,
  type AgentSchedulingOwnerAction,
} from "../agent-scheduling";
import { verifySoulinkDispatchAuth } from "../agent-channels";
import type { AppHono } from "../http/types";

export function registerAgentSchedulingRoutes(app: AppHono) {
  app.post("/api/agent/channels/soulink/scheduling", async (c) => {
    const token = c.req.header("Authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() || "";
    if (!token) return c.json({ ok: false, error: "Missing Soulink dispatch token" }, 401);

    const connection = await getAgentSchedulingConnectionByDispatchToken(c.env, token);
    if (!connection) {
      return c.json({ ok: false, error: "Invalid Soulink dispatch token" }, 401);
    }
    const auth = verifySoulinkDispatchAuth(connection, c.req.header("Authorization"));
    if (!auth.ok) return c.json({ ok: false, error: auth.error }, auth.status as 401);

    const message = parseAgentSchedulingRelayMessage(
      await c.req.json().catch(() => null),
    );
    if (!message) {
      return c.json({ ok: false, error: "Invalid agent scheduling envelope" }, 400);
    }

    try {
      const result = await receiveAgentSchedulingRelay(c.env, connection, message);
      return c.json({ ok: true, result });
    } catch (error) {
      if (error instanceof AgentSchedulingError) {
        const status = error.status >= 400 && error.status <= 599 ? error.status : 400;
        return c.json({ ok: false, error: error.message }, status as any);
      }
      console.error("Agent scheduling relay failed", error);
      return c.json(
        { ok: false, error: "Agent scheduling relay failed" },
        500,
      );
    }
  });

  app.post("/api/agent/channels/soulink/scheduling/action", async (c) => {
    const token = c.req.header("Authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() || "";
    if (!token) return c.json({ ok: false, error: "Missing Soulink dispatch token" }, 401);

    const connection = await getAgentSchedulingConnectionByDispatchToken(c.env, token);
    if (!connection) return c.json({ ok: false, error: "Invalid Soulink dispatch token" }, 401);
    const auth = verifySoulinkDispatchAuth(connection, c.req.header("Authorization"));
    if (!auth.ok) return c.json({ ok: false, error: auth.error }, auth.status as 401);

    const input = parseSchedulingOwnerAction(await c.req.json().catch(() => null));
    if (!input) return c.json({ ok: false, error: "Invalid scheduling action" }, 400);
    try {
      const result = await performAgentSchedulingOwnerAction(c.env, connection, input);
      return c.json({ ok: true, result });
    } catch (error) {
      if (error instanceof AgentSchedulingError) {
        const status = error.status >= 400 && error.status <= 599 ? error.status : 400;
        return c.json({ ok: false, error: error.message }, status as any);
      }
      console.error("Agent scheduling action failed", error);
      return c.json({ ok: false, error: "Agent scheduling action failed" }, 500);
    }
  });
}

function parseSchedulingOwnerAction(value: unknown): AgentSchedulingOwnerAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const requestId = typeof input.requestId === "string" ? input.requestId.trim().slice(0, 160) : "";
  const action = input.action === "offer" || input.action === "select" || input.action === "decline"
    ? input.action
    : null;
  if (!requestId || !action) return null;
  const option = typeof input.option === "number" && Number.isInteger(input.option)
    ? input.option
    : undefined;
  const selectedOptions = Array.isArray(input.selectedOptions)
    ? input.selectedOptions
      .filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry))
      .slice(0, 3)
    : undefined;
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : undefined;
  return { requestId, action, option, selectedOptions, reason };
}
