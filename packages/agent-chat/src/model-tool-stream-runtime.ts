import {
  fromWorkersAiToolResponse,
  toAnthropicToolRequest,
  toOpenAiToolRequest,
  toWorkersAiToolRequest,
  parseAgentModelUsage,
  type AgentModelUsage,
  type AgentToolCall,
  type AgentToolDefinition,
  type AgentToolMessage,
  type AgentToolModelResponse,
} from "./tool-runtime";
import {
  externalProviderGatewayUrl,
  type AgentChatAiRoute,
} from "./model-runtime";

type StreamDelta = (text: string) => void | Promise<void>;

export async function runAgentToolModelStreamStep(
  route: AgentChatAiRoute,
  messages: readonly AgentToolMessage[],
  tools: readonly AgentToolDefinition[],
  onDelta: StreamDelta,
  signal?: AbortSignal,
): Promise<AgentToolModelResponse> {
  throwIfAborted(signal);
  if (route.providerId === "workers-ai") {
    if (!route.ai) throw new Error("Workers AI binding is not configured");
    const request = { ...toWorkersAiToolRequest(messages, tools), stream: true };
    const options = route.aiGateway?.routeWorkersAi && route.aiGateway.gatewayId
      ? { gateway: { id: route.aiGateway.gatewayId } }
      : undefined;
    const result = options
      ? await route.ai.run(route.model, request, options)
      : await route.ai.run(route.model, request);
    if (!isReadableStream(result)) {
      const response = fromWorkersAiToolResponse(result);
      if (response.text) await onDelta(response.text);
      if (response.usage) {
        await route.recordUsage?.({ model: route.model, usage: response.usage });
      }
      return response;
    }
    const response = await accumulateOpenAiCompatibleStream(
      result,
      onDelta,
      signal,
      "Workers AI",
    );
    if (response.usage) {
      await route.recordUsage?.({ model: route.model, usage: response.usage });
    }
    return response;
  }

  if (!route.apiKey) {
    throw new Error(
      `${route.providerId === "openai" ? "OpenAI" : "Anthropic"} API key is not configured`,
    );
  }

  if (route.providerId === "openai") {
    const gatewayUrl = externalProviderGatewayUrl(route, "openai", "chat/completions");
    const response = await fetch(
      gatewayUrl || "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: providerHeaders(route, "openai", Boolean(gatewayUrl)),
        signal,
        body: JSON.stringify({
          model: route.model,
          ...toOpenAiToolRequest(messages, tools),
          stream: true,
          stream_options: { include_usage: true },
        }),
      },
    );
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throwProviderResponseError("OpenAI", response.status, payload);
      throw new Error("OpenAI returned no response stream.");
    }
    const result = await accumulateOpenAiCompatibleStream(
      response.body,
      onDelta,
      signal,
      "OpenAI",
    );
    if (result.usage) await route.recordUsage?.({ model: route.model, usage: result.usage });
    return result;
  }

  const gatewayUrl = externalProviderGatewayUrl(route, "anthropic", "v1/messages");
  const response = await fetch(
    gatewayUrl || "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: providerHeaders(route, "anthropic", Boolean(gatewayUrl)),
      signal,
      body: JSON.stringify({
        model: route.model,
        max_tokens: 800,
        ...toAnthropicToolRequest(messages, tools),
        stream: true,
      }),
    },
  );
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) throwProviderResponseError("Anthropic", response.status, payload);
    throw new Error("Anthropic returned no response stream.");
  }
  const result = await accumulateAnthropicStream(response.body, onDelta, signal);
  if (result.usage) await route.recordUsage?.({ model: route.model, usage: result.usage });
  return result;
}

async function accumulateOpenAiCompatibleStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: StreamDelta,
  signal: AbortSignal | undefined,
  provider: "OpenAI" | "Workers AI",
): Promise<AgentToolModelResponse> {
  let text = "";
  let usage: AgentModelUsage | null = null;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  await readSseJson(stream, signal, async (payload) => {
    const root = asRecord(payload);
    if (!root) return;
    const resultRoot = asRecord(root.result) || root;
    usage = parseAgentModelUsage(resultRoot) || usage;
    if (root.error) throw new Error(providerErrorMessage(root.error, provider));
    if (typeof root.response === "string" && root.response) {
      text += root.response;
      await onDelta(root.response);
    }
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const choice = asRecord(choices[0]);
    const delta = asRecord(choice?.delta);
    const content = stringValue(delta?.content) || stringValue(delta?.refusal);
    if (content) {
      text += content;
      await onDelta(content);
    }
    const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
    for (const rawCall of toolCalls) {
      const call = asRecord(rawCall);
      const index = typeof call?.index === "number" ? call.index : calls.size;
      const fn = asRecord(call?.function);
      const current = calls.get(index) || { id: "", name: "", arguments: "" };
      current.id += stringValue(call?.id);
      current.name += stringValue(fn?.name);
      current.arguments += stringValue(fn?.arguments);
      calls.set(index, current);
    }
  });
  return {
    text,
    toolCalls: [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, call]) => ({
        id: call.id || `${provider === "OpenAI" ? "openai" : "workers_ai"}_call_${index + 1}`,
        name: requiredString(call.name, `${provider} tool name`),
        arguments: parseArguments(call.arguments, provider, call.name),
      })),
    ...(usage ? { usage } : {}),
  };
}

async function accumulateAnthropicStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: StreamDelta,
  signal?: AbortSignal,
): Promise<AgentToolModelResponse> {
  let text = "";
  let usage: AgentModelUsage | null = null;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  await readSseJson(stream, signal, async (payload) => {
    const event = asRecord(payload);
    if (!event) return;
    if (event.type === "message_start") {
      const message = asRecord(event.message);
      usage = message ? parseAgentModelUsage(message) || usage : usage;
    }
    if (event.type === "message_delta") {
      usage = parseAgentModelUsage(event) || usage;
    }
    if (event.type === "error") {
      throw new Error(providerErrorMessage(event.error, "Anthropic"));
    }
    const index = typeof event.index === "number" ? event.index : 0;
    const block = asRecord(event.content_block);
    if (event.type === "content_block_start" && block?.type === "tool_use") {
      calls.set(index, {
        id: stringValue(block.id),
        name: stringValue(block.name),
        arguments: "",
      });
    }
    if (event.type !== "content_block_delta") return;
    const delta = asRecord(event.delta);
    if (delta?.type === "text_delta") {
      const chunk = stringValue(delta.text);
      if (chunk) {
        text += chunk;
        await onDelta(chunk);
      }
    }
    if (delta?.type === "input_json_delta") {
      const call = calls.get(index);
      if (call) call.arguments += stringValue(delta.partial_json);
    }
  });
  return {
    text,
    toolCalls: [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => ({
        id: requiredString(call.id, "Anthropic tool id"),
        name: requiredString(call.name, "Anthropic tool name"),
        arguments: parseArguments(call.arguments, "Anthropic", call.name),
      })),
    ...(usage ? { usage } : {}),
  };
}

async function readSseJson(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
  consume: (payload: unknown) => void | Promise<void>,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const abort = () => void reader.cancel("aborted");
  signal?.addEventListener("abort", abort, { once: true });
  let buffer = "";
  try {
    while (true) {
      throwIfAborted(signal);
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data === "[DONE]") return;
        if (data) await consume(JSON.parse(data));
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    const data = buffer.trim().replace(/^data:\s?/, "");
    if (data && data !== "[DONE]") await consume(JSON.parse(data));
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

function providerHeaders(
  route: AgentChatAiRoute,
  provider: "openai" | "anthropic",
  gateway: boolean,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(provider === "openai"
      ? { Authorization: `Bearer ${route.apiKey}` }
      : { "x-api-key": route.apiKey || "", "anthropic-version": "2023-06-01" }),
    ...(gateway && route.aiGateway?.apiToken
      ? { "cf-aig-authorization": `Bearer ${route.aiGateway.apiToken}` }
      : {}),
  };
}

function throwProviderResponseError(provider: string, status: number, payload: unknown): never {
  const root = asRecord(payload);
  throw new Error(
    providerErrorMessage(root?.error, provider) || `${provider} request failed (${status})`,
  );
}

function providerErrorMessage(value: unknown, provider: string): string {
  const error = asRecord(value);
  const message = stringValue(error?.message);
  return message ? `${provider}: ${message}` : `${provider} stream failed.`;
}

function parseArguments(value: string, provider: string, toolName: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Report one provider-safe validation error below.
  }
  throw new Error(`${provider} returned invalid arguments for tool "${toolName}".`);
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return Boolean(value && typeof (value as ReadableStream<Uint8Array>).getReader === "function");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function requiredString(value: string, label: string): string {
  if (value) return value;
  throw new Error(`${label} is required.`);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("The operation was aborted.", "AbortError");
}
