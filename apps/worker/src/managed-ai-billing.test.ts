import { describe, expect, it } from "vitest";
import {
  estimateManagedAiUsage,
  estimateManagedKimiK3Usage,
} from "../../../packages/agent-chat/src";

describe("managed Everyday AI billing", () => {
  it("prices Kimi K3 input, cached input, output, and the Unified Billing fee", () => {
    const uncached = estimateManagedKimiK3Usage({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 100_000,
    });
    expect(uncached.costUsd).toBeCloseTo(4.725, 8);
    expect(uncached.pricing).toBe("cloudflare-unified-kimi-k3-2026-07");

    expect(
      estimateManagedKimiK3Usage({
        inputTokens: 1_000_000,
        cachedInputTokens: 500_000,
        outputTokens: 100_000,
      }).costUsd,
    ).toBeCloseTo(3.3075, 8);
  });

  it("never counts more cached tokens than total input tokens", () => {
    expect(
      estimateManagedKimiK3Usage({
        inputTokens: 100,
        cachedInputTokens: 200,
        outputTokens: 0,
      }).costUsd,
    ).toBeCloseTo(0.0000315, 10);
  });

  it("uses the curated provider pricing for alternate managed models", () => {
    const claude = estimateManagedAiUsage("anthropic/claude-sonnet-4.6", {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 100_000,
      });
    expect(claude.costUsd).toBeCloseTo(4.725, 8);
    expect(claude).toMatchObject({
      pricing: "cloudflare-unified-claude-sonnet-4-6-2026-07",
    });
    const openai = estimateManagedAiUsage("openai/gpt-5.5", {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 100_000,
      });
    expect(openai.costUsd).toBeCloseTo(8.4, 8);
    expect(openai).toMatchObject({
      pricing: "cloudflare-unified-gpt-5-5-2026-07",
    });
  });
});
