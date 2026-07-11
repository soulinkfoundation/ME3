import { describe, expect, it } from "vitest";
import {
  CORE_CHAT_CAPABILITIES,
  planLegacyNativeToolTurn,
  validateCoreChatCapabilityContracts,
} from "./agent-chat";

const legacyScenarios = [
  ["Can you check my upcoming bookings this week?", "core.bookings.lookup"],
  ["Show my blog posts.", "core.sites.blog_post.list"],
  ["Read the blog post about agent context.", "core.sites.blog_post.read"],
  ["Create a draft blog post about agent runtimes.", "core.sites.blog_post.create"],
  ["Publish the draft blog post about content strategy.", "core.sites.blog_post.update"],
  ["Archive the old launch notes post.", "core.sites.blog_post.archive"],
  ["Read the mission context for project ME3 Launch.", "core.mission.context.read"],
] as const;

describe("legacy native tool compatibility router", () => {
  it.each(legacyScenarios)("routes %s", (messageText, capabilityId) => {
    expect(planLegacyNativeToolTurn({ messageText }).capabilityId).toBe(capabilityId);
  });

  it.each([
    "Remind me tomorrow at 9 to call Sam",
    "Show my Mission Control tasks",
    "Save an email draft to ada@example.com",
    "Write a social post for LinkedIn",
    "What tools can you access here?",
  ])("leaves Runtime v2 action routing to the model: %s", (messageText) => {
    expect(planLegacyNativeToolTurn({ messageText }).capabilityId)
      .toBe("core.agent-chat.conversation");
  });

  it("keeps capability contracts valid independently of routing", () => {
    expect(validateCoreChatCapabilityContracts()).toEqual([]);
    for (const capability of CORE_CHAT_CAPABILITIES) {
      expect(capability.ownerFacingLabel).toEqual(expect.any(String));
      expect(capability.handler.route).toEqual(expect.any(String));
      expect(capability.auditEventKind).toEqual(expect.any(String));
      expect(capability.examples.positive.length).toBeGreaterThan(0);
      expect(capability.examples.negative.length).toBeGreaterThan(0);
    }
  });
});
