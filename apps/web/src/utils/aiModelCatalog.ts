export type AiAgentModelProviderId = "workers-ai" | "openai" | "anthropic";

export type AiAgentModelOption = {
  id: string;
  label: string;
  providerId: AiAgentModelProviderId;
  model: string;
  description: string;
  runtimeLabel: string;
  costLabel: string;
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
    description: "Stronger frontier-scale Workers AI model for agentic work and tool use.",
  },
  {
    id: "workers-qwen3-30b",
    label: "Qwen3 30B",
    providerId: "workers-ai",
    model: "@cf/qwen/qwen3-30b-a3b-fp8",
    runtimeLabel: "Cloudflare Workers AI",
    costLabel: "Low cost",
    badge: "Default",
    description: "Friendly first-install default for everyday chat, writing, and light planning.",
  },
  {
    id: "workers-qwq-32b",
    label: "QwQ 32B",
    providerId: "workers-ai",
    model: "@cf/qwen/qwq-32b",
    runtimeLabel: "Cloudflare Workers AI",
    costLabel: "Free",
    description: "Free reasoning model for slower, more careful answers.",
  },
  {
    id: "openai-gpt-5-5",
    label: "GPT-5.5",
    providerId: "openai",
    model: "gpt-5.5",
    runtimeLabel: "OpenAI",
    costLabel: "Paid",
    description: "Paid OpenAI flagship for the strongest agent work.",
  },
  {
    id: "anthropic-opus-4-7",
    label: "Claude Opus 4.7",
    providerId: "anthropic",
    model: "claude-opus-4-7",
    runtimeLabel: "Anthropic",
    costLabel: "Paid",
    description: "Paid Claude model for the hardest planning and reasoning work.",
  },
  {
    id: "anthropic-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    providerId: "anthropic",
    model: "claude-sonnet-4-6",
    runtimeLabel: "Anthropic",
    costLabel: "Paid",
    description: "Paid Claude model with a strong speed and intelligence balance.",
  },
];
