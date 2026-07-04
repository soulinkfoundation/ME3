import {
  defineMe3AgentCapabilityContract,
  ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
  validateMe3AgentCapabilityContract,
  type Me3AgentCapabilityApprovalMode,
  type Me3AgentCapabilityContract,
  type Me3AgentCapabilitySideEffect,
} from "@me3/knowledge";

export type CoreChatPlannerIntentKind =
  | "conversation"
  | "read_action"
  | "write_action"
  | "clarify";

export type CoreChatSideEffectLevel = "none" | "read" | "write";

export type CoreChatCapabilityContract = Me3AgentCapabilityContract & {
  handler: {
    surface: "chat";
    route: string;
  };
  chat: {
    intentKind: Exclude<CoreChatPlannerIntentKind, "clarify">;
    sideEffectLevel: CoreChatSideEffectLevel;
  };
};

export const CORE_CHAT_CAPABILITIES = [
  defineCoreChatCapability({
    id: "core.agent-chat.conversation",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Answer in chat",
    summary: "Answer setup, capability, context, and planning questions in chat.",
    category: "assistant",
    handler: {
      surface: "chat",
      route: "model",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: [],
    auditEventKind: "core_chat_conversation",
    examples: {
      positive: [
        "What tools can you access here?",
        "I am setting up ME3 for the first time. What can you do?",
      ],
      negative: ["Do I have any pending reminders?"],
    },
    chat: {
      intentKind: "conversation",
      sideEffectLevel: "none",
    },
  }),
  defineCoreChatCapability({
    id: "core.mailbox.draft",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Save mailbox draft",
    summary: "Save an email draft into the Core mailbox without sending it.",
    category: "email",
    handler: {
      surface: "chat",
      route: "core.mailbox.draft",
    },
    sideEffect: "external_draft",
    approvalMode: "none",
    requiresSetup: ["mailbox"],
    inputSchema: {
      type: "object",
      required: ["to", "subject", "body"],
      properties: {
        to: "Recipient email address.",
        subject: "Draft email subject.",
        body: "Plain-text email body.",
      },
    },
    auditEventKind: "core_mailbox_draft_saved",
    examples: {
      positive: ["Save that email draft to /email for review."],
      negative: ["Create an email to Ada about the launch."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.reminders.list",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "List reminders",
    summary: "Read pending Core reminders for the owner.",
    category: "calendar",
    handler: {
      surface: "chat",
      route: "core.reminders.list",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["calendar.reminders"],
    auditEventKind: "core_reminders_listed",
    examples: {
      positive: ["Do I have any pending reminders?"],
      negative: ["I want to test reminders, calendar, and tasks."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.reminders.create",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Create reminder",
    summary: "Create a Core reminder from a clear owner request.",
    category: "calendar",
    handler: {
      surface: "chat",
      route: "core.reminders.create",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["calendar.reminders"],
    inputSchema: {
      type: "object",
      required: ["title", "remindAt"],
      properties: {
        title: "Reminder title.",
        remindAt: "ISO timestamp for when to remind the owner.",
        timezone: "Owner timezone.",
      },
    },
    auditEventKind: "core_reminder_created",
    examples: {
      positive: ["Remind me tomorrow at 9 to follow up with Sam."],
      negative: ["What reminder tools can you use?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.bookings.lookup",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Look up bookings",
    summary: "Read upcoming confirmed booking records for the owner.",
    category: "calendar",
    handler: {
      surface: "chat",
      route: "core.bookings.lookup",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["booking"],
    auditEventKind: "core_bookings_lookup",
    examples: {
      positive: ["Can you check my upcoming bookings this week?"],
      negative: [
        "I want to test bookings and calendar features.",
        "Trim this booking confirmation email: join my call room on {{ bookingTime }}.",
      ],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.list",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "List site blog posts",
    summary: "Read profile-site blog post metadata and body previews.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.list",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    auditEventKind: "site_blog_posts_listed",
    examples: {
      positive: ["Show my blog posts."],
      negative: ["Write a social post for LinkedIn."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.read",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Read site blog post",
    summary: "Read one profile-site blog post with full markdown body.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.read",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    inputSchema: {
      type: "object",
      required: ["post"],
      properties: {
        site: "Optional site username, domain, or profile name.",
        post: "Blog post title, slug, file path, or alias.",
      },
    },
    auditEventKind: "site_blog_post_read",
    examples: {
      positive: ["Read the blog post about agent context."],
      negative: ["Show all blog posts."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.create",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Create site blog post",
    summary: "Create a profile-site blog post draft or published post.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.create",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        site: "Optional site username, domain, or profile name.",
        title: "Blog post title.",
        slug: "Optional slug.",
        excerpt: "Optional excerpt.",
        bodyMarkdown: "Optional markdown body.",
        draft: "Whether the post should remain a draft.",
      },
    },
    auditEventKind: "site_blog_post_created",
    examples: {
      positive: ["Create a draft blog post about why regex intent routing fails."],
      negative: ["Brainstorm blog ideas with me."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.update",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Update site blog post",
    summary: "Update profile-site blog post metadata, publish state, slug, excerpt, or body.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.update",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    inputSchema: {
      type: "object",
      required: ["post"],
      properties: {
        site: "Optional site username, domain, or profile name.",
        post: "Blog post title, slug, file path, or alias.",
        title: "Optional replacement title.",
        slug: "Optional replacement slug.",
        excerpt: "Optional replacement excerpt.",
        bodyMarkdown: "Optional replacement markdown body.",
        draft: "Optional draft/published state.",
        publishedAt: "Optional YYYY-MM-DD publish date.",
      },
    },
    auditEventKind: "site_blog_post_updated",
    examples: {
      positive: ["Rename the post ME3 assistant notes to ME3 agent notes."],
      negative: ["Help me improve my writing style."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.archive",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Archive site blog post",
    summary: "Remove a profile-site blog post from active metadata and archive its markdown file.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.archive",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    inputSchema: {
      type: "object",
      required: ["post"],
      properties: {
        site: "Optional site username, domain, or profile name.",
        post: "Blog post title, slug, file path, or alias.",
      },
    },
    auditEventKind: "site_blog_post_archived",
    examples: {
      positive: ["Delete the old launch notes post."],
      negative: ["Can you explain deleted site posts?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.create",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Create Mission Control task",
    summary: "Create a Mission Control task from a clear owner request.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.create",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: "Task title.",
        description: "Optional task description, notes, details, or body.",
        projectId: "Mission Control project ID.",
        dueAt: "Optional YYYY-MM-DD due date.",
      },
    },
    auditEventKind: "mission_task_created",
    examples: {
      positive: ["Add a task to project ME3 Launch to follow up with Sam tomorrow."],
      negative: ["I want to test Mission Control tasks and projects."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.list",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "List Mission Control tasks",
    summary: "Read Mission Control tasks by project and status.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.list",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      properties: {
        projectId: "Optional Mission Control project ID.",
        status: "Optional task status.",
      },
    },
    auditEventKind: "mission_task_read",
    examples: {
      positive: ["Show backlog tasks for project ME3 Launch."],
      negative: ["Help me prioritise my Mission Control tasks."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.read",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Read Mission Control task",
    summary: "Read one Mission Control task, including its full description where possible.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.read",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: "Mission Control task ID.",
      },
    },
    auditEventKind: "mission_task_read",
    examples: {
      positive: ["Read the full details for task Prepare launch checklist."],
      negative: ["Show backlog tasks for project ME3 Launch."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.context.read",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Read Mission Control context",
    summary: "Read Mission Control project context with tasks, mission statement, and public audience context.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.context.read",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      properties: {
        projectId: "Optional Mission Control project ID.",
        includeTasks: "Whether to include linked tasks.",
      },
    },
    auditEventKind: "mission_context_read",
    examples: {
      positive: ["Read the mission context for project ME3 Launch."],
      negative: ["Show backlog tasks for project ME3 Launch."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.update",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Update Mission Control task",
    summary: "Update, move, rename, or reschedule a Mission Control task.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.update",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: "Mission Control task ID.",
        title: "Optional replacement task title.",
        description: "Optional replacement task description, notes, details, or body.",
        projectId: "Optional destination project ID.",
        status: "Optional task status.",
        dueAt: "Optional YYYY-MM-DD due date.",
      },
    },
    auditEventKind: "mission_task_updated",
    examples: {
      positive: ["Mark task follow up with Sam as done."],
      negative: ["How should I organize my Mission Control tasks?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.archive",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Archive Mission Control task",
    summary: "Archive a Mission Control task from a clear owner request.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.archive",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: "Mission Control task ID.",
      },
    },
    auditEventKind: "mission_task_archived",
    examples: {
      positive: ["Delete task follow up with Sam."],
      negative: ["Can you explain deleted Mission Control tasks?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
] as const;

export type CoreChatCapabilityId = (typeof CORE_CHAT_CAPABILITIES)[number]["id"];

export const CORE_CHAT_CAPABILITY_IDS = CORE_CHAT_CAPABILITIES.map(
  (capability) => capability.id,
) as readonly CoreChatCapabilityId[];

const CORE_CHAT_CAPABILITY_BY_ID = new Map<CoreChatCapabilityId, CoreChatCapabilityContract>(
  CORE_CHAT_CAPABILITIES.map((capability) => [capability.id, capability]),
);

export function getCoreChatCapability(
  capabilityId: CoreChatCapabilityId,
): CoreChatCapabilityContract {
  const capability = CORE_CHAT_CAPABILITY_BY_ID.get(capabilityId);
  if (!capability) {
    throw new Error(`Unknown Core chat capability: ${capabilityId}`);
  }
  return capability;
}

export function isCoreChatCapabilityApprovalRequired(
  capability: Pick<CoreChatCapabilityContract, "approvalMode">,
): boolean {
  return capability.approvalMode === "review_required" || capability.approvalMode === "approval_required";
}

export function validateCoreChatCapabilityContracts() {
  return CORE_CHAT_CAPABILITIES.flatMap((capability) =>
    validateMe3AgentCapabilityContract(capability),
  );
}

function defineCoreChatCapability(
  input: Omit<CoreChatCapabilityContract, "version" | "inputSchema" | "outputSchema"> & {
    inputSchema?: CoreChatCapabilityContract["inputSchema"];
    outputSchema?: CoreChatCapabilityContract["outputSchema"];
  },
): CoreChatCapabilityContract {
  return defineMe3AgentCapabilityContract({
    version: "0.1.0",
    inputSchema: ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
    outputSchema: ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
    ...input,
  });
}

export type {
  Me3AgentCapabilityApprovalMode as CoreChatApprovalMode,
  Me3AgentCapabilitySideEffect as CoreChatCapabilitySideEffect,
};
