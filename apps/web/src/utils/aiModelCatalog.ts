export type AiAgentModelProviderId = "workers-ai" | "openai" | "anthropic";

export type AiAgentModelCapability =
  | "text"
  | "vision"
  | "long-context"
  | "reasoning"
  | "tool-use";

export type AiAgentModelOption = {
  id: string;
  label: string;
  providerId: AiAgentModelProviderId;
  model: string;
  description: string;
  runtimeLabel: string;
  costLabel: string;
  capabilities: AiAgentModelCapability[];
  badge?: string;
};

export const AI_AGENT_MODEL_OPTIONS: AiAgentModelOption[] = [
  {
    id: "workers-kimi-k2-6",
    label: "Kimi K2.6",
    providerId: "workers-ai",
    model: "@cf/moonshotai/kimi-k2.6",
    runtimeLabel: "Cloudflare Workers AI",
    costLabel: "Paid",
    capabilities: ["text", "long-context", "reasoning", "tool-use"],
    description: "Stronger frontier-scale Workers AI model for agentic work and tool use.",
  },
  {
    id: "workers-gpt-oss-120b",
    label: "GPT OSS 120B",
    providerId: "workers-ai",
    model: "@cf/openai/gpt-oss-120b",
    runtimeLabel: "Cloudflare Workers AI",
    costLabel: "Low cost",
    capabilities: ["text", "reasoning", "tool-use"],
    description: "Open-weight reasoning model hosted on Workers AI for agentic tasks.",
  },
  {
    id: "workers-glm-4-7-flash",
    label: "GLM-4.7 Flash",
    providerId: "workers-ai",
    model: "@cf/zai-org/glm-4.7-flash",
    runtimeLabel: "Cloudflare Workers AI",
    costLabel: "Cheap",
    capabilities: ["text", "long-context"],
    description: "Fast long-context Workers AI model for multilingual chat and summaries.",
  },
  {
    id: "workers-qwen3-30b",
    label: "Qwen3 30B",
    providerId: "workers-ai",
    model: "@cf/qwen/qwen3-30b-a3b-fp8",
    runtimeLabel: "Cloudflare Workers AI",
    costLabel: "Low cost",
    capabilities: ["text"],
    badge: "Default",
    description: "Friendly first-install default for everyday chat, writing, and light planning.",
  },
  {
    id: "workers-llama-4-scout",
    label: "Llama 4 Scout",
    providerId: "workers-ai",
    model: "@cf/meta/llama-4-scout-17b-16e-instruct",
    runtimeLabel: "Cloudflare Workers AI",
    costLabel: "Low cost",
    capabilities: ["text", "vision"],
    description: "Meta multimodal open model hosted on Workers AI for general assistant work.",
  },
  {
    id: "workers-qwq-32b",
    label: "QwQ 32B",
    providerId: "workers-ai",
    model: "@cf/qwen/qwq-32b",
    runtimeLabel: "Cloudflare Workers AI",
    costLabel: "Free",
    capabilities: ["text", "reasoning"],
    description: "Free reasoning model for slower, more careful answers.",
  },
  {
    id: "openai-gpt-5-5",
    label: "GPT-5.5",
    providerId: "openai",
    model: "gpt-5.5",
    runtimeLabel: "OpenAI",
    costLabel: "Paid",
    capabilities: ["text", "vision", "long-context", "reasoning", "tool-use"],
    description: "OpenAI flagship for complex reasoning, coding, and agentic workflows.",
  },
  {
    id: "openai-gpt-5-2",
    label: "GPT-5.2",
    providerId: "openai",
    model: "gpt-5.2",
    runtimeLabel: "OpenAI",
    costLabel: "Paid",
    capabilities: ["text", "vision", "long-context", "reasoning", "tool-use"],
    description: "Earlier OpenAI reasoning model for complex coding and agentic workflows.",
  },
  {
    id: "openai-gpt-5-mini",
    label: "GPT-5 mini",
    providerId: "openai",
    model: "gpt-5-mini",
    runtimeLabel: "OpenAI",
    costLabel: "Low cost",
    capabilities: ["text", "reasoning", "tool-use"],
    description: "Cost-optimized OpenAI model for everyday chat and lighter agent tasks.",
  },
  {
    id: "openai-gpt-5-nano",
    label: "GPT-5 nano",
    providerId: "openai",
    model: "gpt-5-nano",
    runtimeLabel: "OpenAI",
    costLabel: "Cheapest",
    capabilities: ["text"],
    description: "Lowest-cost OpenAI option for simple instruction following and extraction.",
  },
  {
    id: "openai-gpt-4o",
    label: "GPT-4o",
    providerId: "openai",
    model: "gpt-4o",
    runtimeLabel: "OpenAI",
    costLabel: "Paid",
    capabilities: ["text", "vision", "tool-use"],
    description: "Familiar multimodal OpenAI model with broad compatibility.",
  },
  {
    id: "openai-gpt-4o-mini",
    label: "GPT-4o mini",
    providerId: "openai",
    model: "gpt-4o-mini",
    runtimeLabel: "OpenAI",
    costLabel: "Cheap",
    capabilities: ["text", "vision", "tool-use"],
    description: "Very inexpensive OpenAI option for quick chat, drafting, and extraction.",
  },
  {
    id: "openai-gpt-4-1",
    label: "GPT-4.1",
    providerId: "openai",
    model: "gpt-4.1",
    runtimeLabel: "OpenAI",
    costLabel: "Paid",
    capabilities: ["text", "long-context", "tool-use"],
    description: "Strong non-reasoning OpenAI model for reliable instruction following.",
  },
  {
    id: "anthropic-opus-4-6",
    label: "Claude Opus 4.6",
    providerId: "anthropic",
    model: "claude-opus-4-6",
    runtimeLabel: "Anthropic",
    costLabel: "Paid",
    capabilities: ["text", "vision", "long-context", "reasoning", "tool-use"],
    description: "Paid Claude model for the hardest planning and reasoning work.",
  },
  {
    id: "anthropic-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    providerId: "anthropic",
    model: "claude-sonnet-4-6",
    runtimeLabel: "Anthropic",
    costLabel: "Paid",
    capabilities: ["text", "vision", "long-context", "reasoning", "tool-use"],
    description: "Paid Claude model with a strong speed and intelligence balance.",
  },
  {
    id: "anthropic-haiku-4-5",
    label: "Claude Haiku 4.5",
    providerId: "anthropic",
    model: "claude-haiku-4-5",
    runtimeLabel: "Anthropic",
    costLabel: "Low cost",
    capabilities: ["text", "vision", "tool-use"],
    description: "Fast lower-cost Claude option for lighter assistant work.",
  },
  {
    id: "anthropic-haiku-3-5-latest",
    label: "Claude Haiku 3.5",
    providerId: "anthropic",
    model: "claude-3-5-haiku-latest",
    runtimeLabel: "Anthropic",
    costLabel: "Cheapest",
    capabilities: ["text", "tool-use"],
    description: "Cheapest Claude option for simple replies, classification, and extraction.",
  },
];
