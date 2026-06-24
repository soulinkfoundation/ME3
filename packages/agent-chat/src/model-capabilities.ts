export type AiAgentModelProviderId = "workers-ai" | "openai" | "anthropic";

export type AiAgentModelCapability =
  | "text"
  | "vision"
  | "image_input"
  | "image_generation"
  | "image_edit"
  | "long-context"
  | "reasoning"
  | "tool-use";

export type AssistantImageCapability = "image_generation" | "image_edit";

type AiModelCapabilityRecord = {
  providerId: AiAgentModelProviderId;
  model: string;
  capabilities: AiAgentModelCapability[];
  image?: {
    generation?: boolean;
    edit?: boolean;
    sizes?: string[];
    formats?: Array<"png" | "jpeg" | "webp">;
    maxInputImages?: number;
  };
};

export const DEFAULT_WORKERS_AI_IMAGE_GENERATION_MODEL =
  "@cf/black-forest-labs/flux-2-klein-4b";

const AI_MODEL_CAPABILITY_RECORDS: readonly AiModelCapabilityRecord[] = [
  {
    providerId: "workers-ai",
    model: DEFAULT_WORKERS_AI_IMAGE_GENERATION_MODEL,
    capabilities: ["image_generation"],
    image: {
      generation: true,
      sizes: ["1024x1024"],
      formats: ["png"],
    },
  },
];

export function modelSupportsCapability(
  providerId: AiAgentModelProviderId,
  model: string,
  capability: AssistantImageCapability,
): boolean {
  const record = findModelCapabilityRecord(providerId, model);
  if (!record) return false;
  return record.capabilities.includes(capability);
}

export function modelSupportsImageInput(
  providerId: AiAgentModelProviderId,
  model: string,
): boolean {
  const record = findModelCapabilityRecord(providerId, model);
  if (!record) return false;
  return (
    record.capabilities.includes("image_input") ||
    record.capabilities.includes("vision")
  );
}

function findModelCapabilityRecord(
  providerId: AiAgentModelProviderId,
  model: string,
): AiModelCapabilityRecord | null {
  const normalizedModel = model.trim().toLowerCase();
  return (
    AI_MODEL_CAPABILITY_RECORDS.find(
      (record) =>
        record.providerId === providerId &&
        record.model.trim().toLowerCase() === normalizedModel,
    ) || null
  );
}
