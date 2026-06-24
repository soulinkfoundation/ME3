import type { AssistantImageCapability } from "./model-capabilities";

export type AssistantImageTurnIntent =
  | {
      kind: "none";
      capability: null;
    }
  | {
      kind: "generate" | "edit" | "ambiguous";
      capability: AssistantImageCapability;
      reason: string;
    };

type ImageIntentAttachment = {
  kind?: string | null;
  mimeType?: string | null;
};

const GENERATE_VERB_PATTERN =
  /\b(generate|create|make|draw|illustrate|render|design|produce)\b/i;
const IMAGE_NOUN_PATTERN =
  /\b(image|picture|photo|photograph|illustration|graphic|artwork|banner|poster|thumbnail|cover|avatar|logo|icon|visual)\b/i;
const EXPLICIT_GENERATION_PATTERN =
  /\b(generate|create|make|draw|illustrate|render|design|produce)\s+(?:an?\s+)?(?:new\s+)?(?:image|picture|photo|photograph|illustration|graphic|artwork|banner|poster|thumbnail|cover|avatar|logo|icon|visual)\b/i;
const PROMPT_DRAFTING_PATTERN =
  /\b(write|draft|compose|improve|rewrite|turn\s+this\s+into)\s+(?:an?\s+)?(?:image|picture|photo|illustration|graphic|artwork)?\s*prompt\b|\bprompt\s+for\s+(?:an?\s+)?(?:image|picture|photo|illustration|graphic|artwork)\b/i;
const IMAGE_UNDERSTANDING_PATTERN =
  /\b(analy[sz]e|describe|caption|summari[sz]e|explain|identify|read|inspect|what(?:'s| is)\s+in)\b.*\b(image|picture|photo|screenshot|attachment)\b/i;
const EDIT_PATTERN =
  /\b(edit|clean\s+up|cleanup|retouch|modify|change|remove|replace|upscale|enhance|use\s+this|use\s+the\s+uploaded|turn\s+this\s+into|make\s+(?:it|this)\s+(?:cleaner|better|sharper))\b/i;
const AMBIGUOUS_PATTERN =
  /\b(make|create|design)\s+(?:this|it)\s+(?:more\s+)?visual\b/i;

export function classifyAssistantImageIntent(
  messageText: string,
  attachments: ImageIntentAttachment[] | null | undefined = null,
): AssistantImageTurnIntent {
  const text = messageText.trim();
  if (!text) return { kind: "none", capability: null };
  if (PROMPT_DRAFTING_PATTERN.test(text)) {
    return { kind: "none", capability: null };
  }
  if (IMAGE_UNDERSTANDING_PATTERN.test(text)) {
    return { kind: "none", capability: null };
  }

  const hasImageAttachment = Boolean(
    attachments?.some(
      (attachment) =>
        attachment?.kind === "image" ||
        String(attachment?.mimeType || "").toLowerCase().startsWith("image/"),
    ),
  );

  if (hasImageAttachment && EDIT_PATTERN.test(text)) {
    return {
      kind: "edit",
      capability: "image_edit",
      reason: "image attachment plus edit wording",
    };
  }

  if (EXPLICIT_GENERATION_PATTERN.test(text)) {
    return {
      kind: "generate",
      capability: "image_generation",
      reason: "explicit image generation wording",
    };
  }

  if (GENERATE_VERB_PATTERN.test(text) && IMAGE_NOUN_PATTERN.test(text)) {
    return {
      kind: "generate",
      capability: "image_generation",
      reason: "generation verb plus visual output noun",
    };
  }

  if (AMBIGUOUS_PATTERN.test(text)) {
    return {
      kind: "ambiguous",
      capability: "image_generation",
      reason: "ambiguous visual wording",
    };
  }

  return { kind: "none", capability: null };
}
