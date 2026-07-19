import type { Env } from "./types";
import {
  dispatchAgentSandboxTurn,
  isAgentSandboxDispatchInput,
  type AgentChatRuntimeStreamEvent,
} from "./agent-chat";

const RECONSTRUCTABLE_STORAGE_KEYS = new Set([
  "userId",
  "lastSandboxConnectionId",
  "lastSandboxTurnId",
  "lastSandboxTurnAt",
  "agent-chat:sandbox:result-keys",
]);
const RECONSTRUCTABLE_RESULT_PREFIX = "agent-chat:sandbox:result:";

/**
 * Managed portable exports intentionally omit Durable Object storage. Every
 * allowed key is therefore cache or routing metadata whose canonical turn,
 * message, connection, and owner records live in D1.
 */
export function isReconstructableUserAgentStorageKey(key: string): boolean {
  return (
    RECONSTRUCTABLE_STORAGE_KEYS.has(key) ||
    (key.startsWith(RECONSTRUCTABLE_RESULT_PREFIX) && key.length > RECONSTRUCTABLE_RESULT_PREFIX.length)
  );
}

export class Me3UserAgent {
  private readonly purgeStorage: DurableObjectStorage;
  private readonly cacheStorage: ReturnType<typeof createReconstructableStorage>;

  constructor(
    state: DurableObjectState,
    private readonly env: Env,
    private readonly dispatch = dispatchAgentSandboxTurn,
  ) {
    this.purgeStorage = state.storage;
    this.cacheStorage = createReconstructableStorage(state.storage);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/managed-lifecycle/purge-storage") {
      const installationId = request.headers.get("X-ME3-Managed-Installation") || "";
      if (
        !/^mi-[0-9a-f]{16}$/.test(installationId) ||
        installationId !== this.env.ME3_MANAGED_INSTALLATION_ID
      ) {
        return Response.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      // Safe only because dispatch storage is runtime-enforced as D1-backed
      // cache/metadata by createReconstructableStorage.
      await this.purgeStorage.deleteAll();
      const remaining = await this.purgeStorage.list({ limit: 1 });
      if (remaining.size > 0) {
        return Response.json(
          { ok: false, error: "Durable Object storage purge did not complete" },
          { status: 503 },
        );
      }
      return Response.json({ ok: true, purged: true });
    }

    if (request.method === "POST" && url.pathname === "/dispatch/sandbox") {
      const input = await request.json().catch(() => null);
      if (!isAgentSandboxDispatchInput(input)) {
        return Response.json(
          { ok: false, error: "Invalid sandbox dispatch payload" },
          { status: 400 },
        );
      }

      const response = await this.dispatch(
        this.env,
        this.cacheStorage,
        input,
      );
      return Response.json(response, { status: response.ok ? 200 : 500 });
    }

    if (request.method === "POST" && url.pathname === "/dispatch/sandbox/stream") {
      const input = await request.json().catch(() => null);
      if (!isAgentSandboxDispatchInput(input)) {
        return Response.json(
          { ok: false, error: "Invalid sandbox dispatch payload" },
          { status: 400 },
        );
      }
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          let visibleText = "";
          const send = (event: string, data: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          };
          const forward = async (event: AgentChatRuntimeStreamEvent) => {
            if (event.event === "delta" && typeof event.data.text === "string") {
              visibleText += event.data.text;
            }
            if (
              (event.event === "tool" && event.data.clearText === true) ||
              (event.event === "status" && event.data.replaceText === true)
            ) {
              visibleText = "";
            }
            send(event.event, event.data);
          };
          try {
            const response = await this.dispatch(
              this.env,
              this.cacheStorage,
              input,
              { signal: request.signal, onEvent: forward },
            );
            const finalText = response.replyText || "";
            if (visibleText !== finalText) {
              send("status", { state: "finalizing", replaceText: true });
              if (finalText) send("delta", { text: finalText });
            }
            send("done", response as unknown as Record<string, unknown>);
          } catch (error) {
            if (request.signal.aborted || isAbortError(error)) {
              send("status", { state: "cancelled" });
            } else {
              send("error", {
                ok: false,
                error: error instanceof Error ? error.message : "Agent stream failed",
              });
            }
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    if (url.pathname.endsWith("/health")) {
      return Response.json({
        ok: true,
        service: "me3-core-user-agent",
        storage: Boolean(this.purgeStorage),
        ai: Boolean(this.env.AI),
      });
    }

    return Response.json(
      {
        ok: true,
        message: "The ME3 user agent is ready for the first extraction slice.",
      },
      { status: 202 },
    );
  }
}

function createReconstructableStorage(storage: DurableObjectStorage) {
  const assertKey = (key: string) => {
    if (!isReconstructableUserAgentStorageKey(key)) {
      throw new Error("Durable Object storage key is not reconstructable from D1");
    }
  };
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      assertKey(key);
      return storage.get<T>(key);
    },
    async put<T = unknown>(key: string, value: T): Promise<void> {
      assertKey(key);
      await storage.put(key, value);
    },
    async delete(key: string | string[]): Promise<void> {
      const keys = Array.isArray(key) ? key : [key];
      for (const item of keys) assertKey(item);
      if (Array.isArray(key)) await storage.delete(key);
      else await storage.delete(key);
    },
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
