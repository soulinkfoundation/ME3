import {
  ASSISTANT_JOB_CAPABILITIES,
  ASSISTANT_JOB_STARTER_RECIPES,
  attachAssistantJobContextToRunResult,
  createAssistantJobContext,
  createAssistantJobDraftFromRecipe,
  getAssistantJobCapability,
  getAssistantJobStarterRecipe,
  validateAssistantJobDraft,
  type AssistantJobAction,
  type AssistantJobApprovalMode,
  type AssistantCapability,
  type AssistantJobDraft,
  type AssistantJobDraftValidation,
  type AssistantJobStarterRecipe,
  type AssistantJobContextResult,
} from "@me3-core/assistant-jobs";
import type {
  Me3AgentContextCalendarEvent,
  Me3AgentContextPrivateMemory,
  Me3AgentContextProject,
  Me3AgentContextRecentMessage,
  Me3AgentContextSource,
  Me3AgentContextTask,
} from "@me3/knowledge";
import type { AssistantJobEventQueueMessage, Env } from "./types";

export class AssistantJobsInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

type AssistantJobStatus = "draft" | "active" | "paused" | "needs_setup" | "failing" | "archived";
type AssistantJobRunStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";
type AssistantJobIngressSourceKind = "core" | "mission_control" | "plugin" | "webhook";
type AssistantJobIngressStatus =
  | "received"
  | "matched"
  | "queued"
  | "processed"
  | "ignored"
  | "failed";

type AssistantJobRow = {
  id: string;
  user_id: string;
  recipe_id: string | null;
  name: string;
  purpose: string;
  status: AssistantJobStatus;
  current_version_id: string | null;
  project_id: string | null;
  destination_json: string;
  trigger_summary: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: AssistantJobRunStatus | null;
  failure_count: number;
  setup_state_json: string;
  created_by: "owner" | "assistant";
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AssistantJobVersionRow = {
  id: string;
  job_id: string;
  user_id: string;
  version_number: number;
  name: string;
  purpose: string;
  trigger_json: string;
  scope_json: string;
  rules_json: string;
  actions_json: string;
  approval_policy_json: string;
  destination_json: string;
  capability_ids_json: string;
  permission_summary_json: string;
  recommended_skill_ids_json: string;
  required_skill_ids_json: string;
  validation_status: AssistantJobDraftValidation["status"];
  validation_errors_json: string;
  created_at: string;
};

type AssistantJobRunRow = {
  id: string;
  user_id: string;
  job_id: string;
  job_version_id: string;
  trigger_kind: "manual" | "schedule" | "event" | "heartbeat_retry";
  trigger_ref: string | null;
  status: AssistantJobRunStatus;
  started_at: string | null;
  finished_at: string | null;
  output_preview: string | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
};

type AssistantJobActionResultStatus =
  | "skipped"
  | "blocked"
  | "pending_approval"
  | "succeeded"
  | "failed";

type AssistantJobActionResultRow = {
  id: string;
  run_id: string;
  action_id: string;
  capability_id: string;
  idempotency_key: string;
  status: AssistantJobActionResultStatus;
  approval_id: string | null;
  artifact_id: string | null;
  external_ref: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type SerializedActionResult = ReturnType<typeof serializeActionResult>;

type OwnerProfileContextRow = {
  id: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  timezone: string | null;
};

type MissionProjectContextRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  status: string;
  source_ref: string | null;
  updated_at: string;
};

type MissionTaskContextRow = {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  scheduled_for: string | null;
  source_ref: string | null;
  updated_at: string;
};

type MissionMemoryContextRow = {
  id: string;
  memory_kind: string;
  scope_kind: string;
  scope_id: string | null;
  title: string | null;
  body: string;
  confidence: number | null;
  source_ref: string | null;
  updated_at: string;
};

type CalendarEventContextRow = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  created_at: string;
  updated_at: string | null;
};

type AssistantMessageContextRow = {
  id?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string | null;
};

type AssistantJobIngressEventRow = {
  id: string;
  user_id: string;
  source_kind: AssistantJobIngressSourceKind;
  source_id: string;
  source_event_id: string;
  event_type: string;
  idempotency_key: string;
  payload_json: string;
  raw_payload_ref: string | null;
  status: AssistantJobIngressStatus;
  created_at: string;
  updated_at: string;
};

type AssistantJobMatchCandidateRow = AssistantJobRow & {
  version_id: string;
  version_number: number;
  version_name: string;
  version_purpose: string;
  candidate_trigger_json: string;
  candidate_scope_json: string;
  candidate_rules_json: string;
  candidate_actions_json: string;
  candidate_approval_policy_json: string;
  candidate_destination_json: string;
  candidate_capability_ids_json: string;
  candidate_permission_summary_json: string;
  candidate_recommended_skill_ids_json: string;
  candidate_required_skill_ids_json: string;
  candidate_validation_status: AssistantJobDraftValidation["status"];
  candidate_validation_errors_json: string;
  version_created_at: string;
};

type CreateAssistantJobBody = {
  recipeId?: unknown;
  draft?: unknown;
  name?: unknown;
  purpose?: unknown;
  status?: unknown;
  projectId?: unknown;
};

type UpdateAssistantJobBody = {
  name?: unknown;
  purpose?: unknown;
  status?: unknown;
  projectId?: unknown;
};

type CreateAssistantJobIngressEventBody = {
  sourceKind?: unknown;
  sourceId?: unknown;
  sourceEventId?: unknown;
  eventType?: unknown;
  idempotencyKey?: unknown;
  payload?: unknown;
  rawPayloadRef?: unknown;
};

type UpdateAssistantJobIngressEventBody = {
  status?: unknown;
  errorMessage?: unknown;
};

export function listAssistantJobRecipes() {
  return {
    recipes: ASSISTANT_JOB_STARTER_RECIPES.map(serializeRecipe),
    capabilities: ASSISTANT_JOB_CAPABILITIES,
  };
}

export async function listAssistantJobs(env: Env, userId: string, status?: string | null) {
  const normalizedStatus = normalizeJobStatus(status);
  const query = normalizedStatus
    ? `SELECT * FROM assistant_jobs WHERE user_id = ? AND status = ? ORDER BY updated_at DESC, created_at DESC`
    : `SELECT * FROM assistant_jobs WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC, created_at DESC`;
  const stmt = normalizedStatus ? env.DB.prepare(query).bind(userId, normalizedStatus) : env.DB.prepare(query).bind(userId);
  const rows = await stmt.all<AssistantJobRow>();
  return { jobs: rows.results.map(serializeJob) };
}

export async function listAssistantJobIngressEvents(
  env: Env,
  userId: string,
  status?: string | null,
) {
  const normalizedStatus = normalizeIngressStatus(status);
  const query = normalizedStatus
    ? `SELECT * FROM assistant_job_ingress_events
       WHERE user_id = ? AND status = ?
       ORDER BY created_at DESC
       LIMIT 100`
    : `SELECT * FROM assistant_job_ingress_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`;
  const stmt = normalizedStatus
    ? env.DB.prepare(query).bind(userId, normalizedStatus)
    : env.DB.prepare(query).bind(userId);
  const rows = await stmt.all<AssistantJobIngressEventRow>();
  return { events: rows.results.map(serializeIngressEvent) };
}

export async function recordAssistantJobIngressEvent(
  env: Env,
  userId: string,
  body: CreateAssistantJobIngressEventBody,
) {
  const event = normalizeIngressEventBody(body);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO assistant_job_ingress_events
     (id, user_id, source_kind, source_id, source_event_id, event_type,
      idempotency_key, payload_json, raw_payload_ref, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)`,
  )
    .bind(
      id,
      userId,
      event.sourceKind,
      event.sourceId,
      event.sourceEventId,
      event.eventType,
      event.idempotencyKey,
      stringifyJson(event.payload),
      event.rawPayloadRef,
      now,
      now,
    )
    .run();

  const row = await getAssistantJobIngressEventByIdempotencyKey(
    env,
    userId,
    event.idempotencyKey,
  );
  if (!row) throw new AssistantJobsInputError("Ingress event was not recorded", 409);
  const duplicate = row.id !== id;
  let queued = false;
  if (!duplicate) {
    queued = await enqueueAssistantJobIngressEvent(env, row);
  }

  return {
    event: serializeIngressEvent(row),
    duplicate,
    queued,
  };
}

export async function processAssistantJobIngressQueueMessage(
  env: Env,
  message: AssistantJobEventQueueMessage,
) {
  const eventId = normalizeOptionalText(message.eventId);
  const userId = normalizeOptionalText(message.userId);
  if (!eventId || !userId) {
    throw new AssistantJobsInputError("Assistant Job queue message is missing eventId or userId");
  }

  const event = await requireAssistantJobIngressEvent(env, userId, eventId);
  if (event.status === "matched" || event.status === "ignored" || event.status === "processed") {
    return { event: serializeIngressEvent(event), outcome: "already_processed", runCount: 0 };
  }

  const existingRuns = await listAssistantJobRunsForTrigger(env, userId, event.id);
  if (existingRuns.length > 0) {
    const matched = await setAssistantJobIngressEventStatus(env, userId, eventId, "matched", {
      matchedAt: new Date().toISOString(),
      matchedRunCount: existingRuns.length,
      matchedJobIds: existingRuns.map((run) => run.job_id),
    });
    const executions = [];
    for (const run of existingRuns) {
      if (run.status === "queued") {
        executions.push(await executeAssistantJobRun(env, userId, run.id));
      }
    }
    return {
      event: serializeIngressEvent(matched),
      outcome: "already_matched",
      runCount: existingRuns.length,
      executions,
    };
  }

  const candidates = await listEventTriggerCandidates(env, userId);
  const matchedCandidates = candidates.filter((candidate) =>
    assistantJobCandidateMatchesEvent(candidate, event),
  );

  if (matchedCandidates.length === 0) {
    const ignored = await setAssistantJobIngressEventStatus(env, userId, eventId, "ignored", {
      ignoredAt: new Date().toISOString(),
      queueOutcome: "no_matching_jobs",
    });
    return { event: serializeIngressEvent(ignored), outcome: "ignored", runCount: 0 };
  }

  const runs = [];
  for (const candidate of matchedCandidates) {
    runs.push(await createAssistantJobRunForEvent(env, candidate, event));
  }

  const matched = await setAssistantJobIngressEventStatus(env, userId, eventId, "matched", {
    matchedAt: new Date().toISOString(),
    matchedRunCount: runs.length,
    matchedJobIds: runs.map((run) => run.jobId),
  });
  const executions = [];
  for (const run of runs) {
    if (run.status === "queued") {
      executions.push(await executeAssistantJobRun(env, userId, run.id));
    }
  }
  return {
    event: serializeIngressEvent(matched),
    outcome: "matched",
    runCount: runs.length,
    runs,
    executions,
  };
}

export async function markAssistantJobIngressQueueMessageFailed(
  env: Env,
  message: AssistantJobEventQueueMessage,
  error: unknown,
) {
  const eventId = normalizeOptionalText(message.eventId);
  const userId = normalizeOptionalText(message.userId);
  if (!eventId || !userId) return { event: null, outcome: "invalid_message" };

  const failed = await setAssistantJobIngressEventStatus(env, userId, eventId, "failed", {
    queueFailedAt: new Date().toISOString(),
    errorMessage: getErrorMessage(error),
  });
  await appendAssistantJobMissionActivity(env, userId, {
    activityType: "assistant_job_event_dlq",
    title: "Assistant Job event needs review",
    summary: getErrorMessage(error),
    status: "failed",
    relatedId: eventId,
    metadata: {
      eventId,
      queueOutcome: "dead_lettered",
    },
  });
  return { event: serializeIngressEvent(failed), outcome: "failed" };
}

export async function updateAssistantJobIngressEvent(
  env: Env,
  userId: string,
  eventId: string,
  body: UpdateAssistantJobIngressEventBody,
) {
  const existing = await requireAssistantJobIngressEvent(env, userId, eventId);
  const status = normalizeIngressStatus(body.status);
  if (!status) throw new AssistantJobsInputError("Valid ingress event status is required");
  const errorMessage = normalizeOptionalText(body.errorMessage);
  await setAssistantJobIngressEventStatus(
    env,
    userId,
    eventId,
    status,
    errorMessage ? { errorMessage } : undefined,
    existing,
  );

  return {
    event: serializeIngressEvent(await requireAssistantJobIngressEvent(env, userId, eventId)),
  };
}

export async function getAssistantJob(env: Env, userId: string, jobId: string) {
  const job = await requireAssistantJob(env, userId, jobId);
  const version = job.current_version_id
    ? await getAssistantJobVersion(env, userId, job.current_version_id)
    : null;
  const runs = await env.DB.prepare(
    `SELECT * FROM assistant_job_runs
     WHERE user_id = ? AND job_id = ?
     ORDER BY created_at DESC
     LIMIT 10`,
  )
    .bind(userId, jobId)
    .all<AssistantJobRunRow>();
  const serializedRuns = await Promise.all(
    runs.results.map(async (run) => ({
      ...serializeRun(run),
      actionResults: await listAssistantJobActionResults(env, run.id),
    })),
  );
  return {
    job: serializeJob(job),
    version,
    runs: serializedRuns,
  };
}

export async function executeAssistantJobRun(env: Env, userId: string, runId: string) {
  const run = await requireAssistantJobRun(env, userId, runId);
  if (run.status === "succeeded" || run.status === "waiting_for_approval") {
    return {
      run: serializeRun(run),
      execution: "already_finished",
      actionResults: await listAssistantJobActionResults(env, run.id),
    };
  }
  if (run.status === "blocked" || run.status === "failed" || run.status === "cancelled") {
    return {
      run: serializeRun(run),
      execution: "not_runnable",
      actionResults: await listAssistantJobActionResults(env, run.id),
    };
  }

  const job = await requireAssistantJob(env, userId, run.job_id);
  const version = await requireAssistantJobVersion(env, userId, run.job_version_id);
  const draft = draftFromVersion(job, version);
  const validation = validateAssistantJobDraft(draft);
  const now = new Date().toISOString();
  const context = await loadAssistantJobRunContext(env, userId, { job, run, draft });

  if (validation.status !== "valid") {
    await setAssistantJobRunStatus(env, userId, run.id, {
      status: "blocked",
      errorCode: "validation_blocked",
      errorMessage: validation.errors[0]?.message || "Job is not ready to run",
      finishedAt: now,
      eventType: "blocked",
      message: "Run blocked by validation",
      payload: { validation },
    });
    return {
      run: serializeRun(await requireAssistantJobRun(env, userId, run.id)),
      execution: "blocked",
      validation,
      actionResults: await listAssistantJobActionResults(env, run.id),
    };
  }

  await setAssistantJobRunStatus(env, userId, run.id, {
    status: "running",
    startedAt: run.started_at || now,
    eventType: "running",
    message: "Assistant Job runner started",
    payload: {
      triggerKind: run.trigger_kind,
      triggerRef: run.trigger_ref,
      actionCount: draft.actions.length,
    },
  });
  await upsertAssistantJobMissionAgentRun(env, userId, {
    job,
    run,
    draft,
    status: "running",
    startedAt: run.started_at || now,
    context,
  });

  const actionResults = [];
  for (const action of draft.actions) {
    actionResults.push(
      await executeAssistantJobAction(env, {
        userId,
        job,
        run,
        draft,
        action,
      }),
    );
  }

  const hasPendingApproval = actionResults.some((result) => result.status === "pending_approval");
  const hasFailure = actionResults.some(
    (result) => result.status === "failed" || result.status === "blocked",
  );
  const finalStatus: AssistantJobRunStatus = hasPendingApproval
    ? "waiting_for_approval"
    : hasFailure
      ? "failed"
      : "succeeded";
  const finishedAt = finalStatus === "waiting_for_approval" ? null : new Date().toISOString();
  await setAssistantJobRunStatus(env, userId, run.id, {
    status: finalStatus,
    finishedAt,
    outputPreview: summarizeAssistantJobRunOutput(actionResults),
    errorCode: hasFailure ? "action_failed" : null,
    errorMessage: hasFailure ? "One or more Assistant Job actions failed" : null,
    eventType: finalStatus,
    message:
      finalStatus === "waiting_for_approval"
        ? "Assistant Job run is waiting for owner approval"
        : finalStatus === "succeeded"
          ? "Assistant Job run completed"
          : "Assistant Job run failed",
    payload: { actionResults },
  });
  await upsertAssistantJobMissionAgentRun(env, userId, {
    job,
    run: await requireAssistantJobRun(env, userId, run.id),
    draft,
    status: finalStatus === "failed" ? "failed" : finalStatus === "succeeded" ? "succeeded" : "running",
    startedAt: run.started_at || now,
    finishedAt,
    context,
    actionResults,
    outputPreview: summarizeAssistantJobRunOutput(actionResults),
  });

  return {
    run: serializeRun(await requireAssistantJobRun(env, userId, run.id)),
    execution: finalStatus,
    validation,
    actionResults,
  };
}

export async function createAssistantJob(env: Env, userId: string, body: CreateAssistantJobBody) {
  const draft = normalizeAssistantJobDraft(body);
  const validation = validateAssistantJobDraft(draft);
  const requestedStatus = normalizeJobStatus(body.status);
  const status = resolveInitialStatus(validation, requestedStatus);
  const jobId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const triggerSummary = summarizeTrigger(draft.trigger);
  const setupState = { validationStatus: validation.status, errors: validation.errors };

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO assistant_jobs
       (id, user_id, recipe_id, name, purpose, status, current_version_id, project_id,
        destination_json, trigger_summary, next_run_at, setup_state_json, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner', ?, ?)`,
    ).bind(
      jobId,
      userId,
      draft.recipeId,
      draft.name,
      draft.purpose,
      status,
      versionId,
      draft.projectId,
      stringifyJson(draft.destination),
      triggerSummary,
      draft.trigger.kind === "schedule" ? draft.trigger.nextRunAt : null,
      stringifyJson(setupState),
      now,
      now,
    ),
    buildInsertVersionStatement(env, {
      versionId,
      jobId,
      userId,
      versionNumber: 1,
      draft,
      validation,
      createdAt: now,
    }),
  ]);

  return {
    job: serializeJob(
      (await getAssistantJobRow(env, userId, jobId)) ||
        fail("Created Assistant Job was not found", 404),
    ),
    version: await getAssistantJobVersion(env, userId, versionId),
    validation,
  };
}

export async function updateAssistantJob(
  env: Env,
  userId: string,
  jobId: string,
  body: UpdateAssistantJobBody,
) {
  const existing = await requireAssistantJob(env, userId, jobId);
  const name = normalizeOptionalText(body.name) ?? existing.name;
  const purpose = normalizeOptionalText(body.purpose) ?? existing.purpose;
  const projectId = normalizeNullableText(body.projectId) ?? existing.project_id;
  const status = normalizeJobStatus(body.status) ?? existing.status;

  if (status === "archived") {
    throw new AssistantJobsInputError("Use DELETE to archive a job");
  }

  await env.DB.prepare(
    `UPDATE assistant_jobs
     SET name = ?, purpose = ?, project_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(name, purpose, projectId, status, jobId, userId)
    .run();

  return { job: serializeJob(await requireAssistantJob(env, userId, jobId)) };
}

export async function setAssistantJobPaused(
  env: Env,
  userId: string,
  jobId: string,
  paused: boolean,
) {
  const existing = await requireAssistantJob(env, userId, jobId);
  if (existing.status === "archived") {
    throw new AssistantJobsInputError("Archived jobs cannot be changed", 409);
  }
  const status: AssistantJobStatus = paused ? "paused" : "active";
  await env.DB.prepare(
    `UPDATE assistant_jobs
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(status, jobId, userId)
    .run();
  return { job: serializeJob(await requireAssistantJob(env, userId, jobId)) };
}

export async function duplicateAssistantJob(env: Env, userId: string, jobId: string) {
  const existing = await requireAssistantJob(env, userId, jobId);
  const version = existing.current_version_id
    ? await requireAssistantJobVersion(env, userId, existing.current_version_id)
    : null;
  if (!version) throw new AssistantJobsInputError("Job version not found", 404);

  const draft: AssistantJobDraft = {
    name: `${version.name} copy`,
    purpose: version.purpose,
    recipeId: existing.recipe_id,
    trigger: parseJson(version.trigger_json, { kind: "manual" }) as AssistantJobDraft["trigger"],
    scope: parseJson(version.scope_json, {
      projectId: null,
      sourceIds: [],
      providerAccountIds: [],
      filters: [],
    }) as AssistantJobDraft["scope"],
    rules: parseJson(version.rules_json, []),
    actions: parseJson(version.actions_json, []),
    approvalPolicy: parseJson(version.approval_policy_json, {
      defaultMode: "review_required",
      overrides: [],
      ownerCanApproveFrom: "mission_control",
      approvalExpiresAfterHours: null,
    }) as AssistantJobDraft["approvalPolicy"],
    destination: parseJson(version.destination_json, {
      kind: "mission_control",
      projectId: null,
      landing: "review_packet",
      quietIfNoChanges: true,
    }) as AssistantJobDraft["destination"],
    projectId: existing.project_id,
    recommendedSkillIds: parseJson(version.recommended_skill_ids_json, []),
    requiredSkillIds: parseJson(version.required_skill_ids_json, []),
  };

  return createAssistantJob(env, userId, { draft, status: "draft" });
}

export async function archiveAssistantJob(env: Env, userId: string, jobId: string) {
  await requireAssistantJob(env, userId, jobId);
  await env.DB.prepare(
    `UPDATE assistant_jobs
     SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(jobId, userId)
    .run();
  return { ok: true };
}

export async function runAssistantJobNow(env: Env, userId: string, jobId: string) {
  const job = await requireAssistantJob(env, userId, jobId);
  if (job.status === "archived") throw new AssistantJobsInputError("Archived jobs cannot run", 409);
  if (job.status === "paused") throw new AssistantJobsInputError("Paused jobs cannot run", 409);
  if (!job.current_version_id) throw new AssistantJobsInputError("Job has no runnable version", 409);

  const version = await requireAssistantJobVersion(env, userId, job.current_version_id);
  const draft = draftFromVersion(job, version);
  const validation = validateAssistantJobDraft(draft);
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const blocked = validation.status !== "valid" || job.status === "needs_setup" || job.status === "draft";
  const status: AssistantJobRunStatus = blocked ? "blocked" : "queued";
  const errorMessage = blocked
    ? validation.errors[0]?.message || "Job is not ready to run"
    : null;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO assistant_job_runs
       (id, user_id, job_id, job_version_id, trigger_kind, trigger_ref, status,
        error_code, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      runId,
      userId,
      job.id,
      version.id,
      `manual:${crypto.randomUUID()}`,
      status,
      blocked ? "validation_blocked" : null,
      errorMessage,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO assistant_job_run_events (id, run_id, event_type, message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      runId,
      blocked ? "blocked" : "queued",
      blocked ? "Manual run blocked by validation" : "Manual run queued",
      stringifyJson({ validation }),
      now,
    ),
    env.DB.prepare(
      `UPDATE assistant_jobs
       SET last_run_at = ?, last_run_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    ).bind(now, status, job.id, userId),
  ]);

  if (status !== "queued") {
    return {
      run: serializeRun(await requireAssistantJobRun(env, userId, runId)),
      validation,
      execution: "not_started",
      actionResults: await listAssistantJobActionResults(env, runId),
    };
  }

  const execution = await executeAssistantJobRun(env, userId, runId);
  return {
    ...execution,
    validation,
  };
}

async function createAssistantJobRunForEvent(
  env: Env,
  candidate: AssistantJobMatchCandidateRow,
  event: AssistantJobIngressEventRow,
) {
  const version = candidateVersionFromRow(candidate);
  const draft = draftFromVersion(candidate, version);
  const validation = validateAssistantJobDraft(draft);
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const blocked = validation.status !== "valid";
  const status: AssistantJobRunStatus = blocked ? "blocked" : "queued";
  const errorMessage = blocked
    ? validation.errors[0]?.message || "Job is not ready to run"
    : null;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO assistant_job_runs
       (id, user_id, job_id, job_version_id, trigger_kind, trigger_ref, status,
        error_code, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'event', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      runId,
      event.user_id,
      candidate.id,
      version.id,
      event.id,
      status,
      blocked ? "validation_blocked" : null,
      errorMessage,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO assistant_job_run_events (id, run_id, event_type, message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      runId,
      blocked ? "blocked" : "queued",
      blocked ? "Event-triggered run blocked by validation" : "Event-triggered run queued",
      stringifyJson({ validation, ingressEventId: event.id }),
      now,
    ),
    env.DB.prepare(
      `UPDATE assistant_jobs
       SET last_run_at = ?, last_run_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    ).bind(now, status, candidate.id, event.user_id),
  ]);

  return serializeRun(await requireAssistantJobRun(env, event.user_id, runId));
}

async function executeAssistantJobAction(
  env: Env,
  input: {
    userId: string;
    job: AssistantJobRow;
    run: AssistantJobRunRow;
    draft: AssistantJobDraft;
    action: AssistantJobAction;
  },
) {
  const capability = getAssistantJobCapability(input.action.capabilityId);
  const idempotencyKey = buildActionIdempotencyKey(input.run, input.action);
  const existing = await getAssistantJobActionResult(
    env,
    input.run.id,
    input.action.id,
    idempotencyKey,
  );
  if (existing) return serializeActionResult(existing);

  if (!capability) {
    return insertAssistantJobActionResult(env, {
      runId: input.run.id,
      actionId: input.action.id,
      capabilityId: input.action.capabilityId,
      idempotencyKey,
      status: "failed",
      errorMessage: "Unknown Assistant Job capability",
    });
  }

  const approvalMode = resolveActionApprovalMode(input.draft, input.action, capability);
  if (approvalMode === "forbidden") {
    return insertAssistantJobActionResult(env, {
      runId: input.run.id,
      actionId: input.action.id,
      capabilityId: capability.id,
      idempotencyKey,
      status: "blocked",
      errorMessage: "Capability is forbidden by Assistant Job policy",
    });
  }

  if (approvalMode === "approval_required") {
    const approvalId = await createAssistantJobActionApproval(env, input.userId, {
      job: input.job,
      run: input.run,
      action: input.action,
      capability,
      idempotencyKey,
    });
    return insertAssistantJobActionResult(env, {
      runId: input.run.id,
      actionId: input.action.id,
      capabilityId: capability.id,
      idempotencyKey,
      status: "pending_approval",
      approvalId,
    });
  }

  const missionOutputResult = await executeAssistantJobMissionOutputAction(env, {
    ...input,
    capability,
    idempotencyKey,
  });
  if (missionOutputResult) return missionOutputResult;

  return insertAssistantJobActionResult(env, {
    runId: input.run.id,
    actionId: input.action.id,
    capabilityId: capability.id,
    idempotencyKey,
    status: "succeeded",
    externalRef: `${capability.auditEventKind}:${input.run.id}:${input.action.id}`,
  });
}

async function executeAssistantJobMissionOutputAction(
  env: Env,
  input: {
    userId: string;
    job: AssistantJobRow;
    run: AssistantJobRunRow;
    draft: AssistantJobDraft;
    action: AssistantJobAction;
    capability: AssistantCapability;
    idempotencyKey: string;
  },
) {
  if (input.capability.id === "mission.task.create") {
    return createAssistantJobMissionTask(env, input);
  }
  if (input.capability.id === "mission.capture.create") {
    return createAssistantJobMissionCapture(env, input);
  }
  if (input.capability.id === "mission.activity.create") {
    return createAssistantJobMissionActivity(env, input, "assistant_job.activity");
  }
  if (input.capability.id === "mission.review_packet.create") {
    return createAssistantJobMissionActivity(env, input, "assistant_job.review_packet");
  }
  return null;
}

async function createAssistantJobMissionTask(
  env: Env,
  input: {
    userId: string;
    job: AssistantJobRow;
    run: AssistantJobRunRow;
    draft: AssistantJobDraft;
    action: AssistantJobAction;
    capability: AssistantCapability;
    idempotencyKey: string;
  },
) {
  const taskId = missionOutputId(input.run, input.action, "task");
  const title = missionTextInput(input.action, "title")
    || input.action.label
    || `${input.job.name} follow-up`;
  const description = missionTextInput(input.action, "description") || input.job.purpose || null;
  const projectId = resolveMissionOutputProjectId(input.job, input.draft, input.action);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO mission_tasks
       (id, user_id, project_id, title, description, status, priority, due_at, scheduled_for,
        source_kind, source_ref, approval_id, metadata_json, created_at, updated_at, archived_at)
     VALUES (?, ?, ?, ?, ?, 'backlog', ?, ?, ?, 'agent', ?, NULL, ?, ?, ?, NULL)`,
  )
    .bind(
      taskId,
      input.userId,
      projectId,
      title,
      description,
      normalizeMissionPriority(input.action.inputs.priority),
      normalizeNullableText(input.action.inputs.dueAt),
      normalizeNullableText(input.action.inputs.scheduledFor),
      input.idempotencyKey,
      stringifyJson(missionOutputMetadata(input)),
      now,
      now,
    )
    .run();

  return insertAssistantJobActionResult(env, {
    runId: input.run.id,
    actionId: input.action.id,
    capabilityId: input.capability.id,
    idempotencyKey: input.idempotencyKey,
    status: "succeeded",
    externalRef: taskId,
  });
}

async function createAssistantJobMissionCapture(
  env: Env,
  input: {
    userId: string;
    job: AssistantJobRow;
    run: AssistantJobRunRow;
    draft: AssistantJobDraft;
    action: AssistantJobAction;
    capability: AssistantCapability;
    idempotencyKey: string;
  },
) {
  const date = normalizeMissionDate(input.action.inputs.date) || new Date().toISOString().slice(0, 10);
  const dayId = missionDailyNoteId(input.userId, date);
  const captureId = missionOutputId(input.run, input.action, "capture");
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO mission_daily_notes
       (id, user_id, date, title, journal_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', ?, ?)`,
  )
    .bind(dayId, input.userId, date, `Assistant Jobs - ${date}`, now, now)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO mission_capture_items
       (id, user_id, day_id, type, text, project_id, status, task_id, calendar_event_id,
        reminder_id, due_at, event_start_at, event_end_at, timezone, sync_status, sync_error,
        source, source_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, NULL, NULL, ?, ?, ?, ?, 'local', NULL,
       'agent', ?, ?, ?)`,
  )
    .bind(
      captureId,
      input.userId,
      dayId,
      normalizeMissionCaptureType(input.action.inputs.type),
      missionTextInput(input.action, "text")
        || missionTextInput(input.action, "title")
        || input.action.label
        || input.job.name,
      resolveMissionOutputProjectId(input.job, input.draft, input.action),
      normalizeNullableText(input.action.inputs.dueAt),
      normalizeNullableText(input.action.inputs.eventStartAt),
      normalizeNullableText(input.action.inputs.eventEndAt),
      normalizeNullableText(input.action.inputs.timezone),
      input.idempotencyKey,
      now,
      now,
    )
    .run();

  return insertAssistantJobActionResult(env, {
    runId: input.run.id,
    actionId: input.action.id,
    capabilityId: input.capability.id,
    idempotencyKey: input.idempotencyKey,
    status: "succeeded",
    externalRef: captureId,
  });
}

async function createAssistantJobMissionActivity(
  env: Env,
  input: {
    userId: string;
    job: AssistantJobRow;
    run: AssistantJobRunRow;
    draft: AssistantJobDraft;
    action: AssistantJobAction;
    capability: AssistantCapability;
    idempotencyKey: string;
  },
  defaultActivityType: string,
) {
  const activityId = missionOutputId(input.run, input.action, "activity");
  const title = missionTextInput(input.action, "title")
    || (defaultActivityType === "assistant_job.review_packet"
      ? `Review packet: ${input.job.name}`
      : input.action.label)
    || input.job.name;
  const summary = missionTextInput(input.action, "summary") || input.job.purpose || null;
  const status = missionTextInput(input.action, "status") || "succeeded";

  await env.DB.prepare(
    `INSERT OR IGNORE INTO mission_plugin_activity
       (id, user_id, plugin_id, activity_type, title, summary, status, related_id, metadata_json)
     VALUES (?, ?, 'me3.assistant-jobs', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      activityId,
      input.userId,
      missionTextInput(input.action, "activityType") || defaultActivityType,
      title,
      summary,
      status,
      input.run.id,
      stringifyJson(missionOutputMetadata(input)),
    )
    .run();

  return insertAssistantJobActionResult(env, {
    runId: input.run.id,
    actionId: input.action.id,
    capabilityId: input.capability.id,
    idempotencyKey: input.idempotencyKey,
    status: "succeeded",
    externalRef: activityId,
  });
}

async function createAssistantJobActionApproval(
  env: Env,
  userId: string,
  input: {
    job: AssistantJobRow;
    run: AssistantJobRunRow;
    action: AssistantJobAction;
    capability: AssistantCapability;
    idempotencyKey: string;
  },
) {
  const approvalId = crypto.randomUUID();
  const title = `Approve ${input.action.label}`;
  await env.DB.prepare(
    `INSERT INTO mission_approvals
       (id, user_id, plugin_id, action_id, title, summary, payload_json, risk_level, requested_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assistant_job', NULL)`,
  )
    .bind(
      approvalId,
      userId,
      input.capability.pluginId || "me3.core",
      input.action.id,
      title,
      `${input.job.name} wants to use ${input.capability.label}.`,
      stringifyJson({
        jobId: input.job.id,
        runId: input.run.id,
        actionId: input.action.id,
        capabilityId: input.capability.id,
        idempotencyKey: input.idempotencyKey,
        inputs: input.action.inputs,
      }),
      riskLevelForCapability(input.capability),
    )
    .run();
  return approvalId;
}

async function insertAssistantJobActionResult(
  env: Env,
  input: {
    runId: string;
    actionId: string;
    capabilityId: string;
    idempotencyKey: string;
    status: AssistantJobActionResultStatus;
    approvalId?: string | null;
    artifactId?: string | null;
    externalRef?: string | null;
    errorMessage?: string | null;
  },
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO assistant_job_action_results
       (id, run_id, action_id, capability_id, idempotency_key, status,
        approval_id, artifact_id, external_ref, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.runId,
      input.actionId,
      input.capabilityId,
      input.idempotencyKey,
      input.status,
      input.approvalId || null,
      input.artifactId || null,
      input.externalRef || null,
      input.errorMessage || null,
      now,
      now,
    )
    .run();

  const row = await getAssistantJobActionResult(
    env,
    input.runId,
    input.actionId,
    input.idempotencyKey,
  );
  if (!row) throw new AssistantJobsInputError("Assistant Job action result was not recorded", 409);
  return serializeActionResult(row);
}

async function setAssistantJobRunStatus(
  env: Env,
  userId: string,
  runId: string,
  input: {
    status: AssistantJobRunStatus;
    startedAt?: string | null;
    finishedAt?: string | null;
    outputPreview?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    eventType: string;
    message: string;
    payload?: Record<string, unknown>;
  },
) {
  const existing = await requireAssistantJobRun(env, userId, runId);
  const startedAt =
    input.startedAt !== undefined ? input.startedAt : existing.started_at;
  const finishedAt =
    input.finishedAt !== undefined ? input.finishedAt : existing.finished_at;
  const outputPreview =
    input.outputPreview !== undefined ? input.outputPreview : existing.output_preview;
  const errorCode =
    input.errorCode !== undefined ? input.errorCode : existing.error_code;
  const errorMessage =
    input.errorMessage !== undefined ? input.errorMessage : existing.error_message;
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE assistant_job_runs
       SET status = ?, started_at = ?, finished_at = ?, output_preview = ?,
           error_code = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    ).bind(
      input.status,
      startedAt,
      finishedAt,
      outputPreview,
      errorCode,
      errorMessage,
      runId,
      userId,
    ),
    env.DB.prepare(
      `INSERT INTO assistant_job_run_events (id, run_id, event_type, message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      runId,
      input.eventType,
      input.message,
      stringifyJson(input.payload || {}),
      now,
    ),
    env.DB.prepare(
      `UPDATE assistant_jobs
       SET last_run_at = ?, last_run_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    ).bind(now, input.status, existing.job_id, userId),
  ]);
}

async function loadAssistantJobRunContext(
  env: Env,
  userId: string,
  input: {
    job: AssistantJobRow;
    run: AssistantJobRunRow;
    draft: AssistantJobDraft;
  },
): Promise<AssistantJobContextResult | null> {
  const failedSources: Me3AgentContextSource[] = [];
  try {
    const owner = await loadAssistantJobOwnerContext(env, userId, failedSources);
    const [projects, tasks, calendarEvents, privateMemory, recentMessages] = await Promise.all([
      loadAssistantJobProjectsContext(env, userId, failedSources),
      loadAssistantJobTasksContext(env, userId, failedSources),
      loadAssistantJobCalendarContext(env, userId, failedSources),
      loadAssistantJobMemoryContext(env, userId, failedSources),
      loadAssistantJobRecentMessagesContext(env, userId, failedSources),
    ]);
    const projectId =
      input.draft.destination.projectId || input.draft.scope.projectId || input.job.project_id;

    return createAssistantJobContext({
      ownerId: userId,
      jobId: input.job.id,
      runId: input.run.id,
      jobName: input.job.name,
      jobPurpose: input.job.purpose,
      trigger: input.draft.trigger,
      scope: input.draft.scope,
      destination: input.draft.destination,
      ownerProfile: owner,
      candidateProjects: projectId
        ? projects.filter((project) => project.id === projectId)
        : projects,
      candidateTasks: projectId
        ? tasks.filter((task) => task.projectId === projectId)
        : tasks,
      candidateCalendarEvents: calendarEvents,
      candidatePrivateMemory: privateMemory,
      candidateRecentMessages: recentMessages,
      failedSources,
      budget: { maxPromptChars: 6000 },
    });
  } catch {
    return null;
  }
}

async function upsertAssistantJobMissionAgentRun(
  env: Env,
  userId: string,
  input: {
    job: AssistantJobRow;
    run: AssistantJobRunRow;
    draft: AssistantJobDraft;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    startedAt?: string | null;
    finishedAt?: string | null;
    context: AssistantJobContextResult | null;
    actionResults?: SerializedActionResult[];
    outputPreview?: string | null;
  },
) {
  const id = missionAgentRunIdForAssistantJobRun(input.run.id);
  const result = input.context
    ? attachAssistantJobContextToRunResult(
        {
          assistantJobRunId: input.run.id,
          assistantJobId: input.job.id,
          assistantJobStatus: input.run.status,
          outputPreview: input.outputPreview || input.run.output_preview || null,
          actionResults: input.actionResults || [],
        },
        input.context,
      )
    : {
        assistantJobRunId: input.run.id,
        assistantJobId: input.job.id,
        assistantJobStatus: input.run.status,
        outputPreview: input.outputPreview || input.run.output_preview || null,
        actionResults: input.actionResults || [],
        contextPacketId: null,
        contextManifest: null,
      };
  const promptSummary = input.context?.prompt.text.slice(0, 2000) || input.job.purpose;
  const projectId = input.draft.destination.projectId || input.draft.scope.projectId || input.job.project_id;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO mission_agent_runs
       (id, user_id, source, project_id, title, prompt_summary, status, model,
        runner_id, started_at, finished_at, result_json, artifact_manifest_json, created_at, updated_at)
     VALUES (?, ?, 'core', ?, ?, ?, ?, 'structured-assistant-job-runner-v1',
             'assistant-jobs', ?, ?, ?, '[]', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       prompt_summary = excluded.prompt_summary,
       started_at = COALESCE(mission_agent_runs.started_at, excluded.started_at),
       finished_at = excluded.finished_at,
       result_json = excluded.result_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      userId,
      projectId,
      `Assistant Job: ${input.job.name}`,
      promptSummary,
      input.status,
      input.startedAt || null,
      input.finishedAt || null,
      stringifyJson(result),
      now,
      now,
    )
    .run();
}

function normalizeAssistantJobDraft(body: CreateAssistantJobBody): AssistantJobDraft {
  const rawDraft = body.draft;
  const recipeId = normalizeOptionalText(body.recipeId);
  const recipe = recipeId ? getAssistantJobStarterRecipe(recipeId) : null;
  if (recipeId && !recipe) throw new AssistantJobsInputError(`Unknown recipe: ${recipeId}`, 404);

  const baseDraft = isRecord(rawDraft)
    ? normalizeDraftRecord(rawDraft, recipe)
    : recipe
      ? createAssistantJobDraftFromRecipe(recipe)
      : null;

  if (!baseDraft) {
    throw new AssistantJobsInputError("recipeId or draft is required");
  }

  const name = normalizeOptionalText(body.name);
  const purpose = normalizeOptionalText(body.purpose);
  const projectId = normalizeNullableText(body.projectId);

  return {
    ...baseDraft,
    name: name ?? baseDraft.name,
    purpose: purpose ?? baseDraft.purpose,
    projectId: projectId ?? baseDraft.projectId,
    destination: {
      ...baseDraft.destination,
      projectId: projectId ?? baseDraft.destination.projectId,
    },
    scope: {
      ...baseDraft.scope,
      projectId: projectId ?? baseDraft.scope.projectId,
    },
  };
}

function normalizeDraftRecord(
  rawDraft: Record<string, unknown>,
  recipe: AssistantJobStarterRecipe | null,
): AssistantJobDraft {
  const fallback = recipe ? createAssistantJobDraftFromRecipe(recipe) : null;
  const name = normalizeOptionalText(rawDraft.name) ?? fallback?.name;
  const purpose = normalizeOptionalText(rawDraft.purpose) ?? fallback?.purpose;
  if (!name) throw new AssistantJobsInputError("Job name is required");
  if (!purpose) throw new AssistantJobsInputError("Job purpose is required");
  const trigger = isRecord(rawDraft.trigger) ? rawDraft.trigger : fallback?.trigger;
  const scope = isRecord(rawDraft.scope) ? rawDraft.scope : fallback?.scope;
  const destination = isRecord(rawDraft.destination) ? rawDraft.destination : fallback?.destination;
  const approvalPolicy = isRecord(rawDraft.approvalPolicy)
    ? rawDraft.approvalPolicy
    : fallback?.approvalPolicy;
  if (!trigger || !scope || !destination || !approvalPolicy) {
    throw new AssistantJobsInputError("Draft trigger, scope, destination, and approval policy are required");
  }

  return {
    name,
    purpose,
    recipeId: normalizeNullableText(rawDraft.recipeId) ?? fallback?.recipeId ?? null,
    trigger: trigger as AssistantJobDraft["trigger"],
    scope: scope as AssistantJobDraft["scope"],
    rules: Array.isArray(rawDraft.rules) ? rawDraft.rules as AssistantJobDraft["rules"] : fallback?.rules ?? [],
    actions: Array.isArray(rawDraft.actions)
      ? rawDraft.actions as AssistantJobDraft["actions"]
      : fallback?.actions ?? [],
    approvalPolicy: approvalPolicy as AssistantJobDraft["approvalPolicy"],
    destination: destination as AssistantJobDraft["destination"],
    projectId: normalizeNullableText(rawDraft.projectId) ?? fallback?.projectId ?? null,
    recommendedSkillIds: normalizeStringArray(rawDraft.recommendedSkillIds) ?? fallback?.recommendedSkillIds ?? [],
    requiredSkillIds: normalizeStringArray(rawDraft.requiredSkillIds) ?? fallback?.requiredSkillIds ?? [],
  };
}

function buildInsertVersionStatement(
  env: Env,
  input: {
    versionId: string;
    jobId: string;
    userId: string;
    versionNumber: number;
    draft: AssistantJobDraft;
    validation: AssistantJobDraftValidation;
    createdAt: string;
  },
) {
  return env.DB.prepare(
    `INSERT INTO assistant_job_versions
     (id, job_id, user_id, version_number, name, purpose, trigger_json, scope_json,
      rules_json, actions_json, approval_policy_json, destination_json, capability_ids_json,
      permission_summary_json, recommended_skill_ids_json, required_skill_ids_json,
      validation_status, validation_errors_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.versionId,
    input.jobId,
    input.userId,
    input.versionNumber,
    input.draft.name,
    input.draft.purpose,
    stringifyJson(input.draft.trigger),
    stringifyJson(input.draft.scope),
    stringifyJson(input.draft.rules),
    stringifyJson(input.draft.actions),
    stringifyJson(input.draft.approvalPolicy),
    stringifyJson(input.draft.destination),
    stringifyJson(input.draft.actions.map((action) => action.capabilityId)),
    stringifyJson(input.validation.permissionSummary),
    stringifyJson(input.draft.recommendedSkillIds),
    stringifyJson(input.draft.requiredSkillIds),
    input.validation.status,
    stringifyJson(input.validation.errors),
    input.createdAt,
  );
}

async function getAssistantJobRow(env: Env, userId: string, jobId: string) {
  return env.DB.prepare("SELECT * FROM assistant_jobs WHERE id = ? AND user_id = ?")
    .bind(jobId, userId)
    .first<AssistantJobRow>();
}

async function requireAssistantJob(env: Env, userId: string, jobId: string) {
  const job = await getAssistantJobRow(env, userId, jobId);
  if (!job) throw new AssistantJobsInputError("Assistant Job not found", 404);
  return job;
}

async function getAssistantJobVersion(env: Env, userId: string, versionId: string) {
  const version = await env.DB.prepare("SELECT * FROM assistant_job_versions WHERE id = ? AND user_id = ?")
    .bind(versionId, userId)
    .first<AssistantJobVersionRow>();
  return version ? serializeVersion(version) : null;
}

async function requireAssistantJobVersion(env: Env, userId: string, versionId: string) {
  const version = await env.DB.prepare("SELECT * FROM assistant_job_versions WHERE id = ? AND user_id = ?")
    .bind(versionId, userId)
    .first<AssistantJobVersionRow>();
  if (!version) throw new AssistantJobsInputError("Assistant Job version not found", 404);
  return version;
}

async function requireAssistantJobRun(env: Env, userId: string, runId: string) {
  const run = await env.DB.prepare("SELECT * FROM assistant_job_runs WHERE id = ? AND user_id = ?")
    .bind(runId, userId)
    .first<AssistantJobRunRow>();
  if (!run) throw new AssistantJobsInputError("Assistant Job run not found", 404);
  return run;
}

async function getAssistantJobActionResult(
  env: Env,
  runId: string,
  actionId: string,
  idempotencyKey: string,
) {
  return env.DB.prepare(
    `SELECT * FROM assistant_job_action_results
     WHERE run_id = ? AND action_id = ? AND idempotency_key = ?`,
  )
    .bind(runId, actionId, idempotencyKey)
    .first<AssistantJobActionResultRow>();
}

async function listAssistantJobActionResults(env: Env, runId: string) {
  const rows = await env.DB.prepare(
    `SELECT * FROM assistant_job_action_results
     WHERE run_id = ?
     ORDER BY created_at ASC`,
  )
    .bind(runId)
    .all<AssistantJobActionResultRow>();
  return rows.results.map(serializeActionResult);
}

async function listAssistantJobRunsForTrigger(env: Env, userId: string, triggerRef: string) {
  const rows = await env.DB.prepare(
    `SELECT * FROM assistant_job_runs
     WHERE user_id = ? AND trigger_kind = 'event' AND trigger_ref = ?
     ORDER BY created_at DESC`,
  )
    .bind(userId, triggerRef)
    .all<AssistantJobRunRow>();
  return rows.results;
}

async function listEventTriggerCandidates(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT
       j.*,
       v.id AS version_id,
       v.version_number AS version_number,
       v.name AS version_name,
       v.purpose AS version_purpose,
       v.trigger_json AS candidate_trigger_json,
       v.scope_json AS candidate_scope_json,
       v.rules_json AS candidate_rules_json,
       v.actions_json AS candidate_actions_json,
       v.approval_policy_json AS candidate_approval_policy_json,
       v.destination_json AS candidate_destination_json,
       v.capability_ids_json AS candidate_capability_ids_json,
       v.permission_summary_json AS candidate_permission_summary_json,
       v.recommended_skill_ids_json AS candidate_recommended_skill_ids_json,
       v.required_skill_ids_json AS candidate_required_skill_ids_json,
       v.validation_status AS candidate_validation_status,
       v.validation_errors_json AS candidate_validation_errors_json,
       v.created_at AS version_created_at
     FROM assistant_jobs j
     JOIN assistant_job_versions v
       ON v.id = j.current_version_id AND v.user_id = j.user_id
     WHERE j.user_id = ?
       AND j.status = 'active'
       AND j.archived_at IS NULL
     ORDER BY j.updated_at DESC, j.created_at DESC`,
  )
    .bind(userId)
    .all<AssistantJobMatchCandidateRow>();
  return rows.results;
}

async function loadAssistantJobOwnerContext(
  env: Env,
  userId: string,
  failedSources: Me3AgentContextSource[],
) {
  try {
    const row = await env.DB.prepare(
      "SELECT id, name, username, bio, timezone FROM owner_profile WHERE id = ?",
    )
      .bind(userId)
      .first<OwnerProfileContextRow>();
    if (!row) return null;
    return {
      displayName: row.name,
      username: row.username,
      bio: row.bio,
      timezone: row.timezone,
      source: contextSource({
        id: row.id,
        kind: "owner_profile",
        label: "Owner profile",
        visibility: "public",
        reason: "Always include a small owner profile.",
      }),
    };
  } catch {
    failedSources.push(failedContextSource("owner-profile", "owner_profile", "Owner profile"));
    return null;
  }
}

async function loadAssistantJobProjectsContext(
  env: Env,
  userId: string,
  failedSources: Me3AgentContextSource[],
): Promise<Me3AgentContextProject[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, name, slug, description, status, source_ref, updated_at
       FROM mission_projects
       WHERE user_id = ? AND status != 'archived'
       ORDER BY updated_at DESC
       LIMIT 30`,
    )
      .bind(userId)
      .all<MissionProjectContextRow>();
    return (rows.results || []).map((row) => ({
      id: row.id,
      name: row.name,
      aliases: [row.slug].filter((value): value is string => Boolean(value)),
      summary: row.description,
      status: row.status,
      source: contextSource({
        id: row.id,
        kind: "project",
        label: row.name,
        visibility: "private",
        sourceRef: row.source_ref,
        updatedAt: row.updated_at,
      }),
    }));
  } catch {
    failedSources.push(failedContextSource("mission-projects", "project", "Mission projects"));
    return [];
  }
}

async function loadAssistantJobTasksContext(
  env: Env,
  userId: string,
  failedSources: Me3AgentContextSource[],
): Promise<Me3AgentContextTask[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, project_id, title, description, status, due_at, scheduled_for,
              source_ref, updated_at
       FROM mission_tasks
       WHERE user_id = ?
         AND archived_at IS NULL
         AND status NOT IN ('done', 'cancelled')
       ORDER BY priority ASC, COALESCE(due_at, scheduled_for, updated_at) ASC
       LIMIT 50`,
    )
      .bind(userId)
      .all<MissionTaskContextRow>();
    return (rows.results || []).map((row) => ({
      id: row.id,
      title: row.description ? `${row.title}: ${row.description}` : row.title,
      status: row.status,
      dueAt: row.due_at || row.scheduled_for,
      projectId: row.project_id,
      source: contextSource({
        id: row.id,
        kind: "task",
        label: row.title,
        visibility: "private",
        sourceRef: row.source_ref,
        updatedAt: row.updated_at,
      }),
    }));
  } catch {
    failedSources.push(failedContextSource("mission-tasks", "task", "Mission tasks"));
    return [];
  }
}

async function loadAssistantJobMemoryContext(
  env: Env,
  userId: string,
  failedSources: Me3AgentContextSource[],
): Promise<Me3AgentContextPrivateMemory[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, memory_kind, scope_kind, scope_id, title, body, confidence,
              source_ref, updated_at
       FROM mission_private_memory
       WHERE user_id = ? AND review_status = 'active'
       ORDER BY updated_at DESC
       LIMIT 40`,
    )
      .bind(userId)
      .all<MissionMemoryContextRow>();
    return (rows.results || []).map((row) => ({
      id: row.id,
      kind: row.memory_kind,
      title: row.title,
      body: row.body,
      scope: row.scope_id ? `${row.scope_kind}:${row.scope_id}` : row.scope_kind,
      confidence: row.confidence,
      source: contextSource({
        id: row.id,
        kind: "private_memory",
        label: row.title || row.memory_kind,
        visibility: "private",
        sourceRef: row.source_ref,
        updatedAt: row.updated_at,
      }),
    }));
  } catch {
    failedSources.push(failedContextSource("mission-memory", "private_memory", "Private memory"));
    return [];
  }
}

async function loadAssistantJobCalendarContext(
  env: Env,
  userId: string,
  failedSources: Me3AgentContextSource[],
): Promise<Me3AgentContextCalendarEvent[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, title, notes, starts_at, ends_at, timezone, created_at, updated_at
       FROM user_calendar_events
       WHERE user_id = ?
       ORDER BY starts_at ASC
       LIMIT 30`,
    )
      .bind(userId)
      .all<CalendarEventContextRow>();
    return (rows.results || []).map((row) => ({
      id: row.id,
      title: row.notes ? `${row.title}: ${row.notes}` : row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      source: contextSource({
        id: row.id,
        kind: "calendar_event",
        label: row.title,
        visibility: "private",
        updatedAt: row.updated_at || row.created_at,
      }),
    }));
  } catch {
    failedSources.push(failedContextSource("calendar-events", "calendar_event", "Calendar events"));
    return [];
  }
}

async function loadAssistantJobRecentMessagesContext(
  env: Env,
  userId: string,
  failedSources: Me3AgentContextSource[],
): Promise<Me3AgentContextRecentMessage[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, role, content, created_at
       FROM assistant_messages
       WHERE owner_id = ?
       ORDER BY created_at DESC
       LIMIT 12`,
    )
      .bind(userId)
      .all<AssistantMessageContextRow>();
    return (rows.results || []).map((row, index) => ({
      id: row.id || `recent-${index + 1}`,
      role: row.role,
      content: row.content,
      createdAt: row.created_at || null,
      source: contextSource({
        id: row.id || `recent-${index + 1}`,
        kind: "assistant_message",
        label: "Recent chat",
        visibility: "private",
        updatedAt: row.created_at || null,
      }),
    }));
  } catch {
    failedSources.push(failedContextSource("assistant-messages", "assistant_message", "Recent chat"));
    return [];
  }
}

async function getAssistantJobIngressEventByIdempotencyKey(
  env: Env,
  userId: string,
  idempotencyKey: string,
) {
  return env.DB.prepare(
    "SELECT * FROM assistant_job_ingress_events WHERE user_id = ? AND idempotency_key = ?",
  )
    .bind(userId, idempotencyKey)
    .first<AssistantJobIngressEventRow>();
}

async function requireAssistantJobIngressEvent(env: Env, userId: string, eventId: string) {
  const event = await env.DB.prepare(
    "SELECT * FROM assistant_job_ingress_events WHERE id = ? AND user_id = ?",
  )
    .bind(eventId, userId)
    .first<AssistantJobIngressEventRow>();
  if (!event) throw new AssistantJobsInputError("Assistant Job ingress event not found", 404);
  return event;
}

async function enqueueAssistantJobIngressEvent(env: Env, row: AssistantJobIngressEventRow) {
  if (!env.ASSISTANT_JOB_EVENTS) return false;

  try {
    await env.ASSISTANT_JOB_EVENTS.send({ eventId: row.id, userId: row.user_id });
    await setAssistantJobIngressEventStatus(env, row.user_id, row.id, "queued", {
      queuedAt: new Date().toISOString(),
    }, row);
    return true;
  } catch (error) {
    await setAssistantJobIngressEventStatus(env, row.user_id, row.id, "failed", {
      queueFailedAt: new Date().toISOString(),
      errorMessage: getErrorMessage(error),
    }, row);
    throw error;
  }
}

async function setAssistantJobIngressEventStatus(
  env: Env,
  userId: string,
  eventId: string,
  status: AssistantJobIngressStatus,
  payloadPatch?: Record<string, unknown>,
  existing?: AssistantJobIngressEventRow,
) {
  const row = existing || (await requireAssistantJobIngressEvent(env, userId, eventId));
  const payload = parseJson<Record<string, unknown>>(row.payload_json, {});
  const nextPayload = payloadPatch ? { ...payload, ...payloadPatch } : payload;

  await env.DB.prepare(
    `UPDATE assistant_job_ingress_events
     SET status = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  )
    .bind(status, stringifyJson(nextPayload), eventId, userId)
    .run();

  return requireAssistantJobIngressEvent(env, userId, eventId);
}

async function appendAssistantJobMissionActivity(
  env: Env,
  userId: string,
  input: {
    activityType: string;
    title: string;
    summary?: string | null;
    status?: string | null;
    relatedId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await env.DB.prepare(
      `INSERT INTO mission_plugin_activity
         (id, user_id, plugin_id, activity_type, title, summary, status, related_id, metadata_json)
       VALUES (?, ?, 'me3.assistant-jobs', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        input.activityType,
        input.title,
        input.summary || null,
        input.status || null,
        input.relatedId || null,
        stringifyJson(input.metadata || {}),
      )
      .run();
  } catch {
    // Mission Control activity should not make queue failure handling fail again.
  }
}

function draftFromVersion(job: AssistantJobRow, version: AssistantJobVersionRow): AssistantJobDraft {
  return {
    name: version.name,
    purpose: version.purpose,
    recipeId: job.recipe_id,
    trigger: parseJson(version.trigger_json, { kind: "manual" }) as AssistantJobDraft["trigger"],
    scope: parseJson(version.scope_json, {
      projectId: null,
      sourceIds: [],
      providerAccountIds: [],
      filters: [],
    }) as AssistantJobDraft["scope"],
    rules: parseJson(version.rules_json, []),
    actions: parseJson(version.actions_json, []),
    approvalPolicy: parseJson(version.approval_policy_json, {
      defaultMode: "review_required",
      overrides: [],
      ownerCanApproveFrom: "mission_control",
      approvalExpiresAfterHours: null,
    }) as AssistantJobDraft["approvalPolicy"],
    destination: parseJson(version.destination_json, {
      kind: "mission_control",
      projectId: null,
      landing: "review_packet",
      quietIfNoChanges: true,
    }) as AssistantJobDraft["destination"],
    projectId: job.project_id,
    recommendedSkillIds: parseJson(version.recommended_skill_ids_json, []),
    requiredSkillIds: parseJson(version.required_skill_ids_json, []),
  };
}

function candidateVersionFromRow(row: AssistantJobMatchCandidateRow): AssistantJobVersionRow {
  return {
    id: row.version_id,
    job_id: row.id,
    user_id: row.user_id,
    version_number: row.version_number,
    name: row.version_name,
    purpose: row.version_purpose,
    trigger_json: row.candidate_trigger_json,
    scope_json: row.candidate_scope_json,
    rules_json: row.candidate_rules_json,
    actions_json: row.candidate_actions_json,
    approval_policy_json: row.candidate_approval_policy_json,
    destination_json: row.candidate_destination_json,
    capability_ids_json: row.candidate_capability_ids_json,
    permission_summary_json: row.candidate_permission_summary_json,
    recommended_skill_ids_json: row.candidate_recommended_skill_ids_json,
    required_skill_ids_json: row.candidate_required_skill_ids_json,
    validation_status: row.candidate_validation_status,
    validation_errors_json: row.candidate_validation_errors_json,
    created_at: row.version_created_at,
  };
}

function assistantJobCandidateMatchesEvent(
  candidate: AssistantJobMatchCandidateRow,
  event: AssistantJobIngressEventRow,
) {
  const trigger = parseJson<AssistantJobDraft["trigger"]>(candidate.candidate_trigger_json, {
    kind: "manual",
  });
  if (trigger.kind !== "event") return false;
  if (trigger.source !== event.source_kind) return false;
  if (trigger.sourceId !== event.source_id) return false;
  if (trigger.eventType !== event.event_type) return false;
  return trigger.filters.every((filter) =>
    matchesEventFilter(
      parseJson(event.payload_json, {}),
      filter.field,
      filter.operator,
      filter.value,
    ),
  );
}

function matchesEventFilter(
  payload: Record<string, unknown>,
  field: string,
  operator: string,
  expected: unknown,
) {
  const actual = getValueAtPath(payload, field);
  if (operator === "equals") return actual === expected;
  if (operator === "contains") {
    if (typeof actual === "string") return actual.includes(String(expected));
    if (Array.isArray(actual)) return actual.includes(expected);
    return false;
  }
  if (operator === "starts_with") {
    return typeof actual === "string" && actual.startsWith(String(expected));
  }
  if (operator === "in") {
    return Array.isArray(expected) && expected.includes(actual);
  }
  return false;
}

function getValueAtPath(payload: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, part) => {
    if (!isRecord(value)) return undefined;
    return value[part];
  }, payload);
}

function resolveActionApprovalMode(
  draft: AssistantJobDraft,
  action: AssistantJobAction,
  capability: AssistantCapability,
): AssistantJobApprovalMode {
  const override = draft.approvalPolicy.overrides.find(
    (entry) => entry.capabilityId === capability.id,
  )?.mode;
  return strongestApprovalMode([
    draft.approvalPolicy.defaultMode,
    capability.approvalMode,
    action.approvalMode,
    override,
  ]);
}

function strongestApprovalMode(modes: readonly (AssistantJobApprovalMode | undefined)[]) {
  const order: Record<AssistantJobApprovalMode, number> = {
    none: 0,
    review_required: 1,
    approval_required: 2,
    forbidden: 3,
  };
  return modes.reduce<AssistantJobApprovalMode>((strongest, mode) => {
    if (!mode) return strongest;
    return order[mode] > order[strongest] ? mode : strongest;
  }, "none");
}

function buildActionIdempotencyKey(run: AssistantJobRunRow, action: AssistantJobAction) {
  if (action.idempotencyScope === "source_event" && run.trigger_ref) {
    return `${run.user_id}:${run.job_id}:${action.id}:${run.trigger_ref}`;
  }
  return `${run.id}:${action.id}`;
}

function missionOutputId(run: AssistantJobRunRow, action: AssistantJobAction, kind: string) {
  return `assistant-job-output:${run.id}:${action.id}:${kind}`;
}

function missionDailyNoteId(userId: string, date: string) {
  return `assistant-job-day:${userId}:${date}`;
}

function missionTextInput(action: AssistantJobAction, key: string) {
  return normalizeNullableText(action.inputs[key]);
}

function resolveMissionOutputProjectId(
  job: AssistantJobRow,
  draft: AssistantJobDraft,
  action: AssistantJobAction,
) {
  return missionTextInput(action, "projectId")
    || draft.destination.projectId
    || draft.projectId
    || draft.scope.projectId
    || job.project_id
    || null;
}

function missionOutputMetadata(input: {
  job: AssistantJobRow;
  run: AssistantJobRunRow;
  action: AssistantJobAction;
  capability: AssistantCapability;
  idempotencyKey: string;
}) {
  return {
    assistantJobId: input.job.id,
    assistantJobName: input.job.name,
    assistantJobRunId: input.run.id,
    actionId: input.action.id,
    capabilityId: input.capability.id,
    idempotencyKey: input.idempotencyKey,
    inputs: input.action.inputs,
  };
}

function normalizeMissionPriority(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function normalizeMissionDate(value: unknown) {
  const text = normalizeNullableText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function normalizeMissionCaptureType(value: unknown) {
  return value === "reminder" || value === "event" || value === "task" ? value : "task";
}

function riskLevelForCapability(capability: AssistantCapability) {
  if (
    capability.sideEffect === "destructive" ||
    capability.sideEffect === "money_or_account" ||
    capability.sideEffect === "permission_change" ||
    capability.sideEffect === "external_send" ||
    capability.sideEffect === "public_publish"
  ) {
    return "high";
  }
  if (
    capability.sideEffect === "external_write" ||
    capability.sideEffect === "local_write" ||
    capability.sideEffect === "local_shell" ||
    capability.sideEffect === "memory_write"
  ) {
    return "medium";
  }
  return "low";
}

function missionAgentRunIdForAssistantJobRun(runId: string) {
  return `assistant-job-run:${runId}`;
}

function contextSource(input: {
  id: string;
  kind: Me3AgentContextSource["kind"];
  label: string;
  visibility: Me3AgentContextSource["visibility"];
  status?: Me3AgentContextSource["status"];
  reason?: string;
  sourceRef?: string | null;
  updatedAt?: string | null;
}): Me3AgentContextSource {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    visibility: input.visibility,
    status: input.status,
    reason: input.reason,
    sourceRef: input.sourceRef ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

function failedContextSource(
  id: string,
  kind: Me3AgentContextSource["kind"],
  label: string,
): Me3AgentContextSource {
  return contextSource({
    id,
    kind,
    label,
    visibility: "private",
    status: "failed",
    reason: "Context lookup failed.",
  });
}

function summarizeAssistantJobRunOutput(actionResults: SerializedActionResult[]) {
  const pending = actionResults.filter((result) => result.status === "pending_approval").length;
  const succeeded = actionResults.filter((result) => result.status === "succeeded").length;
  const failed = actionResults.filter(
    (result) => result.status === "failed" || result.status === "blocked",
  ).length;
  if (pending > 0) return `${pending} action${pending === 1 ? "" : "s"} waiting for approval`;
  if (failed > 0) return `${failed} action${failed === 1 ? "" : "s"} failed`;
  return `${succeeded} action${succeeded === 1 ? "" : "s"} completed`;
}

function resolveInitialStatus(
  validation: AssistantJobDraftValidation,
  requestedStatus: AssistantJobStatus | null,
): AssistantJobStatus {
  if (requestedStatus === "draft" || requestedStatus === "paused") return requestedStatus;
  if (validation.status === "valid") return requestedStatus === "active" ? "active" : "active";
  if (validation.status === "needs_setup") return "needs_setup";
  return "draft";
}

function serializeRecipe(recipe: AssistantJobStarterRecipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    outcome: recipe.outcome,
    firstVersion: recipe.firstVersion,
    state: recipe.state,
    requiredCapabilityIds: recipe.requiredCapabilityIds,
    optionalCapabilityIds: recipe.optionalCapabilityIds,
    recommendedSkillIds: recipe.recommendedSkillIds,
    requiredSkillIds: recipe.requiredSkillIds,
    defaultDraft: recipe.defaultDraft,
  };
}

function serializeJob(row: AssistantJobRow) {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    name: row.name,
    purpose: row.purpose,
    status: row.status,
    currentVersionId: row.current_version_id,
    projectId: row.project_id,
    destination: parseJson(row.destination_json, {}),
    triggerSummary: row.trigger_summary,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    failureCount: row.failure_count,
    setupState: parseJson(row.setup_state_json, {}),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function serializeVersion(row: AssistantJobVersionRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    versionNumber: row.version_number,
    name: row.name,
    purpose: row.purpose,
    trigger: parseJson(row.trigger_json, {}),
    scope: parseJson(row.scope_json, {}),
    rules: parseJson(row.rules_json, []),
    actions: parseJson(row.actions_json, []),
    approvalPolicy: parseJson(row.approval_policy_json, {}),
    destination: parseJson(row.destination_json, {}),
    capabilityIds: parseJson(row.capability_ids_json, []),
    permissionSummary: parseJson(row.permission_summary_json, {}),
    recommendedSkillIds: parseJson(row.recommended_skill_ids_json, []),
    requiredSkillIds: parseJson(row.required_skill_ids_json, []),
    validationStatus: row.validation_status,
    validationErrors: parseJson(row.validation_errors_json, []),
    createdAt: row.created_at,
  };
}

function serializeRun(row: AssistantJobRunRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    jobVersionId: row.job_version_id,
    triggerKind: row.trigger_kind,
    triggerRef: row.trigger_ref,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    outputPreview: row.output_preview,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeActionResult(row: AssistantJobActionResultRow) {
  return {
    id: row.id,
    runId: row.run_id,
    actionId: row.action_id,
    capabilityId: row.capability_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    approvalId: row.approval_id,
    artifactId: row.artifact_id,
    externalRef: row.external_ref,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeIngressEvent(row: AssistantJobIngressEventRow) {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    sourceEventId: row.source_event_id,
    eventType: row.event_type,
    idempotencyKey: row.idempotency_key,
    payload: parseJson(row.payload_json, {}),
    rawPayloadRef: row.raw_payload_ref,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summarizeTrigger(trigger: AssistantJobDraft["trigger"]) {
  if (trigger.kind === "manual") return "Manual";
  if (trigger.kind === "event") return `When ${trigger.eventType} happens`;
  if (trigger.cadence === "weekly" && trigger.localTime) return `Weekly at ${trigger.localTime}`;
  if (trigger.cadence === "daily" && trigger.localTime) return `Daily at ${trigger.localTime}`;
  return trigger.cadence;
}

function normalizeIngressEventBody(body: CreateAssistantJobIngressEventBody) {
  const sourceKind = normalizeIngressSourceKind(body.sourceKind);
  const sourceId = normalizeOptionalText(body.sourceId);
  const sourceEventId = normalizeOptionalText(body.sourceEventId);
  const eventType = normalizeOptionalText(body.eventType);
  if (!sourceKind) throw new AssistantJobsInputError("Valid sourceKind is required");
  if (!sourceId) throw new AssistantJobsInputError("sourceId is required");
  if (!sourceEventId) throw new AssistantJobsInputError("sourceEventId is required");
  if (!eventType) throw new AssistantJobsInputError("eventType is required");

  const idempotencyKey =
    normalizeOptionalText(body.idempotencyKey) ||
    buildIngressIdempotencyKey(sourceKind, sourceId, eventType, sourceEventId);

  return {
    sourceKind,
    sourceId,
    sourceEventId,
    eventType,
    idempotencyKey,
    payload: body.payload === undefined ? {} : body.payload,
    rawPayloadRef: normalizeNullableText(body.rawPayloadRef),
  };
}

function buildIngressIdempotencyKey(
  sourceKind: AssistantJobIngressSourceKind,
  sourceId: string,
  eventType: string,
  sourceEventId: string,
) {
  return `${sourceKind}:${sourceId}:${eventType}:${sourceEventId}`;
}

function normalizeIngressSourceKind(value: unknown): AssistantJobIngressSourceKind | null {
  if (
    value === "core" ||
    value === "mission_control" ||
    value === "plugin" ||
    value === "webhook"
  ) {
    return value;
  }
  return null;
}

function normalizeIngressStatus(value: unknown): AssistantJobIngressStatus | null {
  if (
    value === "received" ||
    value === "matched" ||
    value === "queued" ||
    value === "processed" ||
    value === "ignored" ||
    value === "failed"
  ) {
    return value;
  }
  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Assistant Job queue error";
}

function normalizeJobStatus(value: unknown): AssistantJobStatus | null {
  if (
    value === "draft" ||
    value === "active" ||
    value === "paused" ||
    value === "needs_setup" ||
    value === "failing" ||
    value === "archived"
  ) {
    return value;
  }
  return null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeNullableText(value: unknown): string | null {
  if (value === null) return null;
  return normalizeOptionalText(value);
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string, status: 400 | 404 | 409): never {
  throw new AssistantJobsInputError(message, status);
}
