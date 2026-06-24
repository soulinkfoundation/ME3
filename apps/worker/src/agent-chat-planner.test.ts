import { describe, expect, it } from "vitest";
import {
  CORE_CHAT_CAPABILITIES,
  planCoreChatToolTurn,
  validateCoreChatCapabilityContracts,
  type CoreChatCapabilityId,
  type CoreChatPlannerIntentKind,
  type CoreChatSideEffectLevel,
} from "./agent-chat";

type PlannerScenario = {
  name: string;
  messageText: string;
  hasRecentAssistantEmailDraft?: boolean;
  hasPendingMailboxDraftRecipient?: boolean;
  kind: CoreChatPlannerIntentKind;
  capabilityId: CoreChatCapabilityId;
  sideEffectLevel: CoreChatSideEffectLevel;
};

const plannerScenarios: PlannerScenario[] = [
  {
    name: "first-run setup and capability exploration stays conversational",
    messageText:
      "I am setting up ME3 for the first time. I want to explore what you can do, ie profile, calendar reminders/events, mission control, tasks, projects, and what context you have available. Make sense?",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "tool access question stays conversational",
    messageText: "What tools can you access here?",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "context availability question stays conversational",
    messageText: "What context do you have available about me?",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "multi-domain test prompt stays conversational",
    messageText: "I want to test reminders, calendar, and tasks.",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "direct reminder list request becomes a read action",
    messageText: "Do I have any pending reminders?",
    kind: "read_action",
    capabilityId: "core.reminders.list",
    sideEffectLevel: "read",
  },
  {
    name: "direct reminder create request becomes a write action",
    messageText: "Remind me tomorrow at 9 to follow up with Sam",
    kind: "write_action",
    capabilityId: "core.reminders.create",
    sideEffectLevel: "write",
  },
  {
    name: "weekday reminder create request becomes a write action",
    messageText: "Add reminder to get woodchips and tidy up garden saturday 8am",
    kind: "write_action",
    capabilityId: "core.reminders.create",
    sideEffectLevel: "write",
  },
  {
    name: "reminder create without a time asks for clarification",
    messageText: "Remind me to follow up with Sam",
    kind: "clarify",
    capabilityId: "core.reminders.create",
    sideEffectLevel: "none",
  },
  {
    name: "upcoming booking lookup becomes a read action",
    messageText: "Can you check my upcoming bookings this week?",
    kind: "read_action",
    capabilityId: "core.bookings.lookup",
    sideEffectLevel: "read",
  },
  {
    name: "booking template rewrite stays conversational",
    messageText:
      "This is my confirmation email for one of my offerings to set up me3. See can we trim it a little bit: 'Yesss {{ guestName }}! Then join my call room on {{ bookingTime }}. Buy a domain name on GoDaddy.com (or any other provider). Kind regards, Kieran'",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "mailbox draft save follow-up becomes a write action",
    messageText: "Save that draft to ada@example.com",
    hasRecentAssistantEmailDraft: true,
    kind: "write_action",
    capabilityId: "core.mailbox.draft",
    sideEffectLevel: "write",
  },
  {
    name: "pending mailbox draft recipient continuation becomes a write action",
    messageText: "ada@example.com",
    hasPendingMailboxDraftRecipient: true,
    kind: "write_action",
    capabilityId: "core.mailbox.draft",
    sideEffectLevel: "write",
  },
  {
    name: "email composition prompt stays conversational",
    messageText: "Create an email to Ada about the launch.",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "direct Mission Control task create becomes a write action",
    messageText: "Add a task to project ME3 Launch to follow up with Sam tomorrow.",
    kind: "write_action",
    capabilityId: "core.mission.task.create",
    sideEffectLevel: "write",
  },
  {
    name: "direct Mission Control task list becomes a read action",
    messageText: "Show backlog tasks for project ME3 Launch.",
    kind: "read_action",
    capabilityId: "core.mission.task.list",
    sideEffectLevel: "read",
  },
  {
    name: "generic project task list becomes a read action",
    messageText: "Can you list my project tasks?",
    kind: "read_action",
    capabilityId: "core.mission.task.list",
    sideEffectLevel: "read",
  },
  {
    name: "week review becomes a Mission Control read action",
    messageText: "Review my week",
    kind: "read_action",
    capabilityId: "core.mission.task.list",
    sideEffectLevel: "read",
  },
  {
    name: "Mission Control prioritisation stays conversational",
    messageText: "Help me prioritise my Mission Control tasks based on my goals.",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "Mission Control task exploration still stays conversational",
    messageText: "I want to test Mission Control tasks and projects.",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "direct Mission Control task update becomes a write action",
    messageText: "Mark task follow up with Sam as done.",
    kind: "write_action",
    capabilityId: "core.mission.task.update",
    sideEffectLevel: "write",
  },
  {
    name: "direct Mission Control task archive becomes a write action",
    messageText: "Delete task follow up with Sam.",
    kind: "write_action",
    capabilityId: "core.mission.task.archive",
    sideEffectLevel: "write",
  },
];

describe("Core chat tool planner", () => {
  it.each(plannerScenarios)("$name", (scenario) => {
    const decision = planCoreChatToolTurn({
      messageText: scenario.messageText,
      hasRecentAssistantEmailDraft: scenario.hasRecentAssistantEmailDraft,
      hasPendingMailboxDraftRecipient: scenario.hasPendingMailboxDraftRecipient,
    });

    expect(decision).toMatchObject({
      kind: scenario.kind,
      capabilityId: scenario.capabilityId,
      sideEffectLevel: scenario.sideEffectLevel,
    });
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.reason).toEqual(expect.any(String));
  });

  it("keeps Core chat capability contracts complete and planner-backed", () => {
    expect(validateCoreChatCapabilityContracts()).toEqual([]);

    const scenarioCapabilityIds = new Set(
      plannerScenarios.map((scenario) => scenario.capabilityId),
    );
    expect(CORE_CHAT_CAPABILITIES.map((capability) => capability.id)).toEqual(
      expect.arrayContaining(Array.from(scenarioCapabilityIds)),
    );

    for (const capability of CORE_CHAT_CAPABILITIES) {
      expect(capability.ownerFacingLabel).toEqual(expect.any(String));
      expect(capability.handler.route).toEqual(expect.any(String));
      expect(capability.auditEventKind).toEqual(expect.any(String));
      expect(capability.examples.positive.length).toBeGreaterThan(0);
      expect(capability.examples.negative.length).toBeGreaterThan(0);

      for (const prompt of capability.examples.positive) {
        const decision = planCoreChatToolTurn({
          messageText: prompt,
          hasRecentAssistantEmailDraft: true,
        });
        expect(decision.capabilityId, prompt).toBe(capability.id);
        expect(decision.ownerFacingLabel).toBe(capability.ownerFacingLabel);
        expect(decision.handlerRoute).toBe(capability.handler.route);
        expect(decision.auditEventKind).toBe(capability.auditEventKind);
        expect(decision.requiredSetupChecks).toEqual([...capability.requiresSetup]);
      }

      for (const prompt of capability.examples.negative) {
        const decision = planCoreChatToolTurn({ messageText: prompt });
        expect(decision.capabilityId, prompt).not.toBe(capability.id);
      }
    }
  });
});
