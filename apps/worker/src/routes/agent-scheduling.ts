import {
  AgentSchedulingError,
  getAgentSchedulingConnectionByDispatchToken,
  parseAgentSchedulingRelayMessage,
  receiveAgentSchedulingRelay,
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
}
