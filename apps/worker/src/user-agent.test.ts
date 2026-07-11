import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), moduleDispatch: vi.fn() }));

vi.mock("./agent-chat", () => ({
  dispatchAgentSandboxTurn: mocks.moduleDispatch,
  isAgentSandboxDispatchInput: () => true,
}));

import { Me3UserAgent } from "./user-agent";

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.moduleDispatch.mockReset();
});

describe("ME3 user agent streaming", () => {
  it("streams lifecycle events and one exact persisted final reply", async () => {
    mocks.dispatch.mockImplementation(async (_env, _storage, _input, options) => {
      await options.onEvent({ event: "status", data: { state: "model_started" } });
      await options.onEvent({ event: "delta", data: { text: "Temporary text" } });
      await options.onEvent({
        event: "tool",
        data: { state: "started", clearText: true, capabilityId: "core.reminders.list" },
      });
      await options.onEvent({ event: "delta", data: { text: "Final reply." } });
      return response("Final reply.");
    });
    const agent = new Me3UserAgent(state(), {} as never, mocks.dispatch);
    const result = await agent.fetch(request());
    const text = await result.text();

    expect(result.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: status");
    expect(text).toContain("event: tool");
    expect(text.match(/event: delta/g)).toHaveLength(2);
    expect(text).not.toContain('"state":"finalizing"');
    expect(text).toContain('"replyText":"Final reply."');
    expect(text).toContain("event: done");
  });

  it("reconciles replayed or fallback text before done", async () => {
    mocks.dispatch.mockResolvedValue(response("Persisted final reply."));
    const agent = new Me3UserAgent(state(), {} as never, mocks.dispatch);
    const text = await (await agent.fetch(request())).text();

    expect(text).toContain('"state":"finalizing","replaceText":true');
    expect(text).toContain('event: delta\ndata: {"text":"Persisted final reply."}');
    expect(text).toContain("event: done");
  });

  it("propagates cancellation and never emits done", async () => {
    mocks.dispatch.mockImplementation((_env, _storage, _input, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      })
    );
    const controller = new AbortController();
    const agent = new Me3UserAgent(state(), {} as never, mocks.dispatch);
    const streamed = await agent.fetch(request(controller.signal));
    controller.abort();
    const text = await streamed.text();

    expect(text).toContain('"state":"cancelled"');
    expect(text).not.toContain("event: done");
  });
});

function state(): DurableObjectState {
  return { storage: {} } as DurableObjectState;
}

function request(signal?: AbortSignal): Request {
  return new Request("https://agent.internal/dispatch/sandbox/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ requestId: "request-1" }),
  });
}

function response(replyText: string) {
  return {
    ok: true,
    auditId: null,
    turnId: "turn-1",
    specialist: "core.agent-chat",
    replyText,
    model: "test-model",
    source: "workers-ai",
  };
}
