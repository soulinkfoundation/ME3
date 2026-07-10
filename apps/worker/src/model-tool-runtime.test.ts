import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentToolModelStep } from "../../../packages/agent-chat/src/model-tool-runtime";
import type { AgentChatAiRoute } from "../../../packages/agent-chat/src/model-runtime";
import type { AgentToolDefinition } from "./agent-chat";

const TOOLS: readonly AgentToolDefinition[] = [
  {
    name: "core_reminders_list",
    description: "List reminders.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

afterEach(() => vi.unstubAllGlobals());

describe("live agent tool model adapters", () => {
  it("calls Workers AI through the native binding", async () => {
    const run = vi.fn(async () => ({
      tool_calls: [{ name: "core_reminders_list", arguments: {} }],
    }));
    const result = await runAgentToolModelStep(
      route("workers-ai", { ai: { run } }),
      [{ role: "user", content: "List reminders" }],
      TOOLS,
    );

    expect(run).toHaveBeenCalledWith(
      "test-model",
      expect.objectContaining({
        messages: [{ role: "user", content: "List reminders" }],
        tools: [expect.objectContaining({ name: "core_reminders_list" })],
      }),
    );
    expect(result.toolCalls[0]).toMatchObject({ name: "core_reminders_list" });
  });

  it("calls OpenAI Chat Completions with strict sequential tools", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "openai-1",
                  function: { name: "core_reminders_list", arguments: "{}" },
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await runAgentToolModelStep(
      route("openai", { apiKey: "openai-key" }),
      [{ role: "user", content: "List reminders" }],
      TOOLS,
    );
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));

    expect(body).toMatchObject({
      model: "test-model",
      parallel_tool_calls: false,
      tools: [{ type: "function", function: { strict: true } }],
    });
    expect(result.toolCalls[0]).toMatchObject({ id: "openai-1" });
  });

  it("calls Anthropic Messages with native tool-use schemas", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        content: [
          {
            type: "tool_use",
            id: "anthropic-1",
            name: "core_reminders_list",
            input: {},
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await runAgentToolModelStep(
      route("anthropic", { apiKey: "anthropic-key" }),
      [{ role: "user", content: "List reminders" }],
      TOOLS,
    );
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));

    expect(body).toMatchObject({
      model: "test-model",
      tools: [{ name: "core_reminders_list", strict: true }],
    });
    expect(result.toolCalls[0]).toMatchObject({ id: "anthropic-1" });
  });
});

function route(
  providerId: AgentChatAiRoute["providerId"],
  overrides: Partial<AgentChatAiRoute>,
): AgentChatAiRoute {
  return {
    providerId,
    model: "test-model",
    backupModel: null,
    apiKey: null,
    ai: null,
    aiGateway: null,
    configured: true,
    ...overrides,
  };
}
