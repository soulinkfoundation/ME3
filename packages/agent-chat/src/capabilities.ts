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
