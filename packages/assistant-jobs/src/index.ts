import {
  buildMe3AgentContextPrompt,
  createMe3AgentContextManifest,
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
} from "@me3/knowledge";

export const ASSISTANT_JOBS_PACKAGE_NAME = "@me3-core/assistant-jobs";

export const ASSISTANT_JOB_APPROVAL_MODES = [
  "none",
  "review_required",
  "approval_required",
  "forbidden",
] as const;

export type AssistantJobApprovalMode = (typeof ASSISTANT_JOB_APPROVAL_MODES)[number];

export const ASSISTANT_JOB_SIDE_EFFECTS = [
  "read_private",
  "read_external",
  "write_internal_draft",
  "write_internal_active",
  "memory_write",
  "notify_owner",
  "external_draft",
  "external_write",
  "external_send",
  "public_publish",
  "destructive",
  "money_or_account",
  "local_read",
  "local_write",
  "local_shell",
  "permission_change",
] as const;

export type AssistantJobSideEffect = (typeof ASSISTANT_JOB_SIDE_EFFECTS)[number];

export type AssistantCapabilityOwner = "core" | "plugin";
export type AssistantCapabilityCategory =
  | "assistant"
  | "mission_control"
  | "email"
  | "calendar"
  | "messaging"
  | "memory"
  | "local"
  | "provider";

export type AssistantCapabilitySchema = {
  type: "object";
  required?: readonly string[];
  properties?: Readonly<Record<string, string>>;
};

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
    | "activity";
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

export type AssistantRecipeVersion = "core_v1" | "later_provider_adapter";
export type AssistantRecipeState = "ready" | "needs_setup" | "manual_only" | "coming_later";

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

export type AssistantJobContextRunManifestSource = Me3AgentContextManifestSource;

export type AssistantJobContextRunManifest = Me3AgentContextManifest;

export type AssistantJobContextResult = {
  packet: Me3AgentContextPacket;
  prompt: Me3AgentContextPrompt;
  manifest: AssistantJobContextRunManifest;
};

const EMPTY_SCHEMA = { type: "object" } as const satisfies AssistantCapabilitySchema;

const APPROVAL_MODE_WEIGHT: Record<AssistantJobApprovalMode, number> = {
  none: 0,
  review_required: 1,
  approval_required: 2,
  forbidden: 3,
};

function capability(
  input: Omit<AssistantCapability, "version" | "inputSchema" | "outputSchema"> & {
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
    label: "Create review packet",
    summary: "Create a scan-friendly Mission Control review packet.",
    category: "mission_control",
    sideEffect: "write_internal_draft",
    approvalMode: "review_required",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads scoped Mission Control context.",
    userFacingWriteSummary: "Creates a Mission Control review packet.",
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
    id: "mission.capture.create",
    owner: "plugin",
    pluginId: "me3.mission-control",
    label: "Create capture",
    summary: "Create a Mission Control capture.",
    category: "mission_control",
    sideEffect: "write_internal_active",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads the job output.",
    userFacingWriteSummary: "Creates a Mission Control capture.",
    auditEventKind: "mission_capture_created",
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
    summary: "Read scoped Mission Control tasks and captures.",
    category: "mission_control",
    sideEffect: "read_private",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: [],
    userFacingReadSummary: "Reads scoped Mission Control tasks and captures.",
    userFacingWriteSummary: "Does not change owner data.",
    auditEventKind: "mission_task_read",
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
  capability({
    id: "source.generic.read",
    owner: "plugin",
    pluginId: "me3.source",
    label: "Read connected source",
    summary: "Read a scoped connected source.",
    category: "provider",
    sideEffect: "read_external",
    approvalMode: "none",
    eventSafe: true,
    manualRunSafe: true,
    requiresSetup: ["source"],
    userFacingReadSummary: "Reads a scoped connected source.",
    userFacingWriteSummary: "Does not change the source.",
    auditEventKind: "source_generic_read",
  }),
] as const satisfies readonly AssistantCapability[];

export const ASSISTANT_JOB_CAPABILITY_IDS = ASSISTANT_JOB_CAPABILITIES.map(
  (capability) => capability.id,
);

export function getAssistantJobCapability(
  capabilityId: string,
  capabilities: readonly AssistantCapability[] = ASSISTANT_JOB_CAPABILITIES,
): AssistantCapability | null {
  return capabilities.find((capability) => capability.id === capabilityId) ?? null;
}

export function isApprovalModeAtLeast(
  requested: AssistantJobApprovalMode,
  required: AssistantJobApprovalMode,
): boolean {
  return APPROVAL_MODE_WEIGHT[requested] >= APPROVAL_MODE_WEIGHT[required];
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
): AssistantJobAction {
  return {
    id,
    capabilityId,
    label,
    inputs: {},
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
  recommendedSkillIds?: readonly string[];
  requiredSkillIds?: readonly string[];
}): AssistantJobDraft {
  return {
    name: input.name,
    purpose: input.purpose,
    recipeId: input.recipeId,
    trigger: input.trigger,
    scope: input.scope ?? DEFAULT_SCOPE,
    rules: [],
    actions: input.actions,
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    destination: input.destination,
    projectId: input.scope?.projectId ?? null,
    recommendedSkillIds: input.recommendedSkillIds ?? [],
    requiredSkillIds: input.requiredSkillIds ?? [],
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
    outcome: "Summarize the week, project changes, unfinished tasks, and carry-over choices.",
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
      purpose: "Prepare a weekly Mission Control review with carry-over choices.",
      recipeId: "weekly-review",
      trigger: weeklySchedule,
      destination: missionDestination("review_packet"),
      actions: [
        action("read-projects", "mission.project.read", "Read project state", "none"),
        action("read-tasks", "mission.task.read", "Read open tasks", "none"),
        action("read-approvals", "mission.approval.read", "Read pending approvals", "none"),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create weekly review packet",
          "review_required",
        ),
        action("create-activity", "mission.activity.create", "Record job activity", "none"),
      ],
    }),
  },
  {
    id: "daily-briefing",
    name: "Daily Briefing",
    outcome: "Prepare a morning review of today's tasks, approvals, and due items.",
    firstVersion: "core_v1",
    state: "ready",
    requiredCapabilityIds: [
      "mission.task.read",
      "mission.approval.read",
      "mission.review_packet.create",
      "mission.activity.create",
    ],
    optionalCapabilityIds: [],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Daily Briefing",
      purpose: "Prepare a daily Mission Control briefing.",
      recipeId: "daily-briefing",
      trigger: dailySchedule,
      destination: missionDestination("review_packet"),
      actions: [
        action("read-tasks", "mission.task.read", "Read today's tasks", "none"),
        action("read-approvals", "mission.approval.read", "Read pending approvals", "none"),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create daily briefing packet",
          "review_required",
        ),
      ],
    }),
  },
  {
    id: "source-monitor",
    name: "Source Monitor",
    outcome: "Watch a connected source for relevant changes and prepare a review item.",
    firstVersion: "later_provider_adapter",
    state: "needs_setup",
    requiredCapabilityIds: [
      "source.generic.read",
      "mission.review_packet.create",
      "mission.activity.create",
    ],
    optionalCapabilityIds: [],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Source Monitor",
      purpose: "Create Mission Control review items from a connected source.",
      recipeId: "source-monitor",
      trigger: { kind: "manual" },
      destination: missionDestination("review_packet"),
      actions: [
        action("read-source", "source.generic.read", "Read connected source", "none"),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create source review packet",
          "review_required",
        ),
      ],
    }),
  },
  {
    id: "email-watch",
    name: "Email Watch",
    outcome: "Create a Mission Control review item when important email arrives.",
    firstVersion: "later_provider_adapter",
    state: "needs_setup",
    requiredCapabilityIds: ["email.message.read", "mission.review_packet.create"],
    optionalCapabilityIds: ["message.owner.notify", "email.reply.draft"],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Email Watch",
      purpose: "Watch scoped email and create Mission Control review items.",
      recipeId: "email-watch",
      trigger: {
        kind: "event",
        source: "plugin",
        sourceId: "me3.email",
        eventType: "email.message.received",
        filters: [],
      },
      destination: missionDestination("review_packet"),
      actions: [
        action("read-email", "email.message.read", "Read scoped email", "none"),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create email review packet",
          "review_required",
        ),
      ],
    }),
  },
  {
    id: "email-triage",
    name: "Email Triage",
    outcome: "Summarize inbox messages that need the owner and draft replies where useful.",
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
      name: "Email Triage",
      purpose: "Summarize important email into Mission Control.",
      recipeId: "email-triage",
      trigger: dailySchedule,
      destination: missionDestination("review_packet"),
      actions: [
        action("read-email", "email.message.read", "Read scoped email", "none"),
        action("summarize-thread", "email.thread.summarize", "Summarize email threads", "none"),
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
    outcome: "Find likely invoices and receipts, extract useful fields, and create review tasks.",
    firstVersion: "later_provider_adapter",
    state: "needs_setup",
    requiredCapabilityIds: ["email.message.read", "mission.review_packet.create", "mission.task.create"],
    optionalCapabilityIds: [],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Invoice and Receipt Triage",
      purpose: "Extract likely invoice and receipt details for review.",
      recipeId: "invoice-receipt-triage",
      trigger: dailySchedule,
      destination: missionDestination("review_packet"),
      actions: [
        action("read-email", "email.message.read", "Read scoped email", "none"),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create invoice review packet",
          "review_required",
        ),
        action("create-task", "mission.task.create", "Create payment follow-up tasks", "none"),
      ],
    }),
  },
  {
    id: "booking-reminder",
    name: "Booking Reminder",
    outcome: "Prepare context before a meeting or booking and create follow-up tasks after.",
    firstVersion: "later_provider_adapter",
    state: "needs_setup",
    requiredCapabilityIds: ["calendar.event.read", "mission.review_packet.create", "mission.task.create"],
    optionalCapabilityIds: ["email.thread.summarize", "message.owner.notify"],
    recommendedSkillIds: [],
    requiredSkillIds: [],
    defaultDraft: draft({
      name: "Booking Reminder",
      purpose: "Prepare meeting or booking context in Mission Control.",
      recipeId: "booking-reminder",
      trigger: {
        kind: "event",
        source: "plugin",
        sourceId: "me3.calendar",
        eventType: "calendar.event.upcoming",
        filters: [],
      },
      destination: missionDestination("review_packet"),
      actions: [
        action("read-calendar", "calendar.event.read", "Read scoped calendar events", "none"),
        action(
          "create-review-packet",
          "mission.review_packet.create",
          "Create booking reminder packet",
          "review_required",
        ),
        action("create-task", "mission.task.create", "Create follow-up tasks", "none"),
      ],
    }),
  },
] as const satisfies readonly AssistantJobStarterRecipe[];

export function getAssistantJobStarterRecipe(
  recipeId: string,
): AssistantJobStarterRecipe | null {
  return ASSISTANT_JOB_STARTER_RECIPES.find((recipe) => recipe.id === recipeId) ?? null;
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

export function createAssistantJobContext(
  input: AssistantJobContextInput,
): AssistantJobContextResult {
  const activeScope = assistantJobContextScope(input);
  const requestText = assistantJobContextRequestText(input, activeScope);
  const purpose = input.purpose ?? assistantJobContextPurpose(input.destination);

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
  const capabilityById = new Map(capabilities.map((capability) => [capability.id, capability]));
  const enabledCapabilityIds = options.enabledCapabilityIds
    ? new Set(options.enabledCapabilityIds)
    : null;
  const readySetupRequirements = new Set(options.readySetupRequirements ?? []);
  const availableSkillIds = options.availableSkillIds ? new Set(options.availableSkillIds) : null;
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
        message: `Required skill is not available: ${skillId}.`,
        blocking: true,
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

    if (capability.approvalMode === "forbidden" || action.approvalMode === "forbidden") {
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
  const capabilityById = new Map(capabilities.map((capability) => [capability.id, capability]));
  const reads = new Set<string>();
  const writes = new Set<string>();
  const approvalRequired = new Set<string>();
  const forbidden = new Set<string>();
  const setupRequirements = new Set<string>();

  for (const action of draft.actions) {
    const capability = capabilityById.get(action.capabilityId);
    if (!capability) continue;

    if (capability.sideEffect.startsWith("read_") || capability.sideEffect === "local_read") {
      reads.add(capability.userFacingReadSummary);
    } else {
      writes.add(capability.userFacingWriteSummary);
    }

    for (const setupRequirement of capability.requiresSetup) {
      setupRequirements.add(setupRequirement);
    }

    if (
      capability.approvalMode === "approval_required" ||
      action.approvalMode === "approval_required"
    ) {
      approvalRequired.add(capability.userFacingWriteSummary);
    }

    if (capability.approvalMode === "forbidden" || action.approvalMode === "forbidden") {
      forbidden.add(capability.label);
    }
  }

  return {
    reads: Array.from(reads),
    writes: Array.from(writes),
    approvalRequired: Array.from(approvalRequired),
    forbidden: Array.from(forbidden),
    setupRequirements: Array.from(setupRequirements),
    skills: Array.from(new Set([...draft.recommendedSkillIds, ...draft.requiredSkillIds])),
  };
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

function assistantJobContextRequestSummary(input: AssistantJobContextInput): string {
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
      error.blocking && error.code !== "setup_missing" && error.code !== "skill_missing",
  );
  if (hasInvalidError) return "invalid";
  const hasSetupError = errors.some(
    (error) => error.code === "setup_missing" || error.code === "skill_missing",
  );
  return hasSetupError ? "needs_setup" : "valid";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
