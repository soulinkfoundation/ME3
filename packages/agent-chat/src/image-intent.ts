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
  if (isImagePromptDraftingRequest(text)) {
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

function isImagePromptDraftingRequest(value: string): boolean {
  const text = value.toLowerCase();
  const promptIndex = findImageIntentWord(text, "prompt");
  if (promptIndex === -1) return false;

  const beforePrompt = text.slice(0, promptIndex).trimEnd();
  if (hasImagePromptDraftingAction(beforePrompt)) return true;

  const afterPrompt = text.slice(promptIndex + "prompt".length).trimStart();
  if (!afterPrompt.startsWith("for ")) return false;
  return containsImagePromptNoun(afterPrompt.slice("for ".length));
}

function hasImagePromptDraftingAction(value: string): boolean {
  let prefix = value;
  const imageNoun = findTrailingImagePromptNoun(prefix);
  if (imageNoun) prefix = prefix.slice(0, prefix.length - imageNoun.length).trimEnd();
  if (prefix.endsWith(" an")) prefix = prefix.slice(0, -3).trimEnd();
  else if (prefix.endsWith(" a")) prefix = prefix.slice(0, -2).trimEnd();

  return ["write", "draft", "compose", "improve", "rewrite", "turn this into"].some(
    (action) => endsWithImageIntentPhrase(prefix, action),
  );
}

function findTrailingImagePromptNoun(value: string): string | null {
  for (const noun of ["image", "picture", "photo", "illustration", "graphic", "artwork"]) {
    if (endsWithImageIntentPhrase(value, noun)) return noun;
  }
  return null;
}

function containsImagePromptNoun(value: string): boolean {
  return ["image", "picture", "photo", "illustration", "graphic", "artwork"].some(
    (noun) => findImageIntentWord(value, noun) !== -1,
  );
}

function endsWithImageIntentPhrase(value: string, phrase: string): boolean {
  if (!value.endsWith(phrase)) return false;
  const prefixIndex = value.length - phrase.length - 1;
  return prefixIndex < 0 || !isImageIntentWordCharacter(value[prefixIndex]);
}

function findImageIntentWord(value: string, word: string): number {
  let index = value.indexOf(word);
  while (index !== -1) {
    const afterIndex = index + word.length;
    if (
      (index === 0 || !isImageIntentWordCharacter(value[index - 1])) &&
      (afterIndex === value.length || !isImageIntentWordCharacter(value[afterIndex]))
    ) {
      return index;
    }
    index = value.indexOf(word, index + 1);
  }
  return -1;
}

function isImageIntentWordCharacter(value: string): boolean {
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || value === "_";
}
