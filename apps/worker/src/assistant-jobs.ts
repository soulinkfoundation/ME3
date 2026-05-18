import {
  ASSISTANT_JOB_CAPABILITIES,
  ASSISTANT_JOB_STARTER_RECIPES,
  createAssistantJobDraftFromRecipe,
  getAssistantJobStarterRecipe,
  validateAssistantJobDraft,
  type AssistantJobDraft,
  type AssistantJobDraftValidation,
  type AssistantJobStarterRecipe,
} from "@me3-core/assistant-jobs";
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
  if (event.status === "processed") {
    return { event: serializeIngressEvent(event), outcome: "already_processed" };
  }

  const processed = await setAssistantJobIngressEventStatus(env, userId, eventId, "processed", {
    queueProcessedAt: new Date().toISOString(),
    queueOutcome: "trigger_matching_not_implemented",
  });
  return { event: serializeIngressEvent(processed), outcome: "processed_noop" };
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
  return {
    job: serializeJob(job),
    version,
    runs: runs.results.map(serializeRun),
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

  return {
    run: serializeRun(await requireAssistantJobRun(env, userId, runId)),
    validation,
    execution: "not_started",
  };
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
