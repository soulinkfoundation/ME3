import { describe, expect, it } from "vitest";
import {
  AI_AGENT_MODEL_OPTIONS,
  aiAgentModelOptionIsAvailable,
} from "./aiModelCatalog";

function visibleLabels(configuredProviderIds: string[]) {
  const configured = new Set(configuredProviderIds);
  return AI_AGENT_MODEL_OPTIONS.filter((option) =>
    aiAgentModelOptionIsAvailable(option, configured),
  ).map((option) => option.label);
}

describe("AI model catalog", () => {
  it("keeps Workers AI visible and hides API-key providers until configured", () => {
    expect(visibleLabels([])).toEqual([
      "GLM 4.7 Flash",
      "GLM 5.2",
      "Qwen3",
      "GPT-OSS 120B",
      "Kimi K2.7",
      "Deepseek R1",
    ]);

    expect(visibleLabels(["openai"])).toContain("GPT-4o");
    expect(visibleLabels(["openai"])).not.toContain("Claude Sonnet 4.6");
  });
});
