import type { Me3AgentCapabilitySchema } from "@me3/knowledge";

export const MAX_AGENT_TOOL_MODEL_STEPS = 4;

export type AgentToolDefinition = {
  name: string;
  description: string;
  parameters: Me3AgentCapabilitySchema;
};

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentToolMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string;
      toolCalls?: undefined;
    }
  | {
      role: "assistant";
      content: string;
      toolCalls: readonly AgentToolCall[];
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
      name: string;
      isError: boolean;
    };

export type AgentToolModelResponse = {
  text: string;
  toolCalls: readonly AgentToolCall[];
};

export type AgentToolLoopResult = {
  text: string;
  messages: readonly AgentToolMessage[];
  modelSteps: number;
  executedToolCalls: number;
};

export type AgentToolModel = (
  messages: readonly AgentToolMessage[],
  tools: readonly AgentToolDefinition[],
) => Promise<AgentToolModelResponse>;

export type AgentToolExecutor = (
  call: AgentToolCall,
  tool: AgentToolDefinition,
) => Promise<unknown>;

export async function runAgentToolLoop(input: {
  messages: readonly AgentToolMessage[];
  tools: readonly AgentToolDefinition[];
  model: AgentToolModel;
  executeTool: AgentToolExecutor;
  maxModelSteps?: number;
}): Promise<AgentToolLoopResult> {
  if (
    input.maxModelSteps !== undefined &&
    (!Number.isInteger(input.maxModelSteps) || input.maxModelSteps < 1)
  ) {
    throw new Error("Agent tool loop maxModelSteps must be a positive integer.");
  }

  const maxModelSteps = Math.min(
    input.maxModelSteps ?? MAX_AGENT_TOOL_MODEL_STEPS,
    MAX_AGENT_TOOL_MODEL_STEPS,
  );
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const messages = [...input.messages];
  let executedToolCalls = 0;

  for (let modelSteps = 1; modelSteps <= maxModelSteps; modelSteps += 1) {
    const response = await input.model(messages, input.tools);
    const text = response.text.trim();

    if (response.toolCalls.length === 0) {
      if (!text) {
        throw new Error("Agent model returned neither text nor tool calls.");
      }
      messages.push({ role: "assistant", content: text });
      return { text, messages, modelSteps, executedToolCalls };
    }

    messages.push({
      role: "assistant",
      content: text,
      toolCalls: response.toolCalls,
    });

    // Side-effecting tools stay sequential until the policy layer can prove
    // that a group is safe to run in parallel.
    for (const call of response.toolCalls) {
      const tool = toolsByName.get(call.name);
      if (!tool) {
        messages.push(toolErrorMessage(call, `Unknown tool "${call.name}".`));
        continue;
      }

      try {
        const result = await input.executeTool(call, tool);
        executedToolCalls += 1;
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: serializeToolResult(result),
          isError: false,
        });
      } catch (error) {
        messages.push(toolErrorMessage(call, errorMessage(error)));
      }
    }
  }

  throw new Error(
    `Agent tool loop reached its ${maxModelSteps}-step limit without a final reply.`,
  );
}

export function toOpenAiToolRequest(
  messages: readonly AgentToolMessage[],
  tools: readonly AgentToolDefinition[],
): Record<string, unknown> {
  return {
    messages: messages.map((message) => {
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: message.content,
        };
      }
      if (message.toolCalls) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          })),
        };
      }
      return { role: message.role, content: message.content };
    }),
    tools: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: strictOpenAiSchema(tool.parameters),
        strict: true,
      },
    })),
    parallel_tool_calls: false,
  };
}

export function fromOpenAiToolResponse(payload: unknown): AgentToolModelResponse {
  const root = asRecord(payload);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  const message = asRecord(choice?.message);
  if (!message) {
    throw new Error(
      providerError(root, "OpenAI") || "OpenAI returned no assistant message.",
    );
  }

  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return {
    text: extractText(message.content) || extractText(message.refusal),
    toolCalls: rawCalls.map((value, index) =>
      parseOpenAiToolCall(value, index),
    ),
  };
}

export function toAnthropicToolRequest(
  messages: readonly AgentToolMessage[],
  tools: readonly AgentToolDefinition[],
): Record<string, unknown> {
  const turns: Array<Record<string, unknown>> = [];
  let toolResults: Array<Record<string, unknown>> = [];

  const flushToolResults = () => {
    if (toolResults.length === 0) return;
    turns.push({ role: "user", content: toolResults });
    toolResults = [];
  };

  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      toolResults.push({
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
        ...(message.isError ? { is_error: true } : {}),
      });
      continue;
    }

    flushToolResults();
    if (message.toolCalls) {
      turns.push({
        role: "assistant",
        content: [
          ...(message.content
            ? [{ type: "text", text: message.content }]
            : []),
          ...message.toolCalls.map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.arguments,
          })),
        ],
      });
    } else {
      turns.push({ role: message.role, content: message.content });
    }
  }
  flushToolResults();

  return {
    system: messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n"),
    messages: turns,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
      strict: true,
    })),
  };
}

export function fromAnthropicToolResponse(
  payload: unknown,
): AgentToolModelResponse {
  const root = asRecord(payload);
  if (!root) throw new Error("Anthropic returned an invalid response.");
  const error = providerError(root, "Anthropic");
  if (error) throw new Error(error);
  const content = Array.isArray(root.content) ? root.content : [];
  const toolCalls: AgentToolCall[] = [];
  const text: string[] = [];

  for (const value of content) {
    const block = asRecord(value);
    if (block?.type === "text" && typeof block.text === "string") {
      text.push(block.text);
    }
    if (block?.type === "tool_use") {
      toolCalls.push({
        id: requiredString(block.id, "Anthropic tool call id"),
        name: requiredString(block.name, "Anthropic tool name"),
        arguments: parseToolArguments(
          block.input,
          "Anthropic",
          typeof block.name === "string" ? block.name : "unknown",
        ),
      });
    }
  }

  return { text: text.join("").trim(), toolCalls };
}

export function toWorkersAiToolRequest(
  messages: readonly AgentToolMessage[],
  tools: readonly AgentToolDefinition[],
): Record<string, unknown> {
  return toOpenAiToolRequest(messages, tools);
}

export function fromWorkersAiToolResponse(
  payload: unknown,
): AgentToolModelResponse {
  const root = asRecord(payload);
  if (!root) throw new Error("Workers AI returned an invalid response.");
  const error = providerError(root, "Workers AI");
  if (error) throw new Error(error);
  const result = asRecord(root.result) || root;
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const message = asRecord(asRecord(choices[0])?.message);
  const rawCalls = Array.isArray(result.tool_calls)
    ? result.tool_calls
    : Array.isArray(message?.tool_calls)
      ? message.tool_calls
      : [];

  return {
    text: extractText(result.response) || extractText(message?.content),
    toolCalls: rawCalls.map((value, index) =>
      parseWorkersAiToolCall(value, index),
    ),
  };
}

function strictOpenAiSchema(
  schema: Me3AgentCapabilitySchema,
): Me3AgentCapabilitySchema {
  const required = new Set(schema.required || []);
  return {
    ...schema,
    required: Object.keys(schema.properties),
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => {
        if (required.has(name)) return [name, property];
        const types =
          typeof property.type === "string" ? [property.type] : property.type;
        return [
          name,
          {
            ...property,
            type: types.includes("null") ? types : [...types, "null"],
            ...(property.enum
              ? {
                  enum: property.enum.includes(null)
                    ? property.enum
                    : [...property.enum, null],
                }
              : {}),
          },
        ];
      }),
    ),
  };
}

function parseOpenAiToolCall(value: unknown, index: number): AgentToolCall {
  const call = asRecord(value);
  const fn = asRecord(call?.function);
  const name = requiredString(fn?.name, "OpenAI tool name");
  return {
    id:
      typeof call?.id === "string" && call.id
        ? call.id
        : `openai_call_${index + 1}`,
    name,
    arguments: parseToolArguments(fn?.arguments, "OpenAI", name),
  };
}

function parseWorkersAiToolCall(value: unknown, index: number): AgentToolCall {
  const call = asRecord(value);
  const fn = asRecord(call?.function);
  const name = requiredString(fn?.name ?? call?.name, "Workers AI tool name");
  return {
    id:
      typeof call?.id === "string" && call.id
        ? call.id
        : `workers_ai_call_${index + 1}`,
    name,
    arguments: parseToolArguments(
      fn?.arguments ?? call?.arguments,
      "Workers AI",
      name,
    ),
  };
}

function parseToolArguments(
  value: unknown,
  provider: string,
  toolName: string,
): Record<string, unknown> {
  if (typeof value === "string") {
    if (!value.trim()) return {};
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error(
        `${provider} returned invalid JSON arguments for tool "${toolName}".`,
      );
    }
  }
  const record = asRecord(value);
  if (record) return record;
  throw new Error(
    `${provider} returned non-object arguments for tool "${toolName}".`,
  );
}

function requiredString(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${label} is missing.`);
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      const block = asRecord(part);
      return typeof block?.text === "string" ? block.text : "";
    })
    .join("")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function serializeToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function toolErrorMessage(call: AgentToolCall, message: string): AgentToolMessage {
  return {
    role: "tool",
    toolCallId: call.id,
    name: call.name,
    content: JSON.stringify({ ok: false, error: message }),
    isError: true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Tool execution failed.";
}

function providerError(
  payload: Record<string, unknown> | null,
  provider: string,
): string | null {
  const error = asRecord(payload?.error);
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const firstError = asRecord(errors[0]);
  const message = error?.message ?? firstError?.message ?? payload?.error;
  return typeof message === "string" && message.trim()
    ? `${provider}: ${message.trim()}`
    : null;
}
