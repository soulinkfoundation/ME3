import {
  fromAnthropicToolResponse,
  fromOpenAiToolResponse,
  fromWorkersAiToolResponse,
  toAnthropicToolRequest,
  toOpenAiToolRequest,
  toWorkersAiToolRequest,
  type AgentToolDefinition,
  type AgentToolMessage,
  type AgentToolModelResponse,
} from "./tool-runtime";
import {
  externalProviderGatewayUrl,
  openAiCompatibleReasoningEffort,
  workersAiGatewayRunOptions,
  type AgentChatAiRoute,
} from "./model-runtime";

export async function runAgentToolModelStep(
  route: AgentChatAiRoute,
  messages: readonly AgentToolMessage[],
  tools: readonly AgentToolDefinition[],
  requiredToolName?: string,
): Promise<AgentToolModelResponse> {
  const toolChoice = requiredToolName ? { name: requiredToolName } : undefined;
  if (route.providerId === "workers-ai") {
    if (!route.ai) throw new Error("Workers AI binding is not configured");
    const options = workersAiGatewayRunOptions(route);
    const anthropicModel = isAnthropicUnifiedModel(route.model);
    const reasoningEffort = openAiCompatibleReasoningEffort(route.model);
    const request = anthropicModel
      ? { max_tokens: 800, ...toAnthropicToolRequest(messages, tools, toolChoice) }
      : {
          ...toWorkersAiToolRequest(messages, tools, toolChoice),
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        };
    const result = options
      ? await route.ai.run(route.model, request, options)
      : await route.ai.run(route.model, request);
    const response = anthropicModel
      ? fromAnthropicToolResponse(result)
      : fromWorkersAiToolResponse(result);
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
    const gatewayUrl = externalProviderGatewayUrl(
      route,
      "openai",
      "chat/completions",
    );
    const response = await fetch(
      gatewayUrl || "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: providerHeaders(route, "openai", Boolean(gatewayUrl)),
        body: JSON.stringify({
          model: route.model,
          ...toOpenAiToolRequest(messages, tools, toolChoice),
          ...(openAiCompatibleReasoningEffort(route.model)
            ? { reasoning_effort: openAiCompatibleReasoningEffort(route.model) }
            : {}),
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) throwProviderResponseError("OpenAI", response.status, payload);
    const result = fromOpenAiToolResponse(payload);
    if (result.usage) await route.recordUsage?.({ model: route.model, usage: result.usage });
    return result;
  }

  const gatewayUrl = externalProviderGatewayUrl(
    route,
    "anthropic",
    "v1/messages",
  );
  const response = await fetch(
    gatewayUrl || "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: providerHeaders(route, "anthropic", Boolean(gatewayUrl)),
      body: JSON.stringify({
        model: route.model,
        max_tokens: 800,
        ...toAnthropicToolRequest(messages, tools, toolChoice),
      }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) throwProviderResponseError("Anthropic", response.status, payload);
  const result = fromAnthropicToolResponse(payload);
  if (result.usage) await route.recordUsage?.({ model: route.model, usage: result.usage });
  return result;
}

function isAnthropicUnifiedModel(model: string): boolean {
  return model.trim().toLowerCase().replace(/^@cf\//, "").startsWith("anthropic/");
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

function throwProviderResponseError(
  provider: string,
  status: number,
  payload: unknown,
): never {
  const error =
    payload && typeof payload === "object"
      ? (payload as { error?: { message?: unknown } }).error
      : null;
  throw new Error(
    typeof error?.message === "string" && error.message.trim()
      ? error.message
      : `${provider} request failed (${status})`,
  );
}
