import { normalizeTimeZone } from "@me3-core/plugin-calendar";
import type {
  AgentChatActionCard,
  AgentChatModelAttemptTrace,
  AgentMailboxDraftInput,
  AgentMailboxMessage,
  AgentMailboxMessageListOptions,
  AgentChatRuntimeStreamOptions,
  AgentSandboxDispatchResponse,
} from "./index";
import { runAgentToolModelStep } from "./model-tool-runtime";
import { runAgentToolModelStreamStep } from "./model-tool-stream-runtime";
import { modelErrorMessage, type AgentChatAiRoute } from "./model-runtime";
import {
  archiveAgentMissionTask,
  createAgentMissionTask,
  getAgentMissionTask,
  listAgentMissionProjects,
  listAgentMissionTasks,
  slugifyMissionProjectName,
  updateAgentMissionTask,
  type AgentMissionProject,
  type AgentMissionTask,
} from "@me3-core/plugin-mission-control";
import {
  cancelAgentReminder,
  createAgentReminder,
  getPendingAgentReminder,
  listPendingAgentReminders,
  parseAgentReminderInput,
  updateAgentReminder,
  type AgentReminder,
  type AgentReminderInput,
} from "./reminders";
import { executeIdempotentAgentTool } from "./tool-idempotency";
import {
  runAgentToolLoop,
  type AgentToolCall,
  type AgentToolMessage,
} from "./tool-runtime";
import {
  CORE_CHAT_TOOLS,
  type CoreChatToolDefinition,
} from "./tools";
import {
  agentSocialSourceKey,
  createAgentSocialDraft,
  readAgentSocialSource,
  type AgentSocialSource,
  type AgentSocialSourceType,
} from "./social-content";
import {
  searchAgentOwnerContent,
  type AgentOwnerContentSearchResult,
  type AgentOwnerContentSourceType,
} from "./owner-content-search";

type CoreAgentDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
  batch?: unknown;
};

type CoreToolOutcome = {
  capabilityId: CoreChatToolDefinition["capabilityId"];
  result: Record<string, unknown>;
  fallbackReply: string;
  reminderAction: AgentSandboxDispatchResponse["reminderAction"];
  emailAction?: AgentSandboxDispatchResponse["emailAction"];
  contentAction?: AgentSandboxDispatchResponse["contentAction"];
  actionCards: AgentChatActionCard[];
};

export type CoreMailboxToolServices = {
  search(
    options: AgentMailboxMessageListOptions,
  ): Promise<{ messages: AgentMailboxMessage[]; total: number }>;
  read(
    messageId: string,
  ): Promise<{ message: AgentMailboxMessage } | { error: string; status: number }>;
  createDraft(
    input: AgentMailboxDraftInput,
    idempotencyKey: string,
  ): Promise<{ draft: AgentMailboxMessage } | { error: string; status: number }>;
};

const ACTIVE_CORE_TOOLS = CORE_CHAT_TOOLS.filter(
  (tool) =>
    tool.capabilityId.startsWith("core.reminders.") ||
    tool.capabilityId === "core.owner_content.search" ||
    tool.capabilityId.startsWith("core.mission.task.") ||
    tool.capabilityId.startsWith("core.mailbox.") ||
    tool.capabilityId.startsWith("core.social."),
);
const MISSION_TASK_STATUSES = new Set(["backlog", "in_progress", "review", "done"]);
const OWNER_CONTENT_SOURCE_TYPES = new Set(["all", "journal", "mission_task"]);
const MAILBOX_FOLDERS = new Set(["inbox", "drafts", "sent", "archive", "trash"]);

export async function runCoreAgentToolTurn(input: {
  db: CoreAgentDb;
  userId: string;
  requestId: string;
  turnId: string;
  ownerTimezone: string | null | undefined;
  route: AgentChatAiRoute;
  messages: readonly AgentToolMessage[];
  mailboxServices?: CoreMailboxToolServices;
  streamOptions?: AgentChatRuntimeStreamOptions;
}): Promise<AgentSandboxDispatchResponse> {
  const startedAt = performance.now();
  let firstTokenAt: number | null = null;
  let deltaCount = 0;
  let modelStep = 0;
  const emit = async (event: Parameters<AgentChatRuntimeStreamOptions["onEvent"]>[0]) => {
    await input.streamOptions?.onEvent(event);
  };
  const emitDelta = async (text: string) => {
    if (!text) return;
    firstTokenAt ??= performance.now();
    deltaCount += 1;
    await emit({ event: "delta", data: { text } });
  };
  const messages = withCoreToolInstructions(
    input.messages,
    input.ownerTimezone,
  );
  const outcomes: CoreToolOutcome[] = [];
  const socialSources = new Map<string, AgentSocialSource>();
  const modelAttempts: AgentChatModelAttemptTrace[] = [];
  const tools = input.mailboxServices
    ? ACTIVE_CORE_TOOLS
    : ACTIVE_CORE_TOOLS.filter(
      (tool) => !tool.capabilityId.startsWith("core.mailbox."),
    );
  const models = input.route.backupModel && input.route.backupModel !== input.route.model
    ? [input.route.model, input.route.backupModel]
    : [input.route.model];
  let lastError: unknown = null;

  for (const model of models) {
    const callCounts = new Map<string, number>();
    try {
      const result = await runAgentToolLoop({
        messages,
        tools,
        model: async (turnMessages, tools) => {
          throwIfStreamAborted(input.streamOptions?.signal);
          modelStep += 1;
          await emit({
            event: "status",
            data: { state: "model_started", modelStep, model },
          });
          return input.streamOptions
            ? runAgentToolModelStreamStep(
                { ...input.route, model },
                turnMessages,
                tools,
                emitDelta,
                input.streamOptions.signal,
              )
            : runAgentToolModelStep(
                { ...input.route, model },
                turnMessages,
                tools,
              );
        },
        executeTool: async (call, tool) => {
          throwIfStreamAborted(input.streamOptions?.signal);
          await emit({
            event: "tool",
            data: {
              state: "started",
              toolCallId: call.id,
              toolName: call.name,
              capabilityId: (tool as CoreChatToolDefinition).capabilityId,
              clearText: true,
            },
          });
          const occurrence = (callCounts.get(call.id) || 0) + 1;
          callCounts.set(call.id, occurrence);
          try {
            const outcome = await executeIdempotentAgentTool(
              input.db,
              {
                userId: input.userId,
                requestId: input.requestId,
                toolCallId: `${call.id}:${occurrence}`,
                toolName: call.name,
              },
              ({ idempotencyKey }) =>
                executeCoreToolCall({
                  db: input.db,
                  userId: input.userId,
                  ownerTimezone: input.ownerTimezone,
                  idempotencyKey,
                  call,
                  tool: tool as CoreChatToolDefinition,
                  mailboxServices: input.mailboxServices,
                  socialSources,
                }),
            );
            cacheSocialSourceOutcome(outcome, socialSources);
            outcomes.push(outcome);
            await emit({
              event: "tool",
              data: {
                state: "completed",
                toolCallId: call.id,
                toolName: call.name,
                capabilityId: outcome.capabilityId,
              },
            });
            return outcome.result;
          } catch (error) {
            await emit({
              event: "tool",
              data: {
                state: "failed",
                toolCallId: call.id,
                toolName: call.name,
                error: modelErrorMessage(error) || "Tool execution failed.",
              },
            });
            throw error;
          }
        },
      });
      modelAttempts.push({
        providerId: input.route.providerId,
        model,
        status: "succeeded",
        error: null,
      });
      return attachStreamMetrics(
        successfulResponse(
          input.turnId,
          input.route,
          model,
          result.text,
          outcomes.at(-1) || null,
          modelAttempts,
        ),
        input.streamOptions,
        startedAt,
        firstTokenAt,
        deltaCount,
      );
    } catch (error) {
      lastError = error;
      const empty = modelErrorMessage(error).includes(
        "returned neither text nor tool calls",
      );
      modelAttempts.push({
        providerId: input.route.providerId,
        model,
        status: empty ? "empty" : "failed",
        error: empty
          ? "Model returned an empty reply."
          : modelErrorMessage(error) || "Agent model request failed.",
      });
      if (outcomes.length > 0) break;
    }
  }

  return attachStreamMetrics(
    fallbackResponse(
      input.turnId,
      input.route,
      outcomes.at(-1) || null,
      modelAttempts,
      lastError,
    ),
    input.streamOptions,
    startedAt,
    firstTokenAt,
    deltaCount,
  );
}

function attachStreamMetrics(
  response: AgentSandboxDispatchResponse,
  streamOptions: AgentChatRuntimeStreamOptions | undefined,
  startedAt: number,
  firstTokenAt: number | null,
  deltaCount: number,
): AgentSandboxDispatchResponse {
  if (!streamOptions) return response;
  return {
    ...response,
    streamMetrics: {
      timeToFirstTokenMs: firstTokenAt === null
        ? null
        : Number((firstTokenAt - startedAt).toFixed(2)),
      totalDurationMs: Number((performance.now() - startedAt).toFixed(2)),
      deltaCount,
    },
  };
}

function throwIfStreamAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function executeCoreToolCall(input: {
  db: CoreAgentDb;
  userId: string;
  ownerTimezone: string | null | undefined;
  idempotencyKey: string;
  call: AgentToolCall;
  tool: CoreChatToolDefinition;
  mailboxServices?: CoreMailboxToolServices;
  socialSources: Map<string, AgentSocialSource>;
}): Promise<CoreToolOutcome> {
  if (input.tool.capabilityId.startsWith("core.reminders.")) {
    return executeReminderToolCall(input);
  }
  if (input.tool.capabilityId.startsWith("core.mission.task.")) {
    return executeMissionTaskToolCall(input);
  }
  if (input.tool.capabilityId === "core.owner_content.search") {
    return executeOwnerContentSearchToolCall(input);
  }
  if (input.tool.capabilityId.startsWith("core.social.")) {
    return executeSocialToolCall(input);
  }
  return executeMailboxToolCall(input);
}

async function executeReminderToolCall(input: {
  db: CoreAgentDb;
  userId: string;
  ownerTimezone: string | null | undefined;
  idempotencyKey: string;
  call: AgentToolCall;
  tool: CoreChatToolDefinition;
}): Promise<CoreToolOutcome> {
  enforceReminderToolPolicy(input.tool);
  assertOnlyDeclaredArguments(input.call.arguments, input.tool);

  if (input.tool.capabilityId === "core.reminders.list") {
    const reminders = await listPendingAgentReminders(
      { DB: input.db },
      input.userId,
    );
    return {
      capabilityId: "core.reminders.list",
      result: { ok: true, reminders },
      fallbackReply: formatReminderList(reminders, input.ownerTimezone),
      reminderAction: { kind: "listed" },
      actionCards: [],
    };
  }

  if (input.tool.capabilityId === "core.reminders.cancel") {
    const reminderId = requiredString(input.call.arguments.reminderId, "reminderId");
    const reminder = await getPendingAgentReminder(
      { DB: input.db },
      input.userId,
      reminderId,
    );
    if (!reminder) throw new Error("Reminder not found. List reminders and use a valid stable ID.");
    const result = await cancelAgentReminder(
      { DB: input.db },
      input.userId,
      reminderId,
    );
    if ("error" in result) throw new Error(result.error);
    const cancelled = { ...reminder, status: "cancelled" as const };
    return {
      capabilityId: "core.reminders.cancel",
      result: { ok: true, reminder: cancelled },
      fallbackReply: `Cancelled the reminder: ${reminder.title}.`,
      reminderAction: {
        kind: "cancelled",
        reminderId,
        title: reminder.title,
        remindAt: reminder.remindAt,
      },
      actionCards: [buildReminderActionCard(cancelled, "cancelled")],
    };
  }

  const reminderInput = reminderInputFromArguments(
    input.call.arguments,
    input.ownerTimezone,
  );
  assertFutureReminder(reminderInput);

  if (input.tool.capabilityId === "core.reminders.create") {
    const reminder = await createAgentReminder(
      { DB: input.db },
      input.userId,
      reminderInput,
      { idempotencyKey: input.idempotencyKey },
    );
    if ("error" in reminder) throw new Error(reminder.error);
    return reminderWriteOutcome(reminder, "created");
  }

  const reminderId = requiredString(input.call.arguments.reminderId, "reminderId");
  const reminder = await updateAgentReminder(
    { DB: input.db },
    input.userId,
    reminderId,
    reminderInput,
  );
  if ("error" in reminder) {
    throw new Error(
      reminder.status === 404
        ? "Reminder not found. List reminders and use a valid stable ID."
        : reminder.error,
    );
  }
  return reminderWriteOutcome(reminder, "updated");
}

async function executeOwnerContentSearchToolCall(input: {
  db: CoreAgentDb;
  userId: string;
  call: AgentToolCall;
  tool: CoreChatToolDefinition;
}): Promise<CoreToolOutcome> {
  enforceOwnerContentSearchToolPolicy(input.tool);
  assertOnlyDeclaredArguments(input.call.arguments, input.tool);
  const args = input.call.arguments;
  const sourceTypeValue = optionalToolString(args.sourceType) || "all";
  if (!OWNER_CONTENT_SOURCE_TYPES.has(sourceTypeValue)) {
    throw new Error(`Invalid owner content source type "${sourceTypeValue}".`);
  }
  const projectIdInput = optionalToolString(args.projectId);
  const projectName = optionalToolString(args.projectName);
  const projectId = projectIdInput || projectName
    ? resolveMissionTaskProjectId(
        await listAgentMissionProjects({ DB: input.db }, input.userId),
        projectIdInput,
        projectName,
      )
    : undefined;
  const found = await searchAgentOwnerContent(input.db, input.userId, {
    query: requiredToolString(args.query, "Owner content search query"),
    sourceType: sourceTypeValue as AgentOwnerContentSourceType | "all",
    projectId,
    status: optionalToolString(args.status),
    dateFrom: optionalToolString(args.dateFrom),
    dateTo: optionalToolString(args.dateTo),
    limit: optionalToolNumber(args.limit),
  });
  return {
    capabilityId: "core.owner_content.search",
    result: { ok: true, ...found },
    fallbackReply: formatOwnerContentSearch(found.results, found.ambiguous),
    reminderAction: null,
    actionCards: [],
  };
}

async function executeMissionTaskToolCall(input: {
  db: CoreAgentDb;
  userId: string;
  idempotencyKey: string;
  call: AgentToolCall;
  tool: CoreChatToolDefinition;
}): Promise<CoreToolOutcome> {
  enforceMissionTaskToolPolicy(input.tool);
  assertOnlyDeclaredArguments(input.call.arguments, input.tool);
  const args = input.call.arguments;

  if (input.tool.capabilityId === "core.mission.task.list") {
    const [allTasks, projects] = await Promise.all([
      listAgentMissionTasks({ DB: input.db }, input.userId),
      listAgentMissionProjects({ DB: input.db }, input.userId),
    ]);
    const projectId = resolveMissionTaskProjectId(
      projects,
      optionalToolString(args.projectId),
      optionalToolString(args.projectName),
    );
    const status = optionalToolString(args.status);
    if (status && !MISSION_TASK_STATUSES.has(status)) {
      throw new Error(`Invalid Mission task status "${status}".`);
    }
    const tasks = allTasks.filter(
      (task) =>
        (!projectId || task.projectId === projectId) &&
        (!status || task.status === status),
    );
    return {
      capabilityId: "core.mission.task.list",
      result: { ok: true, tasks, projects },
      fallbackReply: formatMissionTaskList(tasks),
      reminderAction: null,
      actionCards: [],
    };
  }

  if (input.tool.capabilityId === "core.mission.task.read") {
    const taskId = requiredToolString(args.taskId, "Task taskId");
    const task = await getAgentMissionTask({ DB: input.db }, input.userId, taskId);
    if (!task) throw new Error("Mission task not found. List tasks and use a valid stable ID.");
    return {
      capabilityId: "core.mission.task.read",
      result: { ok: true, task },
      fallbackReply: formatMissionTask(task),
      reminderAction: null,
      actionCards: [],
    };
  }

  if (input.tool.capabilityId === "core.mission.task.create") {
    const task = await createAgentMissionTask(
      { DB: input.db },
      input.userId,
      {
        title: requiredToolString(args.title, "Task title"),
        description: optionalToolString(args.description),
        projectId: optionalToolString(args.projectId),
        dueAt: optionalToolString(args.dueAt),
        priority: optionalToolNumber(args.priority),
        idempotencyKey: input.idempotencyKey,
      },
    );
    if ("error" in task) throw new Error(task.error);
    return missionTaskWriteOutcome(task, "created");
  }

  const taskId = requiredToolString(args.taskId, "Task taskId");
  if (input.tool.capabilityId === "core.mission.task.archive") {
    const task = await archiveAgentMissionTask(
      { DB: input.db },
      input.userId,
      taskId,
    );
    if ("error" in task) throw new Error(task.error);
    return missionTaskWriteOutcome(task, "archived");
  }

  if (optionalToolBoolean(args.clearDescription) && optionalToolString(args.description)) {
    throw new Error("Task update cannot set and clear the description at the same time.");
  }
  if (optionalToolBoolean(args.clearDueAt) && optionalToolString(args.dueAt)) {
    throw new Error("Task update cannot set and clear the due date at the same time.");
  }
  const updates = {
    title: optionalToolString(args.title),
    description: optionalToolBoolean(args.clearDescription)
      ? null
      : optionalToolString(args.description),
    projectId: optionalToolString(args.projectId),
    status: optionalToolString(args.status),
    dueAt: optionalToolBoolean(args.clearDueAt)
      ? null
      : optionalToolString(args.dueAt),
    priority: optionalToolNumber(args.priority),
  };
  if (!Object.values(updates).some((value) => value !== undefined)) {
    throw new Error("Task update requires at least one field to change.");
  }
  const task = await updateAgentMissionTask(
    { DB: input.db },
    input.userId,
    { taskId, ...updates },
  );
  if ("error" in task) throw new Error(task.error);
  return missionTaskWriteOutcome(task, "updated");
}

function missionTaskWriteOutcome(
  task: AgentMissionTask,
  action: "created" | "updated" | "archived",
): CoreToolOutcome {
  const capabilityId = action === "created"
    ? "core.mission.task.create" as const
    : action === "updated"
      ? "core.mission.task.update" as const
      : "core.mission.task.archive" as const;
  return {
    capabilityId,
    result: { ok: true, task },
    fallbackReply: `${action === "archived" ? "Archived" : action === "created" ? "Created" : "Updated"} the Mission Control task: ${task.title}.`,
    reminderAction: null,
    actionCards: [buildMissionTaskActionCard(task, action)],
  };
}

export function buildMissionTaskActionCard(
  task: AgentMissionTask,
  action: "created" | "updated" | "archived",
): AgentChatActionCard {
  const capabilityId = action === "created"
    ? "core.mission.task.create"
    : action === "updated"
      ? "core.mission.task.update"
      : "core.mission.task.archive";
  return {
    id: `mission-task:${task.id}`,
    kind: action === "created"
      ? "mission.task_created"
      : action === "updated"
        ? "mission.task_updated"
        : "mission.task_archived",
    capabilityId,
    title: `Mission Control task ${action}`,
    summary: task.title,
    status: "complete",
    statusLabel: "Complete",
    changed: [
      { label: "Task", value: task.title },
      { label: "Project", value: task.projectName },
      ...(task.dueAt ? [{ label: "Due", value: task.dueAt }] : []),
      { label: "Priority", value: String(task.priority) },
      { label: "Status", value: action === "archived" ? "archived" : task.status },
    ],
    records: [{ kind: "mission_task", id: task.id }],
    primaryAction: { label: "Open Mission Control", href: "/mission-control" },
    secondaryActions: [],
  };
}

async function executeSocialToolCall(input: {
  db: CoreAgentDb;
  userId: string;
  ownerTimezone: string | null | undefined;
  call: AgentToolCall;
  tool: CoreChatToolDefinition;
  socialSources: Map<string, AgentSocialSource>;
}): Promise<CoreToolOutcome> {
  enforceSocialToolPolicy(input.tool);
  assertOnlyDeclaredArguments(input.call.arguments, input.tool);
  const args = input.call.arguments;
  const sourceType = socialSourceType(args.sourceType);
  const sourceId = requiredToolString(args.sourceId, "Social sourceId");

  if (input.tool.capabilityId === "core.social.source.read") {
    const source = await readAgentSocialSource(
      input.db,
      input.userId,
      sourceType,
      sourceId,
      input.ownerTimezone,
    );
    cacheSocialSource(source, input.socialSources);
    return {
      capabilityId: "core.social.source.read",
      result: { ok: true, source },
      fallbackReply: `Read the social post source: ${source.title}. Source: ${source.sourceType}:${source.id}.`,
      reminderAction: null,
      actionCards: [],
    };
  }

  let source = input.socialSources.get(agentSocialSourceKey(sourceType, sourceId));
  if (!source) {
    source = await readAgentSocialSource(
      input.db,
      input.userId,
      sourceType,
      sourceId,
      input.ownerTimezone,
    );
    cacheSocialSource(source, input.socialSources);
  }
  const detail = await createAgentSocialDraft(input.db, input.userId, source, {
    siteId: optionalToolString(args.siteId),
    ideaText: requiredToolString(args.ideaText, "Social draft ideaText"),
    linkedinBody: optionalToolString(args.linkedinBody),
    xBody: optionalToolString(args.xBody),
    instagramBody: optionalToolString(args.instagramBody),
  });
  const platforms = detail.variants.map((variant) => variant.platform);
  return {
    capabilityId: "core.social.draft.create",
    result: {
      ok: true,
      package: detail.package,
      variants: detail.variants,
      approved: false,
      published: false,
    },
    fallbackReply: `Saved ${platforms.length} social draft${platforms.length === 1 ? "" : "s"} from ${source.title} for review. Nothing was approved or published.`,
    reminderAction: null,
    contentAction: {
      kind: "saved",
      itemId: detail.package.id,
      packageId: detail.package.id,
      platforms,
    },
    actionCards: [buildSocialDraftActionCard(detail, source)],
  };
}

function buildSocialDraftActionCard(
  detail: Awaited<ReturnType<typeof createAgentSocialDraft>>,
  source: AgentSocialSource,
): AgentChatActionCard {
  const platformLabels = detail.variants.map((variant) =>
    variant.platform === "x"
      ? "X"
      : variant.platform === "linkedin"
        ? "LinkedIn"
        : "Instagram"
  );
  return {
    id: `social-package:${detail.package.id}`,
    kind: "social.draft_saved",
    capabilityId: "core.social.draft.create",
    title: "Social drafts saved",
    summary: detail.package.ideaText,
    status: "pending_approval",
    statusLabel: "Needs review",
    changed: [
      { label: "Source", value: source.title },
      { label: "Platforms", value: platformLabels.join(", ") },
      { label: "Approval", value: "Not approved" },
      { label: "Publishing", value: "Not published" },
    ],
    records: [{ kind: "social_package", id: detail.package.id }],
    primaryAction: { label: "Review drafts", href: "/social" },
    secondaryActions: [],
  };
}

async function executeMailboxToolCall(input: {
  idempotencyKey: string;
  call: AgentToolCall;
  tool: CoreChatToolDefinition;
  mailboxServices?: CoreMailboxToolServices;
}): Promise<CoreToolOutcome> {
  enforceMailboxToolPolicy(input.tool);
  assertOnlyDeclaredArguments(input.call.arguments, input.tool);
  const services = input.mailboxServices;
  if (!services) throw new Error("Mailbox tools are not configured for this runtime.");
  const args = input.call.arguments;

  if (input.tool.capabilityId === "core.mailbox.search") {
    const direction = optionalToolString(args.direction);
    if (direction && direction !== "inbound" && direction !== "outbound") {
      throw new Error(`Invalid mailbox direction "${direction}".`);
    }
    const folder = optionalToolString(args.folder);
    if (folder && !MAILBOX_FOLDERS.has(folder)) {
      throw new Error(`Invalid mailbox folder "${folder}".`);
    }
    const limitValue = optionalToolNumber(args.limit);
    const limit = limitValue === undefined ? 10 : Math.trunc(limitValue);
    if (limit < 1 || limit > 20) {
      throw new Error("Mailbox search limit must be between 1 and 20.");
    }
    const found = await services.search({
      query: optionalToolString(args.query),
      direction: direction || "all",
      folder,
      unread: optionalToolBoolean(args.unread) ? "true" : undefined,
      limit,
      offset: 0,
    });
    const messages = found.messages.map(mailboxMessageSummary);
    return {
      capabilityId: "core.mailbox.search",
      result: { ok: true, messages, total: found.total },
      fallbackReply: formatMailboxSearch(messages),
      reminderAction: null,
      actionCards: [],
    };
  }

  if (input.tool.capabilityId === "core.mailbox.read") {
    const messageId = requiredToolString(args.messageId, "Mailbox messageId");
    const result = await services.read(messageId);
    if ("error" in result) {
      throw new Error("Mailbox message not found. Search mail and use a valid stable ID.");
    }
    const message = mailboxMessageDetail(result.message);
    return {
      capabilityId: "core.mailbox.read",
      result: { ok: true, message },
      fallbackReply: formatMailboxMessage(message),
      reminderAction: null,
      actionCards: [],
    };
  }

  const to = requiredToolString(args.to, "Draft recipient").toLowerCase();
  const subject = requiredToolString(args.subject, "Draft subject");
  const body = requiredToolString(args.body, "Draft body");
  const replyToMessageId = optionalToolString(args.replyToMessageId);
  if (replyToMessageId) {
    const replyTo = await services.read(replyToMessageId);
    if ("error" in replyTo) {
      throw new Error("Reply message not found. Search mail and use a valid stable ID.");
    }
    const expectedRecipient = replyTo.message.direction === "inbound"
      ? replyTo.message.fromAddress
      : replyTo.message.toAddress;
    if (expectedRecipient && expectedRecipient.toLowerCase() !== to) {
      throw new Error(
        `Draft recipient must match the selected reply message (${expectedRecipient}).`,
      );
    }
  }
  const result = await services.createDraft(
    {
      toAddress: to,
      subject,
      textBody: body,
      replyToMessageId,
      source: "agent",
    },
    input.idempotencyKey,
  );
  if ("error" in result) throw new Error(result.error);
  const draft = mailboxMessageDetail(result.draft);
  return {
    capabilityId: "core.mailbox.draft",
    result: { ok: true, draft, sent: false },
    fallbackReply: "Saved the email as a mailbox draft for review. It has not been sent.",
    reminderAction: null,
    emailAction: { kind: "drafted", draftId: result.draft.id },
    actionCards: [buildMailboxDraftActionCard(result.draft)],
  };
}

function buildMailboxDraftActionCard(draft: AgentMailboxMessage): AgentChatActionCard {
  return {
    id: `mailbox-draft:${draft.id}`,
    kind: "mailbox.draft_saved",
    capabilityId: "core.mailbox.draft",
    title: "Email draft saved",
    summary: "Saved to mailbox drafts for review. It has not been sent.",
    status: "pending_approval",
    statusLabel: "Needs review",
    changed: [
      { label: "Draft", value: "Saved in mailbox" },
      { label: "To", value: draft.toAddress || "Unknown" },
      { label: "Subject", value: draft.subject || "(no subject)" },
      { label: "Status", value: "Not sent" },
    ],
    records: [{ kind: "mailbox_draft", id: draft.id }],
    primaryAction: { label: "Review draft", href: "/email" },
    secondaryActions: [],
  };
}

function reminderWriteOutcome(
  reminder: AgentReminder,
  action: "created" | "updated",
): CoreToolOutcome {
  const capabilityId = action === "created"
    ? "core.reminders.create" as const
    : "core.reminders.update" as const;
  return {
    capabilityId,
    result: { ok: true, reminder },
    fallbackReply: `${action === "created" ? "Set" : "Updated"} the reminder for ${formatAgentDateTime(reminder.remindAt, reminder.timezone)}: ${reminder.title}.`,
    reminderAction: {
      kind: action,
      reminderId: reminder.id,
      title: reminder.title,
      remindAt: reminder.remindAt,
    },
    actionCards: [buildReminderActionCard(reminder, action)],
  };
}

export function buildReminderActionCard(
  reminder: AgentReminder,
  action: "created" | "updated" | "cancelled",
): AgentChatActionCard {
  const title = action === "created"
    ? "Reminder created"
    : action === "updated"
      ? "Reminder updated"
      : "Reminder cancelled";
  return {
    id: action === "created"
      ? `reminder:${reminder.id}`
      : `reminder:${reminder.id}:${action}`,
    kind: `reminder.${action}`,
    capabilityId: `core.reminders.${action === "created" ? "create" : action === "updated" ? "update" : "cancel"}`,
    title,
    summary: reminder.title,
    status: "complete",
    statusLabel: "Complete",
    changed: [
      { label: "Reminder", value: reminder.title },
      { label: "When", value: formatAgentDateTime(reminder.remindAt, reminder.timezone) },
      {
        label: "Status",
        value: action === "cancelled" ? "Cancelled" : "Pending reminder",
      },
    ],
    records: [{ kind: "reminder", id: reminder.id }],
    primaryAction: { label: "Open calendar", href: "/calendar" },
    secondaryActions: [],
  };
}

function withCoreToolInstructions(
  messages: readonly AgentToolMessage[],
  timezoneInput: string | null | undefined,
): AgentToolMessage[] {
  const timezone = normalizeTimeZone(timezoneInput) || "UTC";
  const now = new Date();
  const instructions = [
    "Reminder tool rules:",
    `- Current instant: ${now.toISOString()}. Owner timezone: ${timezone}. Local owner time: ${formatAgentDateTime(now.toISOString(), timezone)}.`,
    "- Use reminder tools only when the owner clearly asks to list, create, update, or cancel reminders.",
    "- For create/update, remindAt must be a future ISO date-time with the correct timezone offset. Noon means 12:00; midnight means 00:00. Resolve weekdays in the owner's timezone.",
    "- If the requested date or time is missing or ambiguous, ask one concise clarification question and do not call a write tool.",
    "- Before update/cancel, list reminders unless a stable reminder ID is already present in the conversation. Never invent or infer an ID from a title.",
    "- If multiple listed reminders could match, ask the owner which one they mean and do not write.",
    "Mission Control task tool rules:",
    "- Use task tools only when the owner clearly asks to list, read, create, update, move, complete, or archive Mission Control tasks.",
    "- When the owner remembers a task or Journal entry by title or content, use core_owner_content_search. Search returns lightweight candidates with stable source IDs; read the selected source before using its full body.",
    "- Search before task read/update/archive when the owner names or describes a record but no stable task ID is present. Use task list for browsing a project or status, not title discovery.",
    "- Task list accepts an exact projectName directly. Use projectId=null and projectName=null to list across all projects; never claim a project ID is required for a read.",
    "- Never invent a taskId or projectId. If multiple records could match, ask one concise clarification question and do not write.",
    "- For create, use the project ID selected by the owner. Omit projectId only when the owner did not name a project and the host can choose an unambiguous default.",
    "- When asked to prioritise, list the matching tasks first and recommend a small Now set. Only update status or priority after the owner clearly confirms.",
    "- Priority is 1 (highest) through 5 (lowest). Use in_progress for the owner's small Now commitment list.",
    "- Convert relative due dates such as today or tomorrow to YYYY-MM-DD in the owner's timezone using the current-time context above.",
    "- For update, send only fields the owner asked to change. Null optional fields mean no change.",
    "- Set clearDescription or clearDueAt only when the owner explicitly asks to remove that value.",
    "Mailbox tool rules:",
    "- Search before reading or replying unless a stable mailbox message ID is already present. Never invent a message ID.",
    "- Search returns summaries only. Read exactly the intended stable message ID before using the full private body.",
    "- If several messages or recipients could match, ask one concise clarification question and do not create a draft.",
    "- Draft requires a complete recipient, subject, and plain-text body. Use replyToMessageId only after reading that exact message.",
    "- Draft creation saves a reviewable mailbox draft only. Never claim the email was sent; sending is not an available tool.",
    "Social publishing tool rules:",
    "- Use social tools when the owner asks to turn a Journal entry or Mission Control task into social posts.",
    "- Search owner content when the owner gives a remembered task or Journal title. For Journal, an entry ID, YYYY-MM-DD date, or today can also be used directly. Never invent a source ID.",
    "- Read the exact source with core_social_source_read before calling core_social_draft_create. Build every draft from that returned source, not from assumptions or a summary invented by the model.",
    "- If source reading is the last action in a turn, preserve the returned sourceType and stable source ID in the reply. Draft creation revalidates that source ID so a confirmed selection remains safe across turns.",
    "- Write platform-native variants: a strong practical opening for LinkedIn, concise copy for X, and a hook plus readable caption rhythm for Instagram. Do not copy identical text across platforms.",
    "- Create only the platforms the owner requested. Draft creation saves reviewable internal drafts only; it never approves, schedules, or publishes them.",
    "- A tool result is the source of truth. Do not claim an action succeeded unless its result says ok=true.",
    "- For current ME3 data, call the relevant tool in this turn instead of answering from earlier conversation or context alone.",
    "- When the owner confirms several independent actions and their stable IDs are known, return all tool calls together. ME3 executes them sequentially with policy and idempotency checks.",
  ].join("\n");
  return messages.map((message, index) =>
    index === 0 && message.role === "system"
      ? { ...message, content: `${message.content}\n${instructions}` }
      : message,
  );
}

function enforceOwnerContentSearchToolPolicy(tool: CoreChatToolDefinition): void {
  if (
    tool.capabilityId !== "core.owner_content.search" ||
    tool.handlerRoute !== tool.capabilityId ||
    tool.approvalMode !== "none" ||
    tool.requiredSetupChecks.length !== 0
  ) {
    throw new Error(`Tool "${tool.name}" is not allowed by the owner content search runtime policy.`);
  }
}

function enforceReminderToolPolicy(tool: CoreChatToolDefinition): void {
  if (
    !tool.capabilityId.startsWith("core.reminders.") ||
    tool.handlerRoute !== tool.capabilityId ||
    tool.approvalMode !== "none" ||
    tool.requiredSetupChecks.some((check) => check !== "calendar.reminders")
  ) {
    throw new Error(`Tool "${tool.name}" is not allowed by the reminder runtime policy.`);
  }
}

function enforceMissionTaskToolPolicy(tool: CoreChatToolDefinition): void {
  if (
    !tool.capabilityId.startsWith("core.mission.task.") ||
    tool.handlerRoute !== tool.capabilityId ||
    tool.approvalMode !== "none" ||
    tool.requiredSetupChecks.some((check) => check !== "mission-control")
  ) {
    throw new Error(`Tool "${tool.name}" is not allowed by the Mission task runtime policy.`);
  }
}

function enforceMailboxToolPolicy(tool: CoreChatToolDefinition): void {
  if (
    !tool.capabilityId.startsWith("core.mailbox.") ||
    tool.handlerRoute !== tool.capabilityId ||
    tool.approvalMode !== "none" ||
    tool.requiredSetupChecks.some((check) => check !== "mailbox")
  ) {
    throw new Error(`Tool "${tool.name}" is not allowed by the mailbox runtime policy.`);
  }
}

function enforceSocialToolPolicy(tool: CoreChatToolDefinition): void {
  if (
    !tool.capabilityId.startsWith("core.social.") ||
    tool.handlerRoute !== tool.capabilityId ||
    tool.approvalMode !== "none" ||
    tool.requiredSetupChecks.some((check) => check !== "social-publishing")
  ) {
    throw new Error(`Tool "${tool.name}" is not allowed by the social draft runtime policy.`);
  }
}

function socialSourceType(value: unknown): AgentSocialSourceType {
  if (value === "journal" || value === "mission_task") return value;
  throw new Error('Social sourceType must be "journal" or "mission_task".');
}

function cacheSocialSourceOutcome(
  outcome: CoreToolOutcome,
  sources: Map<string, AgentSocialSource>,
): void {
  if (outcome.capabilityId !== "core.social.source.read") return;
  const source = outcome.result.source;
  if (!isAgentSocialSource(source)) return;
  cacheSocialSource(source, sources);
}

function cacheSocialSource(
  source: AgentSocialSource,
  sources: Map<string, AgentSocialSource>,
): void {
  sources.set(agentSocialSourceKey(source.sourceType, source.requestedRef), source);
  sources.set(agentSocialSourceKey(source.sourceType, source.id), source);
}

function isAgentSocialSource(value: unknown): value is AgentSocialSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<AgentSocialSource>;
  return (
    (source.sourceType === "journal" || source.sourceType === "mission_task") &&
    typeof source.requestedRef === "string" &&
    typeof source.id === "string" &&
    typeof source.title === "string" &&
    typeof source.content === "string" &&
    typeof source.snapshot === "string"
  );
}

function assertOnlyDeclaredArguments(
  args: Record<string, unknown>,
  tool: CoreChatToolDefinition,
): void {
  const allowed = new Set(Object.keys(tool.parameters.properties));
  const unexpected = Object.keys(args).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`Unexpected tool argument "${unexpected}".`);
}

function reminderInputFromArguments(
  args: Record<string, unknown>,
  ownerTimezone: string | null | undefined,
): AgentReminderInput {
  const timezoneValue = optionalString(args.timezone);
  const timezone = timezoneValue || normalizeTimeZone(ownerTimezone) || "UTC";
  if (timezoneValue && !normalizeTimeZone(timezoneValue)) {
    throw new Error(`Invalid reminder timezone "${timezoneValue}".`);
  }
  return {
    title: requiredString(args.title, "title"),
    notes: optionalString(args.notes),
    remindAt: requiredString(args.remindAt, "remindAt"),
    timezone,
    recurrence: optionalString(args.recurrence),
  };
}

function assertFutureReminder(input: AgentReminderInput): void {
  const parsed = parseAgentReminderInput(input);
  if ("error" in parsed) throw new Error(parsed.error);
  if (Date.parse(parsed.remindAt) <= Date.now()) {
    throw new Error("Reminder time must be in the future. Ask the owner for a new time.");
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`Reminder ${field} is required.`);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredToolString(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${label} is required.`);
}

function optionalToolString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveMissionTaskProjectId(
  projects: readonly AgentMissionProject[],
  projectId: string | undefined,
  projectName: string | undefined,
): string | undefined {
  const byId = projectId
    ? projects.find((project) => project.id === projectId)
    : undefined;
  if (projectId && !byId) {
    throw new Error("Mission Control project not found. List tasks or use an exact project name.");
  }
  if (!projectName) return byId?.id;

  const normalizedName = projectName.toLowerCase();
  const normalizedSlug = slugifyMissionProjectName(projectName);
  const matches = projects.filter(
    (project) =>
      project.name.toLowerCase() === normalizedName ||
      project.slug.toLowerCase() === normalizedName ||
      project.slug === normalizedSlug,
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `Multiple Mission Control projects match "${projectName}". Use a stable project ID.`
        : `Mission Control project "${projectName}" was not found.`,
    );
  }
  if (byId && byId.id !== matches[0].id) {
    throw new Error("Mission Control projectId and projectName refer to different projects.");
  }
  return matches[0].id;
}

function optionalToolBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalToolNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function successfulResponse(
  turnId: string,
  route: AgentChatAiRoute,
  model: string,
  replyText: string,
  outcome: CoreToolOutcome | null,
  modelAttempts: AgentChatModelAttemptTrace[],
): AgentSandboxDispatchResponse {
  return {
    ok: true,
    auditId: null,
    turnId,
    specialist: outcome?.capabilityId || "core.agent-chat",
    replyText: withSocialSourceReference(replyText, outcome),
    model,
    source: route.providerId,
    fallbackReason: null,
    debugError: null,
    emailAction: outcome?.emailAction || null,
    reminderAction: outcome?.reminderAction || null,
    actionCards: outcome?.actionCards.length ? outcome.actionCards : null,
    contentAction: outcome?.contentAction || null,
    contactsChanged: false,
    modelAttempts,
  };
}

function withSocialSourceReference(
  replyText: string,
  outcome: CoreToolOutcome | null,
): string {
  if (outcome?.capabilityId !== "core.social.source.read") return replyText;
  const source = outcome.result.source;
  if (!isAgentSocialSource(source)) return replyText;
  const reference = `${source.sourceType}:${source.id}`;
  return replyText.toLowerCase().includes(reference.toLowerCase())
    ? replyText
    : `${replyText}\n\nSource: ${reference}`;
}

function fallbackResponse(
  turnId: string,
  route: AgentChatAiRoute,
  outcome: CoreToolOutcome | null,
  modelAttempts: AgentChatModelAttemptTrace[],
  error: unknown,
): AgentSandboxDispatchResponse {
  const onlyEmptyReplies =
    modelAttempts.length > 0 &&
    modelAttempts.every((attempt) => attempt.status === "empty");
  const attemptedBackup = modelAttempts.some(
    (attempt) => attempt.model !== route.model,
  );
  return {
    ok: true,
    auditId: null,
    turnId,
    specialist: outcome?.capabilityId || "core.agent-chat",
    replyText: outcome
      ? `${outcome.fallbackReply} The model could not finish its reply, but the tool result above is confirmed.`
      : onlyEmptyReplies
        ? `I reached the configured AI model, but it returned an empty reply.${attemptedBackup ? " I also tried the backup model, but it did not return usable text." : ""} Try another model or check your AI provider settings.`
        : `I reached the ME3 agent runtime, but the model provider failed before it could answer.${attemptedBackup ? " I also tried the backup model and it failed too." : ""} Check your AI provider settings or try another model.`,
    model: modelAttempts.at(-1)?.model || route.model,
    source: "fallback",
    fallbackReason: outcome
      ? "Model reply failed after tool execution"
      : onlyEmptyReplies
        ? "Model returned empty response"
        : "Model request failed",
    debugError: onlyEmptyReplies
      ? "Model returned an empty reply."
      : modelErrorMessage(error) || "Agent model request failed.",
    emailAction: outcome?.emailAction || null,
    reminderAction: outcome?.reminderAction || null,
    actionCards: outcome?.actionCards.length ? outcome.actionCards : null,
    contentAction: outcome?.contentAction || null,
    contactsChanged: false,
    modelAttempts,
  };
}

function formatReminderList(
  reminders: AgentReminder[],
  timezone: string | null | undefined,
): string {
  if (reminders.length === 0) return "You do not have any pending reminders right now.";
  return [
    `You have ${reminders.length} pending reminder${reminders.length === 1 ? "" : "s"}:`,
    ...reminders.map(
      (reminder) =>
        `- ${reminder.title} at ${formatAgentDateTime(reminder.remindAt, timezone || reminder.timezone)} (ID: ${reminder.id})`,
    ),
  ].join("\n");
}

function formatMissionTask(task: AgentMissionTask): string {
  return [
    `Task: ${task.title}`,
    `Project: ${task.projectName}`,
    `Status: ${task.status}`,
    task.dueAt ? `Due: ${task.dueAt}` : null,
    `Priority: ${task.priority}`,
    task.description ? `Description: ${task.description}` : null,
    `ID: ${task.id}`,
  ].filter(Boolean).join("\n");
}

function formatMissionTaskList(tasks: AgentMissionTask[]): string {
  if (tasks.length === 0) return "I could not find any matching Mission Control tasks.";
  return [
    `Found ${tasks.length} Mission Control task${tasks.length === 1 ? "" : "s"}:`,
    ...tasks.map(
      (task) => `- ${task.title} — ${task.projectName} — ${task.status} — priority ${task.priority} (ID: ${task.id})`,
    ),
  ].join("\n");
}

function formatOwnerContentSearch(
  results: AgentOwnerContentSearchResult[],
  ambiguous: boolean,
): string {
  if (results.length === 0) {
    return "I could not find a matching Mission Control task or Journal entry.";
  }
  return [
    ambiguous
      ? "I found several similarly strong matches. Choose one by its stable source ID:"
      : `Found ${results.length} matching owner-content source${results.length === 1 ? "" : "s"}:`,
    ...results.map((result) => {
      const context = result.sourceType === "mission_task"
        ? [result.projectName, result.status].filter(Boolean).join(" — ")
        : result.sourceDate;
      return `- ${result.title}${context ? ` — ${context}` : ""} (Source: ${result.sourceType}:${result.sourceId})`;
    }),
  ].join("\n");
}

function mailboxMessageSummary(message: AgentMailboxMessage) {
  return {
    id: message.id,
    direction: message.direction,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    toAddress: message.toAddress,
    subject: message.subject,
    preview: message.preview,
    folder: message.folder,
    unread: message.unread,
    receivedAt: message.receivedAt,
    sentAt: message.sentAt,
    createdAt: message.createdAt,
  };
}

function mailboxMessageDetail(message: AgentMailboxMessage) {
  return {
    ...mailboxMessageSummary(message),
    threadKey: message.threadKey,
    body: message.body,
    status: message.status,
  };
}

function formatMailboxSearch(
  messages: Array<ReturnType<typeof mailboxMessageSummary>>,
): string {
  if (messages.length === 0) return "I could not find any matching mailbox messages.";
  return [
    `Found ${messages.length} matching mailbox message${messages.length === 1 ? "" : "s"}:`,
    ...messages.map(
      (message) =>
        `- ${message.subject} — ${message.fromName || message.fromAddress || message.toAddress || "Unknown"} (ID: ${message.id})`,
    ),
  ].join("\n");
}

function formatMailboxMessage(
  message: ReturnType<typeof mailboxMessageDetail>,
): string {
  return [
    `Subject: ${message.subject}`,
    `From: ${message.fromName || message.fromAddress || "Unknown"}`,
    `To: ${message.toAddress || "Unknown"}`,
    `ID: ${message.id}`,
    "",
    message.body,
  ].join("\n");
}

function formatAgentDateTime(
  iso: string,
  timezone: string | null | undefined,
): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: normalizeTimeZone(timezone) || "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
