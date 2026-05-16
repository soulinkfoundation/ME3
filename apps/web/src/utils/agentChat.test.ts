import { describe, expect, it } from "vitest";
import {
  formatAgentRuntimeDetail,
  formatAgentRuntimeMetadata,
  resolveAgentReplyText,
} from "./agentChat";

describe("agent chat utils", () => {
  it("hides runtime metadata by default", () => {
    expect(
      formatAgentRuntimeMetadata({
        specialist: "supervisor.reminders.create",
        replyText: "All set",
        model: "gpt-4o-mini",
        source: "openai",
      }),
    ).toBeNull();
  });

  it("formats runtime metadata when explicitly enabled", () => {
    expect(
      formatAgentRuntimeMetadata(
        {
          specialist: "supervisor.reminders.create",
          replyText: "All set",
          model: "gpt-4o-mini",
          source: "openai",
        },
        { showRuntimeMetadata: true },
      ),
    ).toBe("openai · gpt-4o-mini · supervisor.reminders.create");
  });

  it("includes context summaries in development metadata", () => {
    expect(
      formatAgentRuntimeMetadata(
        {
          specialist: "core.agent-chat",
          replyText: "All set",
          model: "gpt-4o-mini",
          source: "openai",
          contextSummary: "Used context from: 1 contact.",
        },
        { showRuntimeMetadata: true },
      ),
    ).toBe("openai · gpt-4o-mini · core.agent-chat · Used context from: 1 contact.");
  });

  it("combines fallback detail when both values exist", () => {
    expect(
      formatAgentRuntimeDetail({
        fallbackReason: "provider_timeout",
        debugError: "gateway unavailable",
      }),
    ).toBe("provider_timeout: gateway unavailable");
  });

  it("returns a friendly fallback when reply text is empty", () => {
    expect(resolveAgentReplyText("   ")).toBe(
      "I couldn't turn that into a useful reply just yet. Please try again.",
    );
  });
});
