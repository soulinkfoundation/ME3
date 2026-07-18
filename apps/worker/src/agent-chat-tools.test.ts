import { describe, expect, it } from "vitest";
import {
  CORE_CHAT_CAPABILITIES,
  CORE_CHAT_TOOLS,
  getCoreChatToolByName,
  parseAgentReminderInput,
  validateCoreChatCapabilityContracts,
  validateCoreChatToolDefinitions,
} from "./agent-chat";

describe("Core chat tool contracts", () => {
  it("projects every action capability into one provider-safe tool", () => {
    expect(validateCoreChatCapabilityContracts()).toEqual([]);
    expect(validateCoreChatToolDefinitions()).toEqual([]);
    expect(CORE_CHAT_TOOLS).toHaveLength(CORE_CHAT_CAPABILITIES.length - 1);
    expect(CORE_CHAT_TOOLS.map((tool) => tool.capabilityId)).not.toContain(
      "core.agent-chat.conversation",
    );

    for (const tool of CORE_CHAT_TOOLS) {
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(tool.parameters).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      for (const property of Object.values(tool.parameters.properties)) {
        expect(property.type).toBeTruthy();
        expect(property.description.trim()).not.toBe("");
      }
    }
  });

  it("keeps mailbox arguments structured instead of descriptive strings", () => {
    expect(getCoreChatToolByName("core_mailbox_draft")).toMatchObject({
      capabilityId: "core.mailbox.draft",
      handlerRoute: "core.mailbox.draft",
      parameters: {
        required: ["to", "subject", "body"],
        additionalProperties: false,
        properties: {
          to: { type: "string", format: "email" },
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
    });
  });

  it("requires explicit Source evidence for grounded Social Suggestions", () => {
    expect(getCoreChatToolByName("core_social_suggestions_create")).toMatchObject({
      capabilityId: "core.social.suggestions.create",
      handlerRoute: "core.social.suggestions.create",
      parameters: {
        required: expect.arrayContaining([
          "sourceType",
          "sourceId",
          "quoteText",
          "quoteSourceExcerpt",
          "shortPostText",
          "shortPostSourceExcerpt",
          "threadText",
          "threadSourceExcerpt",
          "carouselOutlineText",
          "carouselSourceExcerpt",
        ]),
        additionalProperties: false,
        properties: {
          sourceType: { enum: ["journal", "mission_task"] },
          quoteSourceExcerpt: { type: "string" },
          shortPostSourceExcerpt: { type: "string" },
          threadSourceExcerpt: { type: "string" },
          carouselSourceExcerpt: { type: "string" },
        },
      },
    });
    const capability = CORE_CHAT_CAPABILITIES.find(
      (item) => item.id === "core.social.suggestions.create",
    );
    expect(capability?.examples.positive.join(" ")).toContain("Repurpose");
    expect(capability?.examples.negative.join(" ")).toContain("without reading");
    expect(capability?.examples.negative.join(" ")).toContain("Make up");
  });

  it("defines full reminder CRUD tools and accepts offset-aware timestamps", () => {
    expect(
      CORE_CHAT_TOOLS.filter((tool) =>
        tool.capabilityId.startsWith("core.reminders."),
      ).map((tool) => tool.capabilityId),
    ).toEqual([
      "core.reminders.list",
      "core.reminders.create",
      "core.reminders.update",
      "core.reminders.cancel",
    ]);
    expect(
      parseAgentReminderInput({
        title: "Call Sam",
        remindAt: "2026-07-10T09:00:00+01:00",
        timezone: "Europe/Dublin",
      }),
    ).toMatchObject({
      title: "Call Sam",
      remindAt: "2026-07-10T08:00:00.000Z",
      timezone: "Europe/Dublin",
    });
    expect(
      parseAgentReminderInput({
        title: "Call Sam",
        remindAt: "2026-07-10T09:00:00",
      }),
    ).toEqual({ error: "Reminder timestamp must include a timezone offset" });
  });
});
