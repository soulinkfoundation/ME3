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
  type AgentChatAiRoute,
} from "./model-runtime";

export async function runAgentToolModelStep(
  route: AgentChatAiRoute,
  messages: readonly AgentToolMessage[],
  tools: readonly AgentToolDefinition[],
): Promise<AgentToolModelResponse> {
  if (route.providerId === "workers-ai") {
    if (!route.ai) throw new Error("Workers AI binding is not configured");
    const options =
      route.aiGateway?.routeWorkersAi && route.aiGateway.gatewayId
        ? { gateway: { id: route.aiGateway.gatewayId } }
        : undefined;
    const request = toWorkersAiToolRequest(messages, tools);
    const result = options
      ? await route.ai.run(route.model, request, options)
      : await route.ai.run(route.model, request);
    const response = fromWorkersAiToolResponse(result);
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
          ...toOpenAiToolRequest(messages, tools),
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
        ...toAnthropicToolRequest(messages, tools),
      }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) throwProviderResponseError("Anthropic", response.status, payload);
  const result = fromAnthropicToolResponse(payload);
  if (result.usage) await route.recordUsage?.({ model: route.model, usage: result.usage });
  return result;
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
