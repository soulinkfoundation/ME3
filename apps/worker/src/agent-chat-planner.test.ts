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
    name: "typoed reminder create without a time asks for clarification",
    messageText: "Reminder me to tell Erum about Soulink",
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
    name: "article context title brainstorming stays conversational",
    messageText:
      "Need a YouTube thumbnail and title for a video about AI harnesses. Here's the Substack article I wrote for context: https://example.com/post can you read it? Want some ideas for titles",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "article audience and purpose request stays conversational",
    messageText:
      "Read this article and summarize the audience and purpose for me.",
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
    name: "direct Mission Control task detail read becomes a read action",
    messageText: "Read the full details for task Prepare launch checklist.",
    kind: "read_action",
    capabilityId: "core.mission.task.read",
    sideEffectLevel: "read",
  },
  {
    name: "Mission Control context read becomes a context read action",
    messageText: "Read the mission context for project ME3 Launch.",
    kind: "read_action",
    capabilityId: "core.mission.context.read",
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
  {
    name: "profile site blog post list becomes a read action",
    messageText: "Show my blog posts.",
    kind: "read_action",
    capabilityId: "core.sites.blog_post.list",
    sideEffectLevel: "read",
  },
  {
    name: "site blog post list alias becomes a read action",
    messageText: "List posts on my profile site.",
    kind: "read_action",
    capabilityId: "core.sites.blog_post.list",
    sideEffectLevel: "read",
  },
  {
    name: "published article list becomes a read action",
    messageText: "Which articles are published on my public site?",
    kind: "read_action",
    capabilityId: "core.sites.blog_post.list",
    sideEffectLevel: "read",
  },
  {
    name: "specific blog post read becomes a read action",
    messageText: "Read the blog post about agent context.",
    kind: "read_action",
    capabilityId: "core.sites.blog_post.read",
    sideEffectLevel: "read",
  },
  {
    name: "full article draft read becomes a read action",
    messageText: "Open the full article draft for Kieran of Earth.",
    kind: "read_action",
    capabilityId: "core.sites.blog_post.read",
    sideEffectLevel: "read",
  },
  {
    name: "slug-style post read becomes a read action",
    messageText: "Pull up the site post agent-context-notes.",
    kind: "read_action",
    capabilityId: "core.sites.blog_post.read",
    sideEffectLevel: "read",
  },
  {
    name: "draft blog post create becomes a write action",
    messageText: "Create a draft blog post about why regex intent routing fails.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.create",
    sideEffectLevel: "write",
  },
  {
    name: "public site article create becomes a write action",
    messageText: "Write a post for my public site but keep it as draft.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.create",
    sideEffectLevel: "write",
  },
  {
    name: "published blog post create becomes a write action",
    messageText: "Write and publish a blog post titled Agent Context Notes.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.create",
    sideEffectLevel: "write",
  },
  {
    name: "blog post excerpt update becomes a write action",
    messageText: "Update the excerpt for the agent context article to A short note about context.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.update",
    sideEffectLevel: "write",
  },
  {
    name: "blog post rename becomes a write action",
    messageText: "Rename the post ME3 assistant notes to ME3 agent notes.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.update",
    sideEffectLevel: "write",
  },
  {
    name: "blog post slug update becomes a write action",
    messageText: "Set the slug for blog post Agent Context Notes to agent-context.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.update",
    sideEffectLevel: "write",
  },
  {
    name: "blog post body update becomes a write action",
    messageText: "Update the body for blog post Agent Context Notes to # Agent Context\n\nNew body.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.update",
    sideEffectLevel: "write",
  },
  {
    name: "draft blog post publish becomes a write action",
    messageText: "Publish the draft blog post about content strategy.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.update",
    sideEffectLevel: "write",
  },
  {
    name: "blog post unpublish becomes a write action",
    messageText: "Unpublish the blog post launch notes.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.update",
    sideEffectLevel: "write",
  },
  {
    name: "blog post delete becomes a write action",
    messageText: "Delete the old launch notes post.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.archive",
    sideEffectLevel: "write",
  },
  {
    name: "blog post archive becomes a write action",
    messageText: "Archive the blog post ME3 assistant notes.",
    kind: "write_action",
    capabilityId: "core.sites.blog_post.archive",
    sideEffectLevel: "write",
  },
  {
    name: "blog strategy stays conversational",
    messageText: "Brainstorm blog ideas with me for next month.",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
  {
    name: "social post prompt stays conversational",
    messageText: "Write a social post for LinkedIn.",
    kind: "conversation",
    capabilityId: "core.agent-chat.conversation",
    sideEffectLevel: "none",
  },
];

describe("Core chat tool planner", () => {
  it.each(plannerScenarios)("$name", (scenario) => {
    const decision = planCoreChatToolTurn({
      messageText: scenario.messageText,
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

      if (
        capability.id.startsWith("core.reminders.") ||
        capability.id.startsWith("core.mission.task.") ||
        capability.id.startsWith("core.mailbox.")
      ) {
        // Runtime v2 tools are model-routed; do not grow the regex planner
        // while the replacement path is cutting over.
        continue;
      }

      for (const prompt of capability.examples.positive) {
        const decision = planCoreChatToolTurn({ messageText: prompt });
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
