import type { Env } from "./types";
import {
  dispatchAgentSandboxTurn,
  isAgentSandboxDispatchInput,
  type AgentChatRuntimeStreamEvent,
} from "./agent-chat";

export class Me3UserAgent {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
    private readonly dispatch = dispatchAgentSandboxTurn,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

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
        this.state.storage,
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
              this.state.storage,
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
        storage: Boolean(this.state.storage),
        ai: Boolean(this.env.AI),
      });
    }

    return Response.json(
      {
        ok: true,
        message: "ME3 Core user agent is ready for the first extraction slice.",
      },
      { status: 202 },
    );
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
