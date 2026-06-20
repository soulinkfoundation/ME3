import { describe, expect, it } from "vitest";
import {
  planCoreChatToolTurn,
  type CoreChatCapabilityId,
  type CoreChatPlannerIntentKind,
  type CoreChatSideEffectLevel,
} from "./agent-chat";

type PlannerScenario = {
  name: string;
  messageText: string;
  hasRecentAssistantEmailDraft?: boolean;
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
    name: "mailbox draft save follow-up becomes a write action",
    messageText: "Save that draft to ada@example.com",
    hasRecentAssistantEmailDraft: true,
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
];

describe("Core chat tool planner", () => {
  it.each(plannerScenarios)("$name", (scenario) => {
    const decision = planCoreChatToolTurn({
      messageText: scenario.messageText,
      hasRecentAssistantEmailDraft: scenario.hasRecentAssistantEmailDraft,
    });

    expect(decision).toMatchObject({
      kind: scenario.kind,
      capabilityId: scenario.capabilityId,
      sideEffectLevel: scenario.sideEffectLevel,
    });
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.reason).toEqual(expect.any(String));
  });
});
