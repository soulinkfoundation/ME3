import {
  buildMe3AgentContextPrompt,
  createMe3AgentContextManifest,
  defineMe3AgentCapabilityContract,
  ME3_AGENT_CAPABILITY_APPROVAL_MODES,
  ME3_AGENT_CAPABILITY_SIDE_EFFECTS,
  ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
  resolveMe3AgentContextPacket,
  type Me3AgentContextBudget,
  type Me3AgentContextCalendarEvent,
  type Me3AgentContextContact,
  type Me3AgentContextEmailThread,
  type Me3AgentContextManifest,
  type Me3AgentContextManifestSource,
  type Me3AgentContextOwnerProfile,
  type Me3AgentContextPacket,
  type Me3AgentContextPrivateMemory,
  type Me3AgentContextProject,
  type Me3AgentContextPrompt,
  type Me3AgentContextPublicIdentity,
  type Me3AgentContextPurpose,
  type Me3AgentContextRecentMessage,
  type Me3AgentContextResolverOptions,
  type Me3AgentContextResolverScope,
  type Me3AgentContextSource,
  type Me3AgentContextTask,
  type Me3AgentCapabilityApprovalMode,
  type Me3AgentCapabilityCategory,
  type Me3AgentCapabilityContract,
  type Me3AgentCapabilityOwner,
  type Me3AgentCapabilitySchema,
  type Me3AgentCapabilitySideEffect,
} from "@me3/knowledge";

export const ASSISTANT_JOBS_PACKAGE_NAME = "@me3-core/assistant-jobs";

export const ASSISTANT_JOB_APPROVAL_MODES = ME3_AGENT_CAPABILITY_APPROVAL_MODES;

export type AssistantJobApprovalMode = Me3AgentCapabilityApprovalMode;

export const ASSISTANT_JOB_SIDE_EFFECTS = ME3_AGENT_CAPABILITY_SIDE_EFFECTS;

export type AssistantJobSideEffect = Me3AgentCapabilitySideEffect;

export type AssistantCapabilityOwner = Me3AgentCapabilityOwner;
export type AssistantCapabilityCategory = Me3AgentCapabilityCategory;

export type AssistantCapabilitySchema = Me3AgentCapabilitySchema;

export type AssistantCapability = {
  id: string;
  owner: AssistantCapabilityOwner;
  pluginId: string | null;
  version: string;
  label: string;
  summary: string;
  category: AssistantCapabilityCategory;
  sideEffect: AssistantJobSideEffect;
  approvalMode: AssistantJobApprovalMode;
  eventSafe: boolean;
  manualRunSafe: boolean;
  requiresSetup: readonly string[];
  inputSchema: AssistantCapabilitySchema;
  outputSchema: AssistantCapabilitySchema;
  userFacingReadSummary: string;
  userFacingWriteSummary: string;
  auditEventKind: string;
};

export type AssistantJobTrigger =
  | { kind: "manual" }
  | {
      kind: "schedule";
      timezone: string;
      cadence: "daily" | "weekly" | "monthly" | "custom";
      rrule: string | null;
      localTime: string | null;
      dayOfWeek: number | null;
      nextRunAt: string | null;
    }
  | {
      kind: "event";
      source: "core" | "mission_control" | "plugin";
      sourceId: string;
      eventType: string;
      filters: readonly AssistantJobRule[];
    };

export type AssistantJobScope = {
  projectId: string | null;
  sourceIds: readonly string[];
  providerAccountIds: readonly string[];
  filters: readonly AssistantJobScopeFilter[];
};

export type AssistantJobScopeFilter = {
  field: string;
  operator: "equals" | "contains" | "starts_with" | "in" | "before" | "after";
  value: unknown;
};

export type AssistantJobRule = {
  id: string;
  label: string;
  field: string;
  operator: string;
  value: unknown;
};

export type AssistantJobAction = {
  id: string;
  capabilityId: string;
  label: string;
  inputs: Readonly<Record<string, unknown>>;
  approvalMode: AssistantJobApprovalMode;
  onFailure: "stop" | "continue" | "request_review";
  idempotencyScope: "run" | "source_event" | "artifact" | "external_ref";
};

export type AssistantJobApprovalPolicy = {
  defaultMode: Exclude<AssistantJobApprovalMode, "forbidden">;
  overrides: readonly {
    capabilityId: string;
    mode: AssistantJobApprovalMode;
    reason: string;
  }[];
  ownerCanApproveFrom: "mission_control";
  approvalExpiresAfterHours: number | null;
};

export type AssistantJobDestination = {
  kind: "mission_control";
  projectId: string | null;
  landing:
    | "review_packet"
    | "task"
    | "capture"
    | "approval"
    | "memory_review"
    | "activity"
    | "accounts";
  quietIfNoChanges: boolean;
};

export type AssistantJobDraft = {
  name: string;
  purpose: string;
  recipeId: string | null;
  trigger: AssistantJobTrigger;
  scope: AssistantJobScope;
  rules: readonly AssistantJobRule[];
  actions: readonly AssistantJobAction[];
  approvalPolicy: AssistantJobApprovalPolicy;
  destination: AssistantJobDestination;
  projectId: string | null;
  recommendedSkillIds: readonly string[];
  requiredSkillIds: readonly string[];
};

export const INBOX_WATCH_TIMINGS = [
  "immediate",
  "daily_digest",
  "weekly_digest",
  "manual",
] as const;

export type InboxWatchTiming = (typeof INBOX_WATCH_TIMINGS)[number];

export const INBOX_WATCH_INFERRED_LABELS = [
  "needs_reply",
  "important",
  "finance",
  "scheduling",
  "review",
] as const;

export type InboxWatchInferredLabel = (typeof INBOX_WATCH_INFERRED_LABELS)[number];

export type InboxWatchRuleConfig = {
  id: string;
  label: string;
  enabled: boolean;
  timing: InboxWatchTiming;
  match: {
    from?: string[];
    fromAddresses?: string[];
    fromDomains?: string[];
    textContains?: string[];
    subjectContains?: string[];
    bodyContains?: string[];
    inferredLabels?: InboxWatchInferredLabel[];
  };
  actions: {
    notifyOwner?: boolean;
    summarizeAndLabel?: boolean;
    draftReply?: boolean;
    createTask?: boolean;
    recommendUnsubscribe?: boolean;
    markImportantInternally?: boolean;
  };
};

export type InboxWatchMessageCandidate = {
  fromAddress?: string | null;
  subject?: string | null;
  body?: string | null;
  labels?: readonly string[] | null;
};

export type InboxWatchMessageMatch = {
  matched: boolean;
  ruleIds: string[];
  rules: InboxWatchRuleConfig[];
};

export type AssistantRecipeVersion = "core_v1" | "later_provider_adapter";
export type AssistantRecipeState =
  | "ready"
  | "needs_setup"
  | "manual_only"
  | "coming_later";

export type AssistantJobStarterRecipe = {
  id: string;
  name: string;
  outcome: string;
  firstVersion: AssistantRecipeVersion;
  state: AssistantRecipeState;
  defaultDraft: AssistantJobDraft;
  requiredCapabilityIds: readonly string[];
  optionalCapabilityIds: readonly string[];
  recommendedSkillIds: readonly string[];
  requiredSkillIds: readonly string[];
};

export type AssistantJobPermissionSummary = {
  reads: string[];
  writes: string[];
  approvalRequired: string[];
  forbidden: string[];
  setupRequirements: string[];
  skills: string[];
};

export type AssistantJobValidationErrorCode =
  | "unknown_capability"
  | "plugin_disabled"
  | "setup_missing"
  | "skill_missing"
  | "approval_too_weak"
  | "event_unsafe_action"
  | "forbidden_action"
  | "invalid_trigger"
  | "invalid_destination"
  | "invalid_input";

export type AssistantJobValidationError = {
  code: AssistantJobValidationErrorCode;
  message: string;
  blocking: boolean;
  actionId?: string;
  capabilityId?: string;
};

export type AssistantJobDraftValidation = {
  status: "valid" | "needs_setup" | "invalid";
  errors: AssistantJobValidationError[];
  permissionSummary: AssistantJobPermissionSummary;
};

export type AssistantJobDraftValidationOptions = {
  capabilities?: readonly AssistantCapability[];
  enabledCapabilityIds?: readonly string[];
  readySetupRequirements?: readonly string[];
  availableSkillIds?: readonly string[];
};

export type AssistantJobContextScope = Me3AgentContextResolverScope;

export type AssistantJobContextInput = {
  ownerId: string;
  jobId?: string | null;
  runId?: string | null;
  jobName: string;
  jobPurpose?: string | null;
  trigger?: AssistantJobTrigger | null;
  scope?: AssistantJobScope | null;
  destination?: AssistantJobDestination | null;
  purpose?: Me3AgentContextPurpose;
  requestText?: string | null;
  contextScope?: AssistantJobContextScope;
  ownerProfile?: Me3AgentContextOwnerProfile | null;
  publicIdentity?: Me3AgentContextPublicIdentity | null;
  candidatePrivateMemory?: readonly Me3AgentContextPrivateMemory[];
  candidateContacts?: readonly Me3AgentContextContact[];
  candidateEmailThreads?: readonly Me3AgentContextEmailThread[];
  candidateProjects?: readonly Me3AgentContextProject[];
  candidateTasks?: readonly Me3AgentContextTask[];
  candidateCalendarEvents?: readonly Me3AgentContextCalendarEvent[];
  candidateRecentMessages?: readonly Me3AgentContextRecentMessage[];
  failedSources?: readonly Me3AgentContextSource[];
  resolverOptions?: Me3AgentContextResolverOptions;
  budget?: Partial<Me3AgentContextBudget>;
  warnings?: readonly string[];
};

export type AssistantJobContextRunManifestSource =
  Me3AgentContextManifestSource;

export type AssistantJobContextRunManifest = Me3AgentContextManifest;

export type AssistantJobContextResult = {
  packet: Me3AgentContextPacket;
  prompt: Me3AgentContextPrompt;
  manifest: AssistantJobContextRunManifest;
};

const EMPTY_SCHEMA = ME3_EMPTY_AGENT_CAPABILITY_SCHEMA;

const APPROVAL_MODE_WEIGHT: Record<AssistantJobApprovalMode, number> = {
  none: 0,
  review_required: 1,
  approval_required: 2,
  forbidden: 3,
};

function capability(
  input: Omit<
    AssistantCapability,
    "version" | "inputSchema" | "outputSchema"
  > & {
    inputSchema?: AssistantCapabilitySchema;
    outputSchema?: AssistantCapabilitySchema;
  },
): AssistantCapability {
  return {
    version: "0.1.0",
    inputSchema: EMPTY_SCHEMA,
    outputSchema: EMPTY_SCHEMA,
    ...input,
  };
}

export const ASSISTANT_JOB_CAPABILITIES = [
  capability({
    id: "assistant.job.create_draft",
    owner: "core",
    pluginId: null,
    label: "Draft assistant job",
    summary: "Draft a new job during the Add job flow.",
    category: "assistant",
    sideEffect: "write_internal_draft",
    approvalMode: "review_required",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads available recipes and capabilities.",
    userFacingWriteSummary: "Creates a job draft for review.",
    auditEventKind: "assistant_job_draft_created",
  }),
  capability({
    id: "assistant.job.validate",
    owner: "core",
    pluginId: null,
    label: "Validate assistant job",
    summary: "Validate a job draft against capabilities, setup, and policy.",
    category: "assistant",
    sideEffect: "read_private",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads job draft metadata and capability policy.",
    userFacingWriteSummary: "Does not change owner data.",
    auditEventKind: "assistant_job_validated",
  }),
  capability({
    id: "assistant.job.save_confirmed",
    owner: "core",
    pluginId: null,
    label: "Save confirmed job",
    summary: "Save an owner-confirmed job.",
    category: "assistant",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads the confirmed job draft.",
    userFacingWriteSummary: "Creates or updates an Assistant Job.",
    auditEventKind: "assistant_job_saved",
  }),
  capability({
    id: "assistant.job.run_now",
    owner: "core",
    pluginId: null,
    label: "Run job now",
    summary: "Start a manual run for an active job.",
    category: "assistant",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads the active job version.",
    userFacingWriteSummary: "Creates a job run record.",
    auditEventKind: "assistant_job_manual_run_requested",
  }),
  capability({
    id: "assistant.job.pause",
    owner: "core",
    pluginId: null,
    label: "Pause job",
    summary: "Pause an Assistant Job.",
    category: "assistant",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads job status.",
    userFacingWriteSummary: "Pauses future job runs.",
    auditEventKind: "assistant_job_paused",
  }),
  capability({
    id: "assistant.job.resume",
    owner: "core",
    pluginId: null,
    label: "Resume job",
    summary: "Resume an Assistant Job after validation.",
    category: "assistant",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads job status and validation state.",
    userFacingWriteSummary: "Resumes future job runs.",
    auditEventKind: "assistant_job_resumed",
  }),
  capability({
    id: "assistant.job.request_approval",
    owner: "core",
    pluginId: null,
    label: "Request job approval",
    summary: "Create an approval request for a job action.",
    category: "assistant",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads the action preview.",
    userFacingWriteSummary: "Creates an approval request.",
    auditEventKind: "assistant_job_approval_requested",
  }),
  capability({
    id: "mission.review_packet.create",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Create result",
    summary: "Create a scan-friendly Mission Control result.",
    category: "mission_control",
    sideEffect: "write_internal_draft",
    approvalMode: "review_required",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads scoped Mission Control context.",
    userFacingWriteSummary: "Creates a Mission Control result.",
    auditEventKind: "mission_review_packet_created",
  }),
  capability({
    id: "mission.task.create",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Create task",
    summary: "Create a Mission Control task.",
    category: "mission_control",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads the job output.",
    userFacingWriteSummary: "Creates a Mission Control task.",
    auditEventKind: "mission_task_created",
  }),
  capability({
    id: "mission.approval.create",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Create approval",
    summary: "Create a Mission Control approval.",
    category: "mission_control",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads the action preview.",
    userFacingWriteSummary: "Creates a Mission Control approval.",
    auditEventKind: "mission_approval_created",
  }),
  capability({
    id: "mission.activity.create",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Create activity",
    summary: "Add Mission Control activity.",
    category: "mission_control",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads job status and output summary.",
    userFacingWriteSummary: "Creates a Mission Control activity item.",
    auditEventKind: "mission_activity_created",
  }),
  capability({
    id: "mission.memory.suggest",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Suggest memory",
    summary: "Suggest private memory for review.",
    category: "memory",
    sideEffect: "write_internal_draft",
    approvalMode: "review_required",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads scoped Mission Control context.",
    userFacingWriteSummary: "Creates a private memory suggestion.",
    auditEventKind: "mission_memory_suggested",
  }),
  capability({
    id: "mission.memory.activate",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Activate memory",
    summary: "Make a private memory durable.",
    category: "memory",
    sideEffect: "memory_write",
    approvalMode: "approval_required",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads a memory suggestion.",
    userFacingWriteSummary: "Writes durable private memory.",
    auditEventKind: "mission_memory_activated",
  }),
  capability({
    id: "mission.project.read",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Read project",
    summary: "Read scoped Mission Control project state.",
    category: "mission_control",
    sideEffect: "read_private",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads scoped Mission Control project state.",
    userFacingWriteSummary: "Does not change owner data.",
    auditEventKind: "mission_project_read",
  }),
  capability({
    id: "mission.task.read",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Read tasks",
    summary: "Read scoped Mission Control tasks.",
    category: "mission_control",
    sideEffect: "read_private",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads scoped Mission Control tasks.",
    userFacingWriteSummary: "Does not change owner data.",
    auditEventKind: "mission_task_read",
  }),
  capability({
    id: "accounts.entry.create",
    owner: "plugin",
    pluginId: "me3.accounts",
    label: "Create account entries",
    summary:
      "Create Accounts ledger entries from extracted invoice or receipt data.",
    category: "mission_control",
    sideEffect: "write_internal_active",
    approvalMode: "review_required",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: ["accounts"],
    userFacingReadSummary: "Reads extracted invoice and receipt details.",
    userFacingWriteSummary: "Creates Accounts ledger entries for review.",
    auditEventKind: "accounts_entry_created",
  }),
  capability({
    id: "mission.approval.read",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Read approvals",
    summary: "Read pending Mission Control approvals.",
    category: "mission_control",
    sideEffect: "read_private",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads pending Mission Control approvals.",
    userFacingWriteSummary: "Does not change owner data.",
    auditEventKind: "mission_approval_read",
  }),
  capability({
    id: "message.owner.notify",
    owner: "plugin",
    pluginId: "me3.messaging",
    label: "Notify owner",
    summary: "Send a notification only to the owner.",
    category: "messaging",
    sideEffect: "notify_owner",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: ["owner_notifications"],
    userFacingReadSummary: "Reads the job output summary.",
    userFacingWriteSummary: "Sends a notification only to the owner.",
    auditEventKind: "owner_notification_sent",
  }),
  capability({
    id: "email.message.read",
    owner: "plugin",
    pluginId: "me3.email",
    label: "Read email",
    summary: "Read scoped mailbox messages.",
    category: "email",
    sideEffect: "read_external",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: ["email"],
    userFacingReadSummary: "Reads scoped mailbox messages.",
    userFacingWriteSummary: "Does not change email.",
    auditEventKind: "email_message_read",
  }),
  capability({
    id: "email.thread.summarize",
    owner: "plugin",
    pluginId: "me3.email",
    label: "Summarize email thread",
    summary: "Summarize a scoped email thread.",
    category: "email",
    sideEffect: "read_external",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: ["email"],
    userFacingReadSummary: "Reads scoped email thread content.",
    userFacingWriteSummary: "Does not change email.",
    auditEventKind: "email_thread_summarized",
  }),
  capability({
    id: "email.reply.draft",
    owner: "plugin",
    pluginId: "me3.email",
    label: "Draft email reply",
    summary: "Draft an email reply without sending.",
    category: "email",
    sideEffect: "external_draft",
    approvalMode: "review_required",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: ["email"],
    userFacingReadSummary: "Reads scoped email context.",
    userFacingWriteSummary: "Creates an email draft.",
    auditEventKind: "email_reply_drafted",
  }),
  capability({
    id: "email.message.send",
    owner: "plugin",
    pluginId: "me3.email",
    label: "Send email",
    summary: "Send an email.",
    category: "email",
    sideEffect: "external_send",
    approvalMode: "approval_required",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: ["email"],
    userFacingReadSummary: "Reads an approved email draft.",
    userFacingWriteSummary: "Sends email outside ME3.",
    auditEventKind: "email_message_sent",
  }),
  capability({
    id: "calendar.event.read",
    owner: "plugin",
    pluginId: "me3.calendar",
    label: "Read calendar events",
    summary: "Read scoped calendar events.",
    category: "calendar",
    sideEffect: "read_external",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: ["calendar"],
    userFacingReadSummary: "Reads scoped calendar events.",
    userFacingWriteSummary: "Does not change calendar.",
    auditEventKind: "calendar_event_read",
  }),
  capability({
    id: "calendar.event.create",
    owner: "plugin",
    pluginId: "me3.calendar",
    label: "Create calendar event",
    summary: "Create or change a calendar event.",
    category: "calendar",
    sideEffect: "external_write",
    approvalMode: "approval_required",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: ["calendar"],
    userFacingReadSummary: "Reads an approved event draft.",
    userFacingWriteSummary: "Changes an external calendar.",
    auditEventKind: "calendar_event_created",
  }),
  capability({
    id: "local_executor.run",
    owner: "plugin",
    pluginId: "me3.local-executor",
    label: "Run on local computer",
    summary: "Queue one bounded run on a paired local runner.",
    category: "local",
    sideEffect: "local_shell",
    approvalMode: "approval_required",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: ["local_executor"],
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        projectPolicyId: "Local Executor project policy id.",
        prompt: "Bounded task prompt for the local runner.",
      },
    },
    userFacingReadSummary:
      "Reads the configured project policy and the owner-provided task.",
    userFacingWriteSummary:
      "Runs a configured local executor command and records results in Mission Control.",
    auditEventKind: "local_executor_run_requested",
  }),
  capability({
    id: "daemon.metadata.read",
    owner: "plugin",
    pluginId: "me3.local-daemon",
    label: "Read local metadata",
    summary: "Read approved local daemon metadata.",
    category: "local",
    sideEffect: "local_read",
    approvalMode: "approval_required",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: ["local_daemon"],
    userFacingReadSummary: "Reads approved local metadata.",
    userFacingWriteSummary: "Does not change local files.",
    auditEventKind: "daemon_metadata_read",
  }),
  capability({
    id: "daemon.file.read",
    owner: "plugin",
    pluginId: "me3.local-daemon",
    label: "Read local file",
    summary: "Read approved local files through the daemon.",
    category: "local",
    sideEffect: "local_read",
    approvalMode: "approval_required",
    eventSafe: false,
    manualRunSafe: true,
    requiresSetup: ["local_daemon"],
    userFacingReadSummary: "Reads approved local files.",
    userFacingWriteSummary: "Does not change local files.",
    auditEventKind: "daemon_file_read",
  }),
] as const satisfies readonly AssistantCapability[];

export const ASSISTANT_JOB_CAPABILITY_IDS = ASSISTANT_JOB_CAPABILITIES.map(
  (capability) => capability.id,
);

export const ASSISTANT_JOB_CAPABILITY_CONTRACTS =
  ASSISTANT_JOB_CAPABILITIES.map(assistantJobCapabilityToContract);

export function getAssistantJobCapability(
  capabilityId: string,
  capabilities: readonly AssistantCapability[] = ASSISTANT_JOB_CAPABILITIES,
): AssistantCapability | null {
  return (
    capabilities.find((capability) => capability.id === capabilityId) ?? null
  );
}

export function assistantJobCapabilityToContract(
  capability: AssistantCapability,
): Me3AgentCapabilityContract {
  return defineMe3AgentCapabilityContract({
    id: capability.id,
    owner: capability.owner,
    pluginId: capability.pluginId,
    version: capability.version,
    ownerFacingLabel: capability.label,
    summary: capability.summary,
    category: capability.category,
    handler: {
      surface: "assistant_job",
      route: capability.id,
    },
    sideEffect: capability.sideEffect,
    approvalMode: capability.approvalMode,
    requiresSetup: capability.requiresSetup,
    inputSchema: capability.inputSchema,
    outputSchema: capability.outputSchema,
    auditEventKind: capability.auditEventKind,
    examples: assistantJobCapabilityExamples(capability),
  });
}

export function isApprovalModeAtLeast(
  requested: AssistantJobApprovalMode,
  required: AssistantJobApprovalMode,
): boolean {
  return APPROVAL_MODE_WEIGHT[requested] >= APPROVAL_MODE_WEIGHT[required];
}

function assistantJobCapabilityExamples(
  capability: AssistantCapability,
): Me3AgentCapabilityContract["examples"] {
  return {
    positive: [
      `Use ${capability.label.toLowerCase()} as an Assistant Job action.`,
    ],
    negative: [
      capability.approvalMode === "approval_required"
        ? `Run ${capability.label.toLowerCase()} without owner approval.`
        : "What can the assistant do?",
    ],
  };
}

const DEFAULT_SCOPE: AssistantJobScope = {
  projectId: null,
  sourceIds: [],
  providerAccountIds: [],
  filters: [],
};

const DEFAULT_APPROVAL_POLICY: AssistantJobApprovalPolicy = {
  defaultMode: "review_required",
  overrides: [],
  ownerCanApproveFrom: "mission_control",
  approvalExpiresAfterHours: null,
};

function missionDestination(
  landing: AssistantJobDestination["landing"],
  quietIfNoChanges = true,
): AssistantJobDestination {
  return {
    kind: "mission_control",
    projectId: null,
    landing,
    quietIfNoChanges,
  };
}

function action(
  id: string,
  capabilityId: string,
  label: string,
  approvalMode: AssistantJobApprovalMode,
  inputs: Readonly<Record<string, unknown>> = {},
): AssistantJobAction {
  return {
    id,
    capabilityId,
    label,
    inputs,
    approvalMode,
    onFailure: "request_review",
    idempotencyScope: "run",
  };
}

function draft(input: {
  name: string;
  purpose: string;
  recipeId: string;
  trigger: AssistantJobTrigger;
  actions: readonly AssistantJobAction[];
  destination: AssistantJobDestination;
  scope?: AssistantJobScope;
  rules?: readonly AssistantJobRule[];
  recommendedSkillIds?: readonly string[];
  requiredSkillIds?: readonly string[];
}): AssistantJobDraft {
  return {
    name: input.name,
    purpose: input.purpose,
    recipeId: input.recipeId,
    trigger: input.trigger,
    scope: input.scope ?? DEFAULT_SCOPE,
    rules: input.rules ?? [],
    actions: input.actions,
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    destination: input.destination,
    projectId: input.scope?.projectId ?? null,
    recommendedSkillIds: input.recommendedSkillIds ?? [],
    requiredSkillIds: input.requiredSkillIds ?? [],
  };
}

const DEFAULT_INBOX_WATCH_RULE: InboxWatchRuleConfig = {
  id: "any-inbox-message",
  label: "Any inbox email",
  enabled: true,
  timing: "daily_digest",
  match: {},
  actions: {
    summarizeAndLabel: true,
  },
};

function inboxWatchRule(
  id: string,
  label: string,
  match: InboxWatchRuleConfig["match"],
  actions: InboxWatchRuleConfig["actions"] = { summarizeAndLabel: true },
  timing: InboxWatchTiming = "daily_digest",
): AssistantJobRule {
  return {
    id,
    label,
    field: "inbox_watch.rule",
    operator: "matches",
    value: {
      enabled: true,
      timing,
      match,
      actions,
    },
  };
}

const dailySchedule: AssistantJobTrigger = {
  kind: "schedule",
  timezone: "owner",
  cadence: "daily",
  rrule: null,
  localTime: "08:00",
  dayOfWeek: null,
  nextRunAt: null,
};

export const DEFAULT_DAILY_BRIEFING_MESSAGE_TEMPLATE =
  "☀️ Good morning, {{owner.name}}. {{calendar.summary}}\n\n{{calendar.events}}\n{{calendar.reminders}}\n{{mission.tasks}}\n\nI'll keep an eye on the day from here.";

const weeklySchedule: AssistantJobTrigger = {
  kind: "schedule",
  timezone: "owner",
  cadence: "weekly",
  rrule: null,
  localTime: "15:00",
  dayOfWeek: 5,
  nextRunAt: null,
};

export const ASSISTANT_JOB_STARTER_RECIPES = [
  {
    id: "weekly-review",
    name: "Weekly Review",
    outcome:
      "Summarize the week, project changes, unfinished tasks, and carry-over choices.",
    firstVersion: "core_v1",
    state: "ready",
    requiredCapabilityIds: [
      "mission.project.read",
      "mission.task.read",
      "mission.approval.read",
      "mission.review_packet.create",
      "mission.activity.create",
    ],
    optionalCapabilityIds: ["message.owner.notify"],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Weekly Review",
      purpose:
        "Prepare a weekly Mission Control review with carry-over choices.",
      recipeId: "weekly-review",
      trigger: weeklySchedule,
      destination: missionDestination("review_packet"),
      actions: [
        action(
          "read-projects",
          "mission.project.read",
          "Read project state",
          "none",
        ),
        action("read-tasks", "mission.task.read", "Read open tasks", "none"),
        action(
          "read-approvals",
          "mission.approval.read",
          "Read pending approvals",
          "none",
        ),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create weekly review packet",
          "review_required",
        ),
        action(
          "create-activity",
          "mission.activity.create",
          "Record job activity",
          "none",
        ),
      ],
    }),
  },
  {
    id: "daily-briefing",
    name: "Daily Briefing",
    outcome:
      "Prepare a morning review of today's tasks, approvals, and due items.",
    firstVersion: "core_v1",
    state: "ready",
    requiredCapabilityIds: [
      "mission.task.read",
      "mission.approval.read",
      "mission.review_packet.create",
      "mission.activity.create",
    ],
    optionalCapabilityIds: ["message.owner.notify"],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Daily Briefing",
      purpose:
        "Sends a customised message to your mission control dashboard or Soulink when connected.",
      recipeId: "daily-briefing",
      trigger: dailySchedule,
      destination: missionDestination("review_packet"),
      actions: [
        action("read-tasks", "mission.task.read", "Read today's tasks", "none"),
        action(
          "read-approvals",
          "mission.approval.read",
          "Read pending approvals",
          "none",
        ),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create daily briefing packet",
          "review_required",
        ),
        action(
          "notify-owner",
          "message.owner.notify",
          "Send briefing notification",
          "none",
          {
            messageTemplate: DEFAULT_DAILY_BRIEFING_MESSAGE_TEMPLATE,
          },
        ),
      ],
    }),
  },
  {
    id: "email-triage",
    name: "Inbox Watch",
    outcome: "Get notified or take action when specific people email you.",
    firstVersion: "later_provider_adapter",
    state: "needs_setup",
    requiredCapabilityIds: [
      "email.message.read",
      "email.thread.summarize",
      "mission.review_packet.create",
    ],
    optionalCapabilityIds: ["email.reply.draft", "mission.task.create"],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Inbox Watch",
      purpose: "Get notified or take action when specific people email you.",
      recipeId: "email-triage",
      trigger: dailySchedule,
      destination: missionDestination("review_packet"),
      rules: [
        inboxWatchRule(
          "any-inbox-message",
          "Any inbox email",
          {},
          { summarizeAndLabel: true },
        ),
      ],
      actions: [
        action("read-email", "email.message.read", "Read scoped email", "none"),
        action(
          "summarize-thread",
          "email.thread.summarize",
          "Summarize email threads",
          "none",
        ),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create email triage packet",
          "review_required",
        ),
      ],
    }),
  },
  {
    id: "invoice-receipt-triage",
    name: "Invoice and Receipt Triage",
    outcome:
      "Extract receipts and invoices from email and add them to an accounts ledger.",
    firstVersion: "later_provider_adapter",
    state: "needs_setup",
    requiredCapabilityIds: [
      "email.message.read",
      "mission.review_packet.create",
      "accounts.entry.create",
    ],
    optionalCapabilityIds: [],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Invoice and Receipt Triage",
      purpose:
        "Extract receipts and invoices from email and add them to an accounts ledger.",
      recipeId: "invoice-receipt-triage",
      trigger: dailySchedule,
      destination: missionDestination("accounts"),
      actions: [
        action("read-email", "email.message.read", "Read scoped email", "none"),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create invoice review packet",
          "review_required",
        ),
        action(
          "create-accounts-entries",
          "accounts.entry.create",
          "Create Accounts ledger entries",
          "review_required",
        ),
      ],
    }),
  },
  {
    id: "booking-reminder",
    name: "Booking Reminders",
    outcome:
      "Send booking reminders to you and your guest before bookings made on your site.",
    firstVersion: "later_provider_adapter",
    state: "ready",
    requiredCapabilityIds: ["email.message.send"],
    optionalCapabilityIds: ["message.owner.notify"],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Booking Reminders",
      purpose:
        "Send booking reminders to you and your guest before bookings made on your site.",
      recipeId: "booking-reminder",
      trigger: {
        kind: "event",
        source: "plugin",
        sourceId: "me3.booking",
        eventType: "site.booking.confirmed",
        filters: [],
      },
      destination: missionDestination("review_packet"),
      actions: [],
    }),
  },
] as const satisfies readonly AssistantJobStarterRecipe[];

export function getAssistantJobStarterRecipe(
  recipeId: string,
): AssistantJobStarterRecipe | null {
  return (
    ASSISTANT_JOB_STARTER_RECIPES.find((recipe) => recipe.id === recipeId) ??
    null
  );
}

export function listCoreV1AssistantJobStarterRecipes(): AssistantJobStarterRecipe[] {
  return ASSISTANT_JOB_STARTER_RECIPES.filter(
    (recipe) => recipe.firstVersion === "core_v1",
  );
}

export function createAssistantJobDraftFromRecipe(
  recipe: AssistantJobStarterRecipe,
): AssistantJobDraft {
  return cloneJson(recipe.defaultDraft);
}

export function normalizeInboxWatchRules(
  rules: readonly AssistantJobRule[] | null | undefined,
): InboxWatchRuleConfig[] {
  const normalized = (rules || [])
    .map((rule) => normalizeInboxWatchRule(rule))
    .filter((rule): rule is InboxWatchRuleConfig => Boolean(rule));
  return normalized.length > 0 ? normalized : [DEFAULT_INBOX_WATCH_RULE];
}

export function matchInboxWatchMessage(
  candidate: InboxWatchMessageCandidate,
  rules: readonly AssistantJobRule[] | readonly InboxWatchRuleConfig[] | null | undefined,
  timing?: InboxWatchTiming | "all" | null,
): InboxWatchMessageMatch {
  const normalizedRules = isInboxWatchRuleConfigArray(rules)
    ? rules
    : normalizeInboxWatchRules(rules as readonly AssistantJobRule[] | null | undefined);
  const activeRules = normalizedRules.filter(
    (rule) => rule.enabled && (!timing || timing === "all" || rule.timing === timing),
  );
  const matches = activeRules.filter((rule) => inboxWatchRuleMatches(candidate, rule));
  return {
    matched: matches.length > 0,
    ruleIds: matches.map((rule) => rule.id),
    rules: matches,
  };
}

function normalizeInboxWatchRule(rule: AssistantJobRule): InboxWatchRuleConfig | null {
  if (rule.field === "inbox_watch.rule" && isRecord(rule.value)) {
    const raw = rule.value;
    return {
      id: rule.id,
      label: rule.label || rule.id,
      enabled: raw.enabled !== false,
      timing: normalizeInboxWatchTiming(raw.timing),
      match: normalizeInboxWatchMatch(raw.match),
      actions: normalizeInboxWatchActions(raw.actions),
    };
  }

  const match = normalizeInboxWatchGenericMatch(rule);
  if (!match) return null;
  return {
    id: rule.id,
    label: rule.label || rule.id,
    enabled: true,
    timing: "daily_digest",
    match,
    actions: { summarizeAndLabel: true },
  };
}

function normalizeInboxWatchGenericMatch(
  rule: AssistantJobRule,
): InboxWatchRuleConfig["match"] | null {
  const field = normalizeText(rule.field).replace(/[._-]/g, "");
  const values = normalizeTextArray(rule.value);
  if (values.length === 0) return null;
  if (field === "from" || field === "fromaddress" || field === "emailfrom") {
    return { fromAddresses: values };
  }
  if (field === "fromdomain" || field === "emailfromdomain") {
    return { fromDomains: values };
  }
  if (field === "subject" || field === "subjectcontains") {
    return { subjectContains: values };
  }
  if (field === "body" || field === "bodycontains" || field === "textbody") {
    return { bodyContains: values };
  }
  if (field === "inferredlabel" || field === "label" || field === "labels") {
    return { inferredLabels: normalizeInboxWatchLabels(values) };
  }
  return null;
}

function normalizeInboxWatchTiming(value: unknown): InboxWatchTiming {
  return INBOX_WATCH_TIMINGS.includes(value as InboxWatchTiming)
    ? value as InboxWatchTiming
    : "daily_digest";
}

function normalizeInboxWatchMatch(value: unknown): InboxWatchRuleConfig["match"] {
  if (!isRecord(value)) return {};
  return {
    fromAddresses: normalizeTextArray(value.fromAddresses),
    fromDomains: normalizeTextArray(value.fromDomains),
    from: normalizeTextArray(value.from),
    textContains: normalizeTextArray(value.textContains),
    subjectContains: normalizeTextArray(value.subjectContains),
    bodyContains: normalizeTextArray(value.bodyContains),
    inferredLabels: normalizeInboxWatchLabels(value.inferredLabels),
  };
}

function normalizeInboxWatchActions(value: unknown): InboxWatchRuleConfig["actions"] {
  if (!isRecord(value)) return { summarizeAndLabel: true };
  return {
    notifyOwner: value.notifyOwner === true,
    summarizeAndLabel: value.summarizeAndLabel !== false,
    draftReply: value.draftReply === true,
    createTask: value.createTask === true,
    recommendUnsubscribe: value.recommendUnsubscribe === true,
    markImportantInternally: value.markImportantInternally === true,
  };
}

function inboxWatchRuleMatches(
  candidate: InboxWatchMessageCandidate,
  rule: InboxWatchRuleConfig,
): boolean {
  const match = rule.match;
  const fromAddress = normalizeText(candidate.fromAddress);
  const fromDomain = emailDomain(fromAddress);
  const subject = normalizeText(candidate.subject);
  const body = normalizeText(candidate.body);
  const labels = new Set((candidate.labels || []).map(normalizeText));

  if (
    hasValues(match.from) &&
    !match.from.some((value) => inboxWatchFromValueMatches(fromAddress, fromDomain, value))
  ) {
    return false;
  }
  if (
    hasValues(match.fromAddresses) &&
    !match.fromAddresses.some((value) => normalizeText(value) === fromAddress)
  ) {
    return false;
  }
  if (
    hasValues(match.fromDomains) &&
    !match.fromDomains.some((value) => normalizeDomain(value) === fromDomain)
  ) {
    return false;
  }
  if (
    hasValues(match.textContains) &&
    !match.textContains.some((value) => {
      const needle = normalizeText(value);
      return subject.includes(needle) || body.includes(needle);
    })
  ) {
    return false;
  }
  if (
    hasValues(match.subjectContains) &&
    !match.subjectContains.some((value) => subject.includes(normalizeText(value)))
  ) {
    return false;
  }
  if (
    hasValues(match.bodyContains) &&
    !match.bodyContains.some((value) => body.includes(normalizeText(value)))
  ) {
    return false;
  }
  if (
    hasValues(match.inferredLabels) &&
    !match.inferredLabels.some((value) => labels.has(normalizeText(value)))
  ) {
    return false;
  }
  return true;
}

function inboxWatchFromValueMatches(
  fromAddress: string,
  fromDomain: string,
  value: string,
): boolean {
  const text = normalizeText(value);
  if (!text) return false;
  if (text.includes("@")) return text === fromAddress;
  return normalizeDomain(text) === fromDomain;
}

function isInboxWatchRuleConfigArray(
  value: readonly AssistantJobRule[] | readonly InboxWatchRuleConfig[] | null | undefined,
): value is readonly InboxWatchRuleConfig[] {
  return Array.isArray(value) && value.every((item) => isRecord(item) && "match" in item);
}

function normalizeInboxWatchLabels(value: unknown): InboxWatchInferredLabel[] {
  return normalizeTextArray(value).filter((label): label is InboxWatchInferredLabel =>
    INBOX_WATCH_INFERRED_LABELS.includes(label as InboxWatchInferredLabel),
  );
}

function normalizeTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeDomain(value: string): string {
  return normalizeText(value).replace(/^@/, "");
}

function emailDomain(value: string): string {
  const at = value.lastIndexOf("@");
  return at >= 0 ? value.slice(at + 1) : "";
}

function hasValues(value: readonly unknown[] | undefined): value is readonly unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createAssistantJobContext(
  input: AssistantJobContextInput,
): AssistantJobContextResult {
  const activeScope = assistantJobContextScope(input);
  const requestText = assistantJobContextRequestText(input, activeScope);
  const purpose =
    input.purpose ?? assistantJobContextPurpose(input.destination);

  const packet = resolveMe3AgentContextPacket({
    id: input.runId
      ? `agent-context:${input.ownerId}:job-run:${input.runId}`
      : input.jobId
        ? `agent-context:${input.ownerId}:job:${input.jobId}`
        : undefined,
    ownerId: input.ownerId,
    purpose,
    surface: "core",
    requestSummary: assistantJobContextRequestSummary(input),
    requestText,
    ownerProfile: input.ownerProfile ?? null,
    publicIdentity: input.publicIdentity ?? null,
    candidatePrivateMemory: input.candidatePrivateMemory ?? [],
    candidateContacts: input.candidateContacts ?? [],
    candidateEmailThreads: input.candidateEmailThreads ?? [],
    candidateProjects: input.candidateProjects ?? [],
    candidateTasks: input.candidateTasks ?? [],
    candidateCalendarEvents: input.candidateCalendarEvents ?? [],
    candidateRecentMessages: input.candidateRecentMessages ?? [],
    activeScope,
    sources: input.failedSources ?? [],
    resolverOptions: input.resolverOptions,
    budget: input.budget,
    warnings: input.warnings,
  });
  const prompt = buildMe3AgentContextPrompt(packet);

  return {
    packet,
    prompt,
    manifest: createAssistantJobContextRunManifest(packet, prompt.budget),
  };
}

export function createAssistantJobContextRunManifest(
  packet: Me3AgentContextPacket,
  budget: Me3AgentContextBudget = packet.budget,
): AssistantJobContextRunManifest {
  return createMe3AgentContextManifest(packet, budget);
}

export function attachAssistantJobContextToRunResult(
  result: Record<string, unknown>,
  context: AssistantJobContextResult | AssistantJobContextRunManifest,
): Record<string, unknown> {
  const manifest = "manifest" in context ? context.manifest : context;
  return {
    ...result,
    contextPacketId: manifest.packetId,
    contextManifest: manifest,
  };
}

export function validateAssistantJobDraft(
  draft: AssistantJobDraft,
  options: AssistantJobDraftValidationOptions = {},
): AssistantJobDraftValidation {
  const capabilities = options.capabilities ?? ASSISTANT_JOB_CAPABILITIES;
  const capabilityById = new Map(
    capabilities.map((capability) => [capability.id, capability]),
  );
  const enabledCapabilityIds = options.enabledCapabilityIds
    ? new Set(options.enabledCapabilityIds)
    : null;
  const readySetupRequirements = new Set(options.readySetupRequirements ?? []);
  const availableSkillIds = options.availableSkillIds
    ? new Set(options.availableSkillIds)
    : null;
  const errors: AssistantJobValidationError[] = [];

  if (!isValidTrigger(draft.trigger)) {
    errors.push({
      code: "invalid_trigger",
      message: "Job trigger is invalid.",
      blocking: true,
    });
  }

  if (draft.destination.kind !== "mission_control") {
    errors.push({
      code: "invalid_destination",
      message: "Assistant Jobs must land in Mission Control in Core v1.",
      blocking: true,
    });
  }

  for (const skillId of draft.requiredSkillIds) {
    if (availableSkillIds && !availableSkillIds.has(skillId)) {
      errors.push({
        code: "skill_missing",
        message: `Recommended skill is not available: ${skillId}.`,
        blocking: false,
      });
    }
  }

  for (const action of draft.actions) {
    const capability = capabilityById.get(action.capabilityId);
    if (!capability) {
      errors.push({
        code: "unknown_capability",
        message: `Unknown capability: ${action.capabilityId}.`,
        blocking: true,
        actionId: action.id,
        capabilityId: action.capabilityId,
      });
      continue;
    }

    if (enabledCapabilityIds && !enabledCapabilityIds.has(capability.id)) {
      errors.push({
        code: "plugin_disabled",
        message: `Capability is not enabled: ${capability.id}.`,
        blocking: true,
        actionId: action.id,
        capabilityId: capability.id,
      });
    }

    if (
      capability.approvalMode === "forbidden" ||
      action.approvalMode === "forbidden"
    ) {
      errors.push({
        code: "forbidden_action",
        message: `Capability cannot be used by Assistant Jobs: ${capability.id}.`,
        blocking: true,
        actionId: action.id,
        capabilityId: capability.id,
      });
    }

    if (!isApprovalModeAtLeast(action.approvalMode, capability.approvalMode)) {
      errors.push({
        code: "approval_too_weak",
        message: `Action approval mode is weaker than capability policy: ${capability.id}.`,
        blocking: true,
        actionId: action.id,
        capabilityId: capability.id,
      });
    }

    if (draft.trigger.kind === "event" && !capability.eventSafe) {
      errors.push({
        code: "event_unsafe_action",
        message: `Capability is not safe for event-triggered jobs: ${capability.id}.`,
        blocking: true,
        actionId: action.id,
        capabilityId: capability.id,
      });
    }

    for (const setupRequirement of capability.requiresSetup) {
      if (isOptionalSetupRequirementForDraft(draft, action, capability, setupRequirement)) {
        continue;
      }
      if (!readySetupRequirements.has(setupRequirement)) {
        errors.push({
          code: "setup_missing",
          message: `Missing setup requirement: ${setupRequirement}.`,
          blocking: true,
          actionId: action.id,
          capabilityId: capability.id,
        });
      }
    }

    for (const inputKey of capability.inputSchema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(action.inputs, inputKey)) {
        errors.push({
          code: "invalid_input",
          message: `Action is missing required input '${inputKey}' for ${capability.id}.`,
          blocking: true,
          actionId: action.id,
          capabilityId: capability.id,
        });
      }
    }
  }

  return {
    status: validationStatusFromErrors(errors),
    errors,
    permissionSummary: buildAssistantJobPermissionSummary(draft, capabilities),
  };
}

export function buildAssistantJobPermissionSummary(
  draft: AssistantJobDraft,
  capabilities: readonly AssistantCapability[] = ASSISTANT_JOB_CAPABILITIES,
): AssistantJobPermissionSummary {
  const capabilityById = new Map(
    capabilities.map((capability) => [capability.id, capability]),
  );
  const reads = new Set<string>();
  const writes = new Set<string>();
  const approvalRequired = new Set<string>();
  const forbidden = new Set<string>();
  const setupRequirements = new Set<string>();

  for (const action of draft.actions) {
    const capability = capabilityById.get(action.capabilityId);
    if (!capability) continue;

    if (
      capability.sideEffect.startsWith("read_") ||
      capability.sideEffect === "local_read"
    ) {
      reads.add(capability.userFacingReadSummary);
    } else {
      writes.add(capability.userFacingWriteSummary);
    }

    for (const setupRequirement of capability.requiresSetup) {
      if (isOptionalSetupRequirementForDraft(draft, action, capability, setupRequirement)) {
        continue;
      }
      setupRequirements.add(setupRequirement);
    }

    if (
      capability.approvalMode === "approval_required" ||
      action.approvalMode === "approval_required"
    ) {
      approvalRequired.add(capability.userFacingWriteSummary);
    }

    if (
      capability.approvalMode === "forbidden" ||
      action.approvalMode === "forbidden"
    ) {
      forbidden.add(capability.label);
    }
  }

  return {
    reads: Array.from(reads),
    writes: Array.from(writes),
    approvalRequired: Array.from(approvalRequired),
    forbidden: Array.from(forbidden),
    setupRequirements: Array.from(setupRequirements),
    skills: Array.from(
      new Set([...draft.recommendedSkillIds, ...draft.requiredSkillIds]),
    ),
  };
}

function isOptionalSetupRequirementForDraft(
  draft: AssistantJobDraft,
  action: AssistantJobAction,
  capability: AssistantCapability,
  setupRequirement: string,
) {
  return (
    draft.recipeId === "daily-briefing" &&
    action.capabilityId === "message.owner.notify" &&
    capability.id === "message.owner.notify" &&
    setupRequirement === "owner_notifications"
  );
}

function assistantJobContextScope(
  input: AssistantJobContextInput,
): AssistantJobContextScope {
  return {
    contactId: input.contextScope?.contactId ?? null,
    emailThreadId: input.contextScope?.emailThreadId ?? null,
    projectId:
      input.contextScope?.projectId ??
      input.destination?.projectId ??
      input.scope?.projectId ??
      null,
    date: input.contextScope?.date ?? null,
  };
}

function assistantJobContextPurpose(
  destination: AssistantJobDestination | null | undefined,
): Me3AgentContextPurpose {
  if (destination?.landing === "memory_review") return "memory_review";
  if (destination?.landing === "review_packet") return "mission_review";
  return "assistant_job";
}

function assistantJobContextRequestSummary(
  input: AssistantJobContextInput,
): string {
  const purpose = input.jobPurpose?.trim();
  return purpose ? `${input.jobName}: ${purpose}` : input.jobName;
}

function assistantJobContextRequestText(
  input: AssistantJobContextInput,
  activeScope: AssistantJobContextScope,
): string {
  return [
    input.requestText,
    input.jobName,
    input.jobPurpose,
    input.jobId ? `job:${input.jobId}` : null,
    input.runId ? `run:${input.runId}` : null,
    input.destination ? `destination:${input.destination.landing}` : null,
    input.scope?.projectId ? `project:${input.scope.projectId}` : null,
    ...(input.scope?.sourceIds ?? []).map((sourceId) => `source:${sourceId}`),
    activeScope.contactId ? `contact:${activeScope.contactId}` : null,
    activeScope.emailThreadId ? `email:${activeScope.emailThreadId}` : null,
    activeScope.projectId ? `project:${activeScope.projectId}` : null,
    activeScope.date ? `date:${activeScope.date}` : null,
    input.trigger ? assistantJobTriggerSummary(input.trigger) : null,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
}

function assistantJobTriggerSummary(trigger: AssistantJobTrigger): string {
  if (trigger.kind === "manual") return "manual run";
  if (trigger.kind === "schedule") {
    return `scheduled ${trigger.cadence} ${trigger.localTime || ""} ${trigger.timezone}`;
  }
  return `event ${trigger.source}:${trigger.sourceId}:${trigger.eventType}`;
}

function isValidTrigger(trigger: AssistantJobTrigger): boolean {
  if (trigger.kind === "manual") return true;
  if (trigger.kind === "schedule") {
    return Boolean(trigger.timezone && trigger.cadence);
  }
  if (trigger.kind === "event") {
    return Boolean(trigger.source && trigger.sourceId && trigger.eventType);
  }
  return false;
}

function validationStatusFromErrors(
  errors: readonly AssistantJobValidationError[],
): AssistantJobDraftValidation["status"] {
  const hasInvalidError = errors.some(
    (error) =>
      error.blocking &&
      error.code !== "setup_missing" &&
      error.code !== "skill_missing",
  );
  if (hasInvalidError) return "invalid";
  const hasSetupError = errors.some(
    (error) => error.code === "setup_missing",
  );
  return hasSetupError ? "needs_setup" : "valid";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
