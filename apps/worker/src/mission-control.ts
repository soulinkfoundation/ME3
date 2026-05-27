import {
  inferMissionCaptureType,
  normalizeMissionCaptureStatus,
  normalizeMissionCaptureType,
  normalizeMissionDateKey,
  normalizeMissionProjectStatus,
  normalizeMissionTaskStatus,
  slugifyMissionProjectName,
  type MissionCaptureStatus,
  type MissionCaptureType,
  type MissionProjectStatus,
  type MissionSyncStatus,
  type MissionTaskStatus,
} from "@me3-core/plugin-mission-control";
import { getUtcMsForLocalTime, normalizeTimeZone } from "./calendar";
import { hasConfiguredAiProvider } from "./ai-providers";
import { isCorePluginEnabled } from "./plugins";
import type { Env } from "./types";

export class MissionControlInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

type MissionProjectRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: MissionProjectStatus;
  color: string | null;
  icon: string | null;
  source_kind: "manual" | "daemon_repo" | "beads" | "import";
  source_ref: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

type MissionTaskRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: MissionTaskStatus;
  priority: number;
  due_at: string | null;
  scheduled_for: string | null;
  source_kind: "manual" | "capture" | "agent" | "beads" | "daemon";
  source_ref: string | null;
  approval_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type MissionDailyNoteRow = {
  id: string;
  user_id: string;
  date: string;
  title: string | null;
  journal_text: string;
  created_at: string;
  updated_at: string;
};

type MissionCaptureRow = {
  id: string;
  user_id: string;
  day_id: string;
  type: MissionCaptureType;
  text: string;
  project_id: string | null;
  status: MissionCaptureStatus;
  task_id: string | null;
  calendar_event_id: string | null;
  reminder_id: string | null;
  due_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  timezone: string | null;
  sync_status: MissionSyncStatus;
  sync_error: string | null;
  source: "manual" | "agent" | "import" | "carry_over";
  source_ref: string | null;
  created_at: string;
  updated_at: string;
};

type MissionApprovalRow = {
  id: string;
  user_id: string;
  plugin_id: string;
  action_id: string;
  title: string;
  summary: string | null;
  payload_json: string;
  risk_level: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  requested_by: string;
  resolved_by: string | null;
  requested_at: string;
  resolved_at: string | null;
  expires_at: string | null;
};

type MissionAgentRunRow = {
  id: string;
  user_id: string;
  source: "core" | "daemon" | "hosted_cloud" | "import";
  project_id: string | null;
  task_id: string | null;
  approval_id: string | null;
  title: string;
  prompt_summary: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  model: string | null;
  runner_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  cost_json: string;
  result_json: string;
  artifact_manifest_json: string;
  created_at: string;
  updated_at: string;
};

type MissionPluginActivityRow = {
  id: string;
  user_id: string;
  plugin_id: string;
  activity_type: string;
  title: string;
  summary: string | null;
  status: string | null;
  related_id: string | null;
  metadata_json: string;
  created_at: string;
};

type MissionMemoryRow = {
  id: string;
  user_id: string;
  memory_kind:
    | "owner_note"
    | "project_context"
    | "preference"
    | "relationship_note"
    | "correction"
    | "learning";
  scope_kind: "owner" | "project" | "contact" | "plugin";
  scope_id: string | null;
  title: string | null;
  body: string;
  confidence: number;
  source_kind: "manual" | "agent" | "import" | "daemon";
  source_ref: string | null;
  review_status: "active" | "needs_review" | "archived";
  created_at: string;
  updated_at: string;
};

type MissionContextSourceRow = {
  id: string;
  user_id: string;
  source_kind:
    | "public_me_json"
    | "private_memory"
    | "core_table"
    | "plugin_table"
    | "daemon_directory"
    | "daemon_repo"
    | "provider"
    | "upload"
    | "url";
  label: string;
  description: string | null;
  visibility: "public" | "private";
  status: "active" | "setup_required" | "paused" | "failed" | "archived";
  source_ref: string | null;
  last_indexed_at: string | null;
  grants_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

type MissionDaemonPairingRow = {
  id: string;
  runner_id: string;
  display_name: string;
  status: "pending" | "active" | "paused" | "revoked" | "unhealthy";
  version: string | null;
  platform: string | null;
  last_seen_at: string | null;
  health_json: string;
  paired_at: string | null;
  created_at: string;
  updated_at: string;
};

type MissionDaemonAllowlistRow = {
  id: string;
  pairing_id: string;
  label: string;
  path_hint: string;
  resource_kind: "directory" | "repo";
  permission_tier: "metadata" | "read" | "write" | "shell";
  shell_policy_json: string;
  status: "active" | "paused" | "revoked" | "missing";
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

type MissionDaemonAuditRow = {
  id: string;
  pairing_id: string | null;
  allowlist_entry_id: string | null;
  run_id: string | null;
  approval_id: string | null;
  event_type: string;
  actor: string;
  summary: string;
  payload_json: string;
  created_at: string;
};

type OwnerTimezoneRow = {
  timezone: string | null;
};

type TemporalHint = {
  startsAt: string;
  endsAt: string;
  timezone: string;
};

type CaptureCreateInput = {
  date?: unknown;
  text?: unknown;
  type?: unknown;
  projectId?: unknown;
  scheduledDate?: unknown;
  scheduledTime?: unknown;
  timezone?: unknown;
  source?: unknown;
};

type MissionSetupItem = {
  id: string;
  label: string;
  status: "ready" | "setup_required" | "optional" | "disabled";
  detail: string;
  actionPath: string | null;
};

const PERSONAL_PROJECT_ID = "mission-project-personal";
const DEFAULT_OWNER_TIMEZONE = "UTC";
const ACTIVE_TASK_STATUSES: MissionTaskStatus[] = ["backlog", "in_progress", "review"];

export async function getMissionControlOverview(
  env: Env,
  userId: string,
  dateInput: unknown,
) {
  const date = normalizeMissionDateKey(dateInput) || localDateKey(new Date());
  const [day, projects, setup] = await Promise.all([
    getMissionDay(env, userId, date),
    listMissionProjects(env, userId),
    getMissionSetup(env, userId),
  ]);

  const [tasksDueToday, pendingApprovals, recentRuns, activity, daemon] =
    await Promise.all([
      listMissionTasks(env, userId, { dueDate: date, activeOnly: true, limit: 8 }),
      listMissionApprovals(env, userId, "pending", 8),
      listMissionAgentRuns(env, userId, 8),
      listMissionPluginActivity(env, userId, 8),
      getMissionDaemonStatus(env, userId),
    ]);

  return {
    day: day.day,
    captures: day.captures,
    projects,
    tasksDueToday,
    pendingApprovals,
    recentRuns,
    setup,
    daemon,
    activity,
  };
}

export async function getMissionDay(env: Env, userId: string, date: string) {
  const normalizedDate = requireDateKey(date);
  const [day, projects] = await Promise.all([
    getOrCreateMissionDay(env, userId, normalizedDate),
    listMissionProjects(env, userId),
  ]);
  const captures = await env.DB.prepare(
    `SELECT id, user_id, day_id, type, text, project_id, status, task_id,
            calendar_event_id, reminder_id, due_at, event_start_at, event_end_at,
            timezone, sync_status, sync_error, source, source_ref, created_at, updated_at
     FROM mission_capture_items
     WHERE user_id = ? AND day_id = ? AND status != 'archived'
     ORDER BY status = 'done', created_at DESC`,
  )
    .bind(userId, day.id)
    .all<MissionCaptureRow>();

  return {
    day: serializeDay(day),
    captures: (captures.results || []).map(serializeCapture),
    projects,
  };
}

export async function listMissionJournalEntries(
  env: Env,
  userId: string,
  options: { limit?: unknown } = {},
) {
  const limit = normalizeListLimit(options.limit, 100);
  const rows = await env.DB.prepare(
    `SELECT id, user_id, date, title, journal_text, created_at, updated_at
     FROM mission_daily_notes
     WHERE user_id = ?
       AND LENGTH(TRIM(REPLACE(REPLACE(journal_text, char(10), ' '), char(13), ' '))) > 0
     ORDER BY date DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<MissionDailyNoteRow>();

  return (rows.results || []).map(serializeJournalEntry);
}

export async function updateMissionDay(
  env: Env,
  userId: string,
  date: string,
  input: unknown,
) {
  const normalizedDate = requireDateKey(date);
  const body = isRecord(input) ? input : {};
  const journalText =
    typeof body.journalText === "string"
      ? body.journalText
      : typeof body.journal_text === "string"
        ? body.journal_text
        : "";
  const title = normalizeNullableText(body.title);
  const day = await getOrCreateMissionDay(env, userId, normalizedDate);

  await env.DB.prepare(
    `UPDATE mission_daily_notes
     SET title = ?, journal_text = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(title, journalText, day.id, userId)
    .run();

  return {
    day: serializeDay({
      ...day,
      title,
      journal_text: journalText,
      updated_at: new Date().toISOString(),
    }),
  };
}

export async function createMissionCapture(
  env: Env,
  userId: string,
  input: CaptureCreateInput,
) {
  const text = normalizeNullableText(input.text);
  if (!text) throw new MissionControlInputError("Capture text is required");

  const date = normalizeMissionDateKey(input.date) || localDateKey(new Date());
  const type = normalizeMissionCaptureType(input.type) || inferMissionCaptureType(text);
  const source = input.source === "agent" ? "agent" : "manual";
  const projectId =
    typeof input.projectId === "string" && input.projectId.trim()
      ? input.projectId.trim()
      : (await ensurePersonalProject(env, userId)).id;
  await ensureProjectExists(env, userId, projectId);

  const ownerTimezone = await getOwnerTimezone(env, userId);
  const manualTimezone =
    typeof input.timezone === "string" ? normalizeTimeZone(input.timezone) : null;
  const temporal =
    parseManualTemporalHint(input.scheduledDate, input.scheduledTime, manualTimezone || ownerTimezone) ||
    parseTemporalHint(text, date, ownerTimezone);
  const day = await getOrCreateMissionDay(env, userId, date);
  const captureId = crypto.randomUUID();
  let taskId: string | null = null;
  let reminderId: string | null = null;
  let calendarEventId: string | null = null;
  let syncStatus: MissionSyncStatus = "local";
  let syncError: string | null = null;
  const dueAt = temporal?.startsAt || null;
  const eventStartAt = type === "event" ? temporal?.startsAt || null : null;
  const eventEndAt = type === "event" ? temporal?.endsAt || null : null;

  if (type === "task") {
    taskId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO mission_tasks
         (id, user_id, project_id, title, status, priority, due_at, scheduled_for, source_kind, source_ref)
       VALUES (?, ?, ?, ?, 'backlog', 3, ?, ?, 'capture', ?)`,
    )
      .bind(taskId, userId, projectId, text, dueAt, date, captureId)
      .run();
  } else if (!(await isCorePluginEnabled(env, "me3.calendar"))) {
    syncStatus = "setup_required";
    syncError = "Calendar plugin is disabled. Enable Calendar to sync reminders and events.";
  } else if (!temporal) {
    syncStatus = "pending";
    syncError = "Add a date and time to sync this capture to Calendar.";
  } else if (type === "reminder") {
    reminderId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO user_reminders
         (id, user_id, title, notes, remind_at, timezone, recurrence_rule, status, created_via)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, 'pending', 'mission_control')`,
    )
      .bind(reminderId, userId, cleanupReminderTitle(text), temporal.startsAt, temporal.timezone)
      .run();
    syncStatus = "synced";
  } else {
    calendarEventId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO user_calendar_events
         (id, user_id, title, notes, location, starts_at, ends_at, timezone, all_day, kind, recurrence_rule)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 0, 'event', NULL)`,
    )
      .bind(calendarEventId, userId, text, temporal.startsAt, temporal.endsAt, temporal.timezone)
      .run();
    syncStatus = "synced";
  }

  await env.DB.prepare(
    `INSERT INTO mission_capture_items
       (id, user_id, day_id, type, text, project_id, status, task_id,
        calendar_event_id, reminder_id, due_at, event_start_at, event_end_at,
        timezone, sync_status, sync_error, source)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      captureId,
      userId,
      day.id,
      type,
      text,
      projectId,
      taskId,
      calendarEventId,
      reminderId,
      dueAt,
      eventStartAt,
      eventEndAt,
      temporal?.timezone || ownerTimezone,
      syncStatus,
      syncError,
      source,
    )
    .run();

  await appendMissionPluginActivity(env, userId, {
    pluginId: "me3.mission-control",
    activityType: "capture.created",
    title: `Captured ${type}`,
    summary: text,
    status: syncStatus,
    relatedId: captureId,
  });

  const capture = await getMissionCapture(env, userId, captureId);
  if (!capture) throw new MissionControlInputError("Capture was not created", 409);
  return { capture: serializeCapture(capture) };
}

export async function updateMissionCapture(
  env: Env,
  userId: string,
  captureId: string,
  input: unknown,
) {
  const existing = await getMissionCapture(env, userId, captureId);
  if (!existing) throw new MissionControlInputError("Capture not found", 404);
  const body = isRecord(input) ? input : {};
  const status = normalizeMissionCaptureStatus(body.status) || existing.status;
  const text = normalizeNullableText(body.text) || existing.text;
  const projectId =
    typeof body.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : existing.project_id;
  if (projectId) await ensureProjectExists(env, userId, projectId);

  await env.DB.prepare(
    `UPDATE mission_capture_items
     SET text = ?, project_id = ?, status = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(text, projectId, status, captureId, userId)
    .run();

  if (existing.task_id) {
    await env.DB.prepare(
      `UPDATE mission_tasks
       SET title = ?, project_id = ?, status = CASE WHEN ? = 'done' THEN 'done' ELSE status END,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
      .bind(text, projectId, status, existing.task_id, userId)
      .run();
  }

  const capture = await getMissionCapture(env, userId, captureId);
  if (!capture) throw new MissionControlInputError("Capture not found", 404);
  return { capture: serializeCapture(capture) };
}

export async function archiveMissionCapture(env: Env, userId: string, captureId: string) {
  const existing = await getMissionCapture(env, userId, captureId);
  if (!existing) {
    throw new MissionControlInputError("Capture not found", 404);
  }

  const result = await env.DB.prepare(
    `UPDATE mission_capture_items
     SET status = 'archived', updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(captureId, userId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    throw new MissionControlInputError("Capture not found", 404);
  }

  if (existing.task_id) {
    await env.DB.prepare(
      `UPDATE mission_tasks
       SET status = 'cancelled', archived_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
      .bind(existing.task_id, userId)
      .run();
  }

  if (existing.reminder_id) {
    await env.DB.prepare(
      `UPDATE user_reminders
       SET status = 'cancelled'
       WHERE id = ? AND user_id = ?`,
    )
      .bind(existing.reminder_id, userId)
      .run();
  }

  if (existing.calendar_event_id) {
    await env.DB.prepare("DELETE FROM user_calendar_events WHERE id = ? AND user_id = ?")
      .bind(existing.calendar_event_id, userId)
      .run();
  }

  return { ok: true };
}

export async function listMissionProjects(env: Env, userId: string) {
  await ensurePersonalProject(env, userId);
  const rows = await env.DB.prepare(
    `SELECT id, user_id, name, slug, description, status, color, icon, source_kind,
            source_ref, metadata_json, created_at, updated_at
     FROM mission_projects
     WHERE user_id = ? AND status != 'archived'
     ORDER BY CASE WHEN slug = 'personal' THEN 0 ELSE 1 END, name ASC`,
  )
    .bind(userId)
    .all<MissionProjectRow>();
  return (rows.results || []).map(serializeProject);
}

export async function createMissionProject(env: Env, userId: string, input: unknown) {
  const body = isRecord(input) ? input : {};
  const name = normalizeNullableText(body.name);
  if (!name) throw new MissionControlInputError("Project name is required");
  const slug = slugifyMissionProjectName(
    normalizeNullableText(body.slug) || name,
  );
  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(
      `INSERT INTO mission_projects
         (id, user_id, name, slug, description, status, color, icon, source_kind)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 'manual')`,
    )
      .bind(
        id,
        userId,
        name,
        slug,
        normalizeNullableText(body.description),
        normalizeNullableText(body.color),
        normalizeNullableText(body.icon),
      )
      .run();
  } catch {
    throw new MissionControlInputError("A project with that name already exists", 409);
  }

  return {
    project: serializeProject((await getMissionProject(env, userId, id)) as MissionProjectRow),
  };
}

export async function updateMissionProject(
  env: Env,
  userId: string,
  projectId: string,
  input: unknown,
) {
  const existing = await getMissionProject(env, userId, projectId);
  if (!existing) throw new MissionControlInputError("Project not found", 404);
  const body = isRecord(input) ? input : {};
  const name = normalizeNullableText(body.name) || existing.name;
  const status = normalizeMissionProjectStatus(body.status) || existing.status;

  await env.DB.prepare(
    `UPDATE mission_projects
     SET name = ?, description = ?, status = ?, color = ?, icon = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      name,
      body.description === undefined
        ? existing.description
        : normalizeNullableText(body.description),
      status,
      body.color === undefined ? existing.color : normalizeNullableText(body.color),
      body.icon === undefined ? existing.icon : normalizeNullableText(body.icon),
      projectId,
      userId,
    )
    .run();

  return {
    project: serializeProject((await getMissionProject(env, userId, projectId)) as MissionProjectRow),
  };
}

export async function listMissionTasks(
  env: Env,
  userId: string,
  options: {
    status?: unknown;
    dueDate?: string;
    activeOnly?: boolean;
    limit?: number;
    archived?: boolean;
    projectId?: unknown;
  } = {},
) {
  const limit = Math.max(1, Math.min(options.limit || 50, 100));
  const status = normalizeMissionTaskStatus(options.status);
  const projectId =
    typeof options.projectId === "string" && options.projectId.trim()
      ? options.projectId.trim()
      : null;
  const activeWhere = ACTIVE_TASK_STATUSES.map((item) => `'${item}'`).join(", ");
  let sql = `SELECT id, user_id, project_id, title, description, status, priority,
                    due_at, scheduled_for, source_kind, source_ref, approval_id,
                    metadata_json, created_at, updated_at, archived_at
             FROM mission_tasks
             WHERE user_id = ? AND archived_at IS ${options.archived ? "NOT " : ""}NULL`;
  const values: unknown[] = [userId];
  if (projectId) {
    sql += " AND project_id = ?";
    values.push(projectId);
  }
  if (status) {
    sql += " AND status = ?";
    values.push(status);
  } else if (options.activeOnly) {
    sql += ` AND status IN (${activeWhere})`;
  }
  if (options.dueDate) {
    sql += " AND (scheduled_for = ? OR substr(due_at, 1, 10) = ?)";
    values.push(options.dueDate, options.dueDate);
  }
  sql += options.archived
    ? " ORDER BY archived_at DESC, updated_at DESC LIMIT ?"
    : " ORDER BY priority ASC, COALESCE(due_at, scheduled_for, created_at) ASC LIMIT ?";
  values.push(limit);

  const rows = await env.DB.prepare(sql)
    .bind(...values)
    .all<MissionTaskRow>();
  return (rows.results || []).map(serializeTask);
}

export async function createMissionTask(env: Env, userId: string, input: unknown) {
  const body = isRecord(input) ? input : {};
  const title = normalizeNullableText(body.title);
  if (!title) throw new MissionControlInputError("Task title is required");
  const projectId =
    typeof body.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : (await ensurePersonalProject(env, userId)).id;
  await ensureProjectExists(env, userId, projectId);
  const priority = normalizePriority(body.priority);
  const status = normalizeMissionTaskStatus(body.status) || "backlog";
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO mission_tasks
       (id, user_id, project_id, title, description, status, priority, due_at, scheduled_for, source_kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
  )
    .bind(
      id,
      userId,
      projectId,
      title,
      normalizeNullableText(body.description),
      status,
      priority,
      normalizeNullableText(body.dueAt),
      normalizeMissionDateKey(body.scheduledFor),
    )
    .run();

  return {
    task: serializeTask((await getMissionTask(env, userId, id)) as MissionTaskRow),
  };
}

export async function updateMissionTask(
  env: Env,
  userId: string,
  taskId: string,
  input: unknown,
) {
  const existing = await getMissionTask(env, userId, taskId);
  if (!existing) throw new MissionControlInputError("Task not found", 404);
  const body = isRecord(input) ? input : {};
  const projectId =
    typeof body.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : existing.project_id;
  if (projectId) await ensureProjectExists(env, userId, projectId);

  await env.DB.prepare(
    `UPDATE mission_tasks
     SET project_id = ?, title = ?, description = ?, status = ?, priority = ?,
         due_at = ?, scheduled_for = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      projectId,
      normalizeNullableText(body.title) || existing.title,
      body.description === undefined
        ? existing.description
        : normalizeNullableText(body.description),
      normalizeMissionTaskStatus(body.status) || existing.status,
      normalizePriority(body.priority, existing.priority),
      body.dueAt === undefined ? existing.due_at : normalizeNullableText(body.dueAt),
      body.scheduledFor === undefined
        ? existing.scheduled_for
        : normalizeMissionDateKey(body.scheduledFor),
      taskId,
      userId,
    )
    .run();

  return {
    task: serializeTask((await getMissionTask(env, userId, taskId)) as MissionTaskRow),
  };
}

export async function archiveMissionTask(env: Env, userId: string, taskId: string) {
  const result = await env.DB.prepare(
    `UPDATE mission_tasks
     SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(taskId, userId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    throw new MissionControlInputError("Task not found", 404);
  }
  return { ok: true };
}

export async function listMissionApprovals(
  env: Env,
  userId: string,
  statusInput?: unknown,
  limitInput = 50,
) {
  const status =
    statusInput === "approved" ||
    statusInput === "rejected" ||
    statusInput === "expired" ||
    statusInput === "cancelled" ||
    statusInput === "pending"
      ? statusInput
      : null;
  const limit = Math.max(1, Math.min(limitInput, 100));
  const rows = await env.DB.prepare(
    `SELECT id, user_id, plugin_id, action_id, title, summary, payload_json,
            risk_level, status, requested_by, resolved_by, requested_at, resolved_at, expires_at
     FROM mission_approvals
     WHERE user_id = ? AND (? IS NULL OR status = ?)
     ORDER BY requested_at DESC
     LIMIT ?`,
  )
    .bind(userId, status, status, limit)
    .all<MissionApprovalRow>();
  return (rows.results || []).map(serializeApproval);
}

export async function resolveMissionApproval(
  env: Env,
  userId: string,
  approvalId: string,
  input: unknown,
) {
  const body = isRecord(input) ? input : {};
  const decision =
    body.decision === "approved" || body.status === "approved"
      ? "approved"
      : body.decision === "rejected" || body.status === "rejected"
        ? "rejected"
        : body.decision === "cancelled" || body.status === "cancelled"
          ? "cancelled"
          : null;
  if (!decision) throw new MissionControlInputError("Decision is required");

  const result = await env.DB.prepare(
    `UPDATE mission_approvals
     SET status = ?, resolved_by = ?, resolved_at = datetime('now')
     WHERE id = ? AND user_id = ? AND status = 'pending'`,
  )
    .bind(decision, userId, approvalId, userId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    throw new MissionControlInputError("Pending approval not found", 404);
  }

  return { approval: (await listMissionApprovals(env, userId, decision, 1))[0] };
}

export async function listMissionAgentRuns(env: Env, userId: string, limitInput = 50) {
  const limit = Math.max(1, Math.min(limitInput, 100));
  const rows = await env.DB.prepare(
    `SELECT id, user_id, source, project_id, task_id, approval_id, title,
            prompt_summary, status, model, runner_id, started_at, finished_at,
            cost_json, result_json, artifact_manifest_json, created_at, updated_at
     FROM mission_agent_runs
     WHERE user_id = ?
     ORDER BY COALESCE(started_at, created_at) DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<MissionAgentRunRow>();
  return (rows.results || []).map(serializeAgentRun);
}

export async function listMissionPluginActivity(env: Env, userId: string, limitInput = 50) {
  const limit = Math.max(1, Math.min(limitInput, 100));
  const rows = await env.DB.prepare(
    `SELECT id, user_id, plugin_id, activity_type, title, summary, status,
            related_id, metadata_json, created_at
     FROM mission_plugin_activity
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<MissionPluginActivityRow>();
  return (rows.results || []).map(serializePluginActivity);
}

export async function listMissionMemory(env: Env, userId: string, limitInput = 50) {
  const limit = Math.max(1, Math.min(limitInput, 100));
  const rows = await env.DB.prepare(
    `SELECT id, user_id, memory_kind, scope_kind, scope_id, title, body, confidence,
            source_kind, source_ref, review_status, created_at, updated_at
     FROM mission_private_memory
     WHERE user_id = ? AND review_status != 'archived'
     ORDER BY updated_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<MissionMemoryRow>();
  return (rows.results || []).map(serializeMemory);
}

export async function createMissionMemory(env: Env, userId: string, input: unknown) {
  const body = isRecord(input) ? input : {};
  const text = normalizeNullableText(body.body);
  if (!text) throw new MissionControlInputError("Memory body is required");
  const kind = normalizeMemoryKind(body.memoryKind) || "owner_note";
  const scopeKind = normalizeScopeKind(body.scopeKind) || "owner";
  const sourceKind = normalizeMemorySourceKind(body.sourceKind) || "manual";
  const reviewStatus =
    sourceKind === "agent"
      ? "needs_review"
      : normalizeMemoryReviewStatus(body.reviewStatus) || "active";
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO mission_private_memory
       (id, user_id, memory_kind, scope_kind, scope_id, title, body, confidence,
        source_kind, source_ref, review_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      userId,
      kind,
      scopeKind,
      normalizeNullableText(body.scopeId),
      normalizeNullableText(body.title),
      text,
      normalizeConfidence(body.confidence),
      sourceKind,
      normalizeNullableText(body.sourceRef),
      reviewStatus,
    )
    .run();

  return { memory: serializeMemory((await getMissionMemory(env, userId, id)) as MissionMemoryRow) };
}

export async function suggestMissionMemory(env: Env, userId: string, input: unknown) {
  const body = isRecord(input) ? input : {};
  return createMissionMemory(env, userId, {
    ...body,
    sourceKind: "agent",
    reviewStatus: "needs_review",
  });
}

export async function updateMissionMemory(
  env: Env,
  userId: string,
  memoryId: string,
  input: unknown,
) {
  const body = isRecord(input) ? input : {};
  const existing = await getMissionMemory(env, userId, memoryId);
  if (!existing) throw new MissionControlInputError("Memory not found", 404);
  if (existing.review_status === "archived") {
    throw new MissionControlInputError("Memory not found", 404);
  }

  await env.DB.prepare(
    `UPDATE mission_private_memory
     SET title = ?, body = ?, review_status = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND review_status != 'archived'`,
  )
    .bind(
      body.title === undefined ? existing.title : normalizeNullableText(body.title),
      normalizeNullableText(body.body) || existing.body,
      normalizeMemoryReviewStatus(body.reviewStatus) || existing.review_status,
      memoryId,
      userId,
    )
    .run();

  return { memory: serializeMemory((await getMissionMemory(env, userId, memoryId)) as MissionMemoryRow) };
}

export async function approveMissionMemory(env: Env, userId: string, memoryId: string) {
  const existing = await getMissionMemory(env, userId, memoryId);
  if (!existing || existing.review_status === "archived") {
    throw new MissionControlInputError("Memory not found", 404);
  }

  const result = await env.DB.prepare(
    `UPDATE mission_private_memory
     SET review_status = 'active', updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND review_status != 'archived'`,
  )
    .bind(memoryId, userId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    throw new MissionControlInputError("Memory not found", 404);
  }

  return { memory: serializeMemory((await getMissionMemory(env, userId, memoryId)) as MissionMemoryRow) };
}

export async function deleteMissionMemory(env: Env, userId: string, memoryId: string) {
  const result = await env.DB.prepare(
    `UPDATE mission_private_memory
     SET review_status = 'archived', updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(memoryId, userId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    throw new MissionControlInputError("Memory not found", 404);
  }
  return { ok: true };
}

export async function listMissionContextSources(env: Env, userId: string, limitInput = 50) {
  const limit = Math.max(1, Math.min(limitInput, 100));
  await ensureBaselineContextSources(env, userId);
  const rows = await env.DB.prepare(
    `SELECT id, user_id, source_kind, label, description, visibility, status,
            source_ref, last_indexed_at, grants_json, metadata_json, created_at, updated_at
     FROM mission_context_sources
     WHERE user_id = ? AND status != 'archived'
     ORDER BY CASE source_kind WHEN 'public_me_json' THEN 0 WHEN 'private_memory' THEN 1 ELSE 2 END,
              label ASC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<MissionContextSourceRow>();
  return (rows.results || []).map(serializeContextSource);
}

export async function createMissionContextSource(env: Env, userId: string, input: unknown) {
  const body = isRecord(input) ? input : {};
  const label = normalizeNullableText(body.label);
  if (!label) throw new MissionControlInputError("Source label is required");
  const sourceKind = normalizeSourceKind(body.sourceKind) || "url";
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO mission_context_sources
       (id, user_id, source_kind, label, description, visibility, status, source_ref, grants_json, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', '{}')`,
  )
    .bind(
      id,
      userId,
      sourceKind,
      label,
      normalizeNullableText(body.description),
      body.visibility === "public" ? "public" : "private",
      body.status === "setup_required" ? "setup_required" : "active",
      normalizeNullableText(body.sourceRef),
    )
    .run();

  const source = await getMissionContextSource(env, userId, id);
  return { source: serializeContextSource(source as MissionContextSourceRow) };
}

export async function updateMissionContextSource(
  env: Env,
  userId: string,
  sourceId: string,
  input: unknown,
) {
  const existing = await getMissionContextSource(env, userId, sourceId);
  if (!existing) throw new MissionControlInputError("Context source not found", 404);
  const body = isRecord(input) ? input : {};
  const status = normalizeSourceStatus(body.status) || existing.status;

  await env.DB.prepare(
    `UPDATE mission_context_sources
     SET label = ?, description = ?, visibility = ?, status = ?, source_ref = ?,
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      normalizeNullableText(body.label) || existing.label,
      body.description === undefined
        ? existing.description
        : normalizeNullableText(body.description),
      body.visibility === "public" ? "public" : existing.visibility,
      status,
      body.sourceRef === undefined
        ? existing.source_ref
        : normalizeNullableText(body.sourceRef),
      sourceId,
      userId,
    )
    .run();

  const source = await getMissionContextSource(env, userId, sourceId);
  return { source: serializeContextSource(source as MissionContextSourceRow) };
}

export async function deleteMissionContextSource(env: Env, userId: string, sourceId: string) {
  const result = await env.DB.prepare(
    `UPDATE mission_context_sources
     SET status = 'archived', updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(sourceId, userId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    throw new MissionControlInputError("Context source not found", 404);
  }
  return { ok: true };
}

export async function getMissionSetup(env: Env, userId: string) {
  const [calendarEnabled, aiConfigured, memory, sources, daemon] = await Promise.all([
    isCorePluginEnabled(env, "me3.calendar"),
    hasConfiguredAiProvider(env, userId),
    listMissionMemory(env, userId, 1),
    listMissionContextSources(env, userId, 20),
    getMissionDaemonStatus(env, userId),
  ]);

  const items: MissionSetupItem[] = [
    {
      id: "calendar",
      label: "Calendar sync",
      status: calendarEnabled ? "ready" : "setup_required",
      detail: calendarEnabled
        ? "Reminder and event captures can sync to Calendar."
        : "Enable Calendar to sync reminder and event captures.",
      actionPath: calendarEnabled ? "/calendar" : "/account?section=plugins&blocked=me3.calendar",
    },
    {
      id: "ai-provider",
      label: "AI provider",
      status: aiConfigured ? "ready" : "setup_required",
      detail: aiConfigured
        ? "Assistant routes have an AI provider available."
        : "Configure an AI provider before deeper agent workflows.",
      actionPath: "/account?section=ai",
    },
    {
      id: "private-memory",
      label: "Private memory",
      status: memory.length > 0 ? "ready" : "optional",
      detail: memory.length > 0
        ? "Private memory is available for owner-approved context."
        : "Add only the private context you want Mission Control to remember.",
      actionPath: "/mission-control?section=memory",
    },
    {
      id: "context-sources",
      label: "Context sources",
      status: sources.length > 0 ? "ready" : "optional",
      detail: "Public profile, private memory, plugin tables, and local sources stay inventoried here.",
      actionPath: "/mission-control?section=sources",
    },
    {
      id: "daemon",
      label: "Local files and repos",
      status: daemon.connected ? "ready" : "optional",
      detail: daemon.connected
        ? "A local daemon bridge is paired."
        : "Optional. Pair a local daemon only when you want approved local file or repo access.",
      actionPath: "/mission-control?section=setup",
    },
  ];

  return {
    calendarEnabled,
    aiConfigured,
    memoryCount: memory.length,
    contextSourceCount: sources.length,
    daemonConnected: daemon.connected,
    items,
  };
}

export async function getMissionDaemonStatus(env: Env, userId: string) {
  const [pairings, allowlist, audit] = await Promise.all([
    env.DB.prepare(
      `SELECT id, runner_id, display_name, status, version, platform, last_seen_at,
              health_json, paired_at, created_at, updated_at
       FROM mission_daemon_pairings
       WHERE user_id = ? AND status != 'revoked'
       ORDER BY COALESCE(last_seen_at, created_at) DESC
       LIMIT 5`,
    )
      .bind(userId)
      .all<MissionDaemonPairingRow>(),
    env.DB.prepare(
      `SELECT a.id, a.pairing_id, a.label, a.path_hint, a.resource_kind,
              a.permission_tier, a.shell_policy_json, a.status, a.last_checked_at,
              a.created_at, a.updated_at
       FROM mission_daemon_allowlist_entries a
       JOIN mission_daemon_pairings p ON p.id = a.pairing_id
       WHERE p.user_id = ? AND a.status != 'revoked'
       ORDER BY a.created_at DESC
       LIMIT 20`,
    )
      .bind(userId)
      .all<MissionDaemonAllowlistRow>(),
    env.DB.prepare(
      `SELECT dae.id, dae.pairing_id, dae.allowlist_entry_id, dae.run_id,
              dae.approval_id, dae.event_type, dae.actor, dae.summary,
              dae.payload_json, dae.created_at
       FROM mission_daemon_audit_events dae
       LEFT JOIN mission_daemon_pairings p ON p.id = dae.pairing_id
       WHERE p.user_id = ? OR dae.pairing_id IS NULL
       ORDER BY dae.created_at DESC
       LIMIT 10`,
    )
      .bind(userId)
      .all<MissionDaemonAuditRow>(),
  ]);

  const serializedPairings = (pairings.results || []).map(serializeDaemonPairing);
  return {
    enabled: serializedPairings.length > 0,
    connected: serializedPairings.some((pairing) => pairing.status === "active"),
    pairings: serializedPairings,
    allowlist: (allowlist.results || []).map(serializeDaemonAllowlistEntry),
    audit: (audit.results || []).map(serializeDaemonAuditEvent),
  };
}

export async function startMissionDaemonPairing(env: Env, userId: string, input: unknown) {
  const body = isRecord(input) ? input : {};
  const runnerId = normalizeNullableText(body.runnerId) || `runner-${crypto.randomUUID()}`;
  const displayName = normalizeNullableText(body.displayName) || "Local daemon";
  const pairingId = crypto.randomUUID();
  const code = crypto.randomUUID().slice(0, 8).toUpperCase();
  const tokenHash = await sha256Text(`pending:${code}`);

  await env.DB.prepare(
    `INSERT INTO mission_daemon_pairings
       (id, user_id, runner_id, display_name, token_hash, status, health_json)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
  )
    .bind(
      pairingId,
      userId,
      runnerId,
      displayName,
      tokenHash,
      JSON.stringify({ pairingCodeExpiresInMinutes: 10 }),
    )
    .run();
  await appendMissionDaemonAudit(env, {
    pairingId,
    eventType: "pair_requested",
    actor: "owner",
    summary: `Pairing started for ${displayName}`,
  });

  return {
    ok: true,
    pairing: {
      id: pairingId,
      runnerId,
      displayName,
      status: "pending",
    },
    code,
    installCommand: `me3-daemon pair --core <core-url> --code ${code}`,
  };
}

export async function listMissionDaemonAudit(env: Env, userId: string) {
  const daemon = await getMissionDaemonStatus(env, userId);
  return { audit: daemon.audit };
}

async function getMissionCapture(env: Env, userId: string, captureId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, day_id, type, text, project_id, status, task_id,
            calendar_event_id, reminder_id, due_at, event_start_at, event_end_at,
            timezone, sync_status, sync_error, source, source_ref, created_at, updated_at
     FROM mission_capture_items
     WHERE id = ? AND user_id = ?`,
  )
    .bind(captureId, userId)
    .first<MissionCaptureRow>();
}

async function getMissionProject(env: Env, userId: string, projectId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, name, slug, description, status, color, icon, source_kind,
            source_ref, metadata_json, created_at, updated_at
     FROM mission_projects
     WHERE id = ? AND user_id = ?`,
  )
    .bind(projectId, userId)
    .first<MissionProjectRow>();
}

async function getMissionTask(env: Env, userId: string, taskId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, project_id, title, description, status, priority,
            due_at, scheduled_for, source_kind, source_ref, approval_id,
            metadata_json, created_at, updated_at, archived_at
     FROM mission_tasks
     WHERE id = ? AND user_id = ?`,
  )
    .bind(taskId, userId)
    .first<MissionTaskRow>();
}

async function getMissionMemory(env: Env, userId: string, memoryId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, memory_kind, scope_kind, scope_id, title, body, confidence,
            source_kind, source_ref, review_status, created_at, updated_at
     FROM mission_private_memory
     WHERE id = ? AND user_id = ?`,
  )
    .bind(memoryId, userId)
    .first<MissionMemoryRow>();
}

async function getMissionContextSource(env: Env, userId: string, sourceId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, source_kind, label, description, visibility, status,
            source_ref, last_indexed_at, grants_json, metadata_json, created_at, updated_at
     FROM mission_context_sources
     WHERE id = ? AND user_id = ?`,
  )
    .bind(sourceId, userId)
    .first<MissionContextSourceRow>();
}

async function getOrCreateMissionDay(env: Env, userId: string, date: string) {
  await ensurePersonalProject(env, userId);
  const existing = await env.DB.prepare(
    `SELECT id, user_id, date, title, journal_text, created_at, updated_at
     FROM mission_daily_notes
     WHERE user_id = ? AND date = ?`,
  )
    .bind(userId, date)
    .first<MissionDailyNoteRow>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO mission_daily_notes (id, user_id, date, title, journal_text)
     VALUES (?, ?, ?, ?, '')`,
  )
    .bind(id, userId, date, dailyTitle(date))
    .run();

  return (await env.DB.prepare(
    `SELECT id, user_id, date, title, journal_text, created_at, updated_at
     FROM mission_daily_notes
     WHERE id = ?`,
  )
    .bind(id)
    .first<MissionDailyNoteRow>()) as MissionDailyNoteRow;
}

async function ensurePersonalProject(env: Env, userId: string) {
  const existing = await env.DB.prepare(
    `SELECT id, user_id, name, slug, description, status, color, icon, source_kind,
            source_ref, metadata_json, created_at, updated_at
     FROM mission_projects
     WHERE user_id = ? AND slug = 'personal'`,
  )
    .bind(userId)
    .first<MissionProjectRow>();
  if (existing) return existing;

  await env.DB.prepare(
    `INSERT INTO mission_projects
       (id, user_id, name, slug, description, color, icon, source_kind)
     VALUES (?, ?, 'Personal', 'personal', 'Default Mission Control project.', 'teal', 'sparkles', 'manual')
     ON CONFLICT(user_id, slug) DO NOTHING`,
  )
    .bind(userId === "owner" ? PERSONAL_PROJECT_ID : crypto.randomUUID(), userId)
    .run();

  return (await env.DB.prepare(
    `SELECT id, user_id, name, slug, description, status, color, icon, source_kind,
            source_ref, metadata_json, created_at, updated_at
     FROM mission_projects
     WHERE user_id = ? AND slug = 'personal'`,
  )
    .bind(userId)
    .first<MissionProjectRow>()) as MissionProjectRow;
}

async function ensureProjectExists(env: Env, userId: string, projectId: string) {
  const project = await getMissionProject(env, userId, projectId);
  if (!project) throw new MissionControlInputError("Project not found", 404);
}

async function ensureBaselineContextSources(env: Env, userId: string) {
  const baselines = [
    {
      id: `mission-source-public-profile-${userId}`,
      kind: "public_me_json",
      label: "Public me.json",
      description: "Core-owned public profile fields available to the workspace.",
      visibility: "public",
      status: "active",
    },
    {
      id: `mission-source-private-memory-${userId}`,
      kind: "private_memory",
      label: "Private memory",
      description: "Owner-approved private Mission Control memories.",
      visibility: "private",
      status: "active",
    },
  ] as const;

  for (const source of baselines) {
    await env.DB.prepare(
      `INSERT INTO mission_context_sources
         (id, user_id, source_kind, label, description, visibility, status, grants_json, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '{}')
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        source.id,
        userId,
        source.kind,
        source.label,
        source.description,
        source.visibility,
        source.status,
      )
      .run();
  }
}

async function getOwnerTimezone(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT timezone FROM owner_profile WHERE id = ?")
    .bind(userId)
    .first<OwnerTimezoneRow>();
  return normalizeTimeZone(row?.timezone) || DEFAULT_OWNER_TIMEZONE;
}

async function appendMissionPluginActivity(
  env: Env,
  userId: string,
  input: {
    pluginId: string;
    activityType: string;
    title: string;
    summary?: string | null;
    status?: string | null;
    relatedId?: string | null;
  },
) {
  await env.DB.prepare(
    `INSERT INTO mission_plugin_activity
       (id, user_id, plugin_id, activity_type, title, summary, status, related_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      input.pluginId,
      input.activityType,
      input.title,
      input.summary || null,
      input.status || null,
      input.relatedId || null,
    )
    .run();
}

async function appendMissionDaemonAudit(
  env: Env,
  input: {
    pairingId?: string | null;
    allowlistEntryId?: string | null;
    runId?: string | null;
    approvalId?: string | null;
    eventType: string;
    actor: string;
    summary: string;
    payload?: Record<string, unknown>;
  },
) {
  await env.DB.prepare(
    `INSERT INTO mission_daemon_audit_events
       (id, pairing_id, allowlist_entry_id, run_id, approval_id, event_type, actor, summary, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.pairingId || null,
      input.allowlistEntryId || null,
      input.runId || null,
      input.approvalId || null,
      input.eventType,
      input.actor,
      input.summary,
      JSON.stringify(input.payload || {}),
    )
    .run();
}

function serializeProject(row: MissionProjectRow) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    color: row.color,
    icon: row.icon,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeTask(row: MissionTaskRow) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    scheduledFor: row.scheduled_for,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    approvalId: row.approval_id,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function serializeDay(row: MissionDailyNoteRow) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    title: row.title,
    journalText: row.journal_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeJournalEntry(row: MissionDailyNoteRow) {
  const text = row.journal_text || "";
  return {
    id: row.id,
    date: row.date,
    preview: journalPreview(text),
    journalText: text,
  };
}

function serializeCapture(row: MissionCaptureRow) {
  return {
    id: row.id,
    userId: row.user_id,
    dayId: row.day_id,
    type: row.type,
    text: row.text,
    projectId: row.project_id,
    status: row.status,
    taskId: row.task_id,
    calendarEventId: row.calendar_event_id,
    reminderId: row.reminder_id,
    dueAt: row.due_at,
    eventStartAt: row.event_start_at,
    eventEndAt: row.event_end_at,
    timezone: row.timezone,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    source: row.source,
    sourceRef: row.source_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeApproval(row: MissionApprovalRow) {
  return {
    id: row.id,
    userId: row.user_id,
    pluginId: row.plugin_id,
    actionId: row.action_id,
    title: row.title,
    summary: row.summary,
    payload: parseJsonRecord(row.payload_json),
    riskLevel: row.risk_level,
    status: row.status,
    requestedBy: row.requested_by,
    resolvedBy: row.resolved_by,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
    expiresAt: row.expires_at,
  };
}

function serializeAgentRun(row: MissionAgentRunRow) {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    projectId: row.project_id,
    taskId: row.task_id,
    approvalId: row.approval_id,
    title: row.title,
    promptSummary: row.prompt_summary,
    status: row.status,
    model: row.model,
    runnerId: row.runner_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    cost: parseJsonRecord(row.cost_json),
    result: parseJsonRecord(row.result_json),
    artifacts: parseJsonArray(row.artifact_manifest_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePluginActivity(row: MissionPluginActivityRow) {
  return {
    id: row.id,
    userId: row.user_id,
    pluginId: row.plugin_id,
    activityType: row.activity_type,
    title: row.title,
    summary: row.summary,
    status: row.status,
    relatedId: row.related_id,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at,
  };
}

function serializeMemory(row: MissionMemoryRow) {
  return {
    id: row.id,
    userId: row.user_id,
    memoryKind: row.memory_kind,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    title: row.title,
    body: row.body,
    confidence: row.confidence,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeContextSource(row: MissionContextSourceRow) {
  return {
    id: row.id,
    userId: row.user_id,
    sourceKind: row.source_kind,
    label: row.label,
    description: row.description,
    visibility: row.visibility,
    status: row.status,
    sourceRef: row.source_ref,
    lastIndexedAt: row.last_indexed_at,
    grants: parseJsonArray(row.grants_json),
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeDaemonPairing(row: MissionDaemonPairingRow) {
  return {
    id: row.id,
    runnerId: row.runner_id,
    displayName: row.display_name,
    status: row.status,
    version: row.version,
    platform: row.platform,
    lastSeenAt: row.last_seen_at,
    health: parseJsonRecord(row.health_json),
    pairedAt: row.paired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeDaemonAllowlistEntry(row: MissionDaemonAllowlistRow) {
  return {
    id: row.id,
    pairingId: row.pairing_id,
    label: row.label,
    pathHint: row.path_hint,
    resourceKind: row.resource_kind,
    permissionTier: row.permission_tier,
    shellPolicy: parseJsonRecord(row.shell_policy_json),
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeDaemonAuditEvent(row: MissionDaemonAuditRow) {
  return {
    id: row.id,
    pairingId: row.pairing_id,
    allowlistEntryId: row.allowlist_entry_id,
    runId: row.run_id,
    approvalId: row.approval_id,
    eventType: row.event_type,
    actor: row.actor,
    summary: row.summary,
    payload: parseJsonRecord(row.payload_json),
    createdAt: row.created_at,
  };
}

function parseTemporalHint(text: string, selectedDate: string, timezone: string): TemporalHint | null {
  const date = resolveMentionedDate(text, selectedDate);
  const time = resolveMentionedTime(text);
  if (!time && !date.explicit) return null;
  return buildTemporalHint(date.value, time || { hour: 9, minute: 0 }, timezone);
}

function parseManualTemporalHint(
  dateInput: unknown,
  timeInput: unknown,
  timezone: string,
): TemporalHint | null {
  const date = normalizeMissionDateKey(dateInput);
  const time = normalizeClockInput(timeInput);
  if (!date || !time) return null;
  return buildTemporalHint(date, time, timezone);
}

function buildTemporalHint(
  date: string,
  time: { hour: number; minute: number },
  timezone: string,
): TemporalHint {
  const [year, month, day] = date.split("-").map(Number);
  const startsAt = new Date(
    getUtcMsForLocalTime(
      {
        year,
        month,
        day,
        hour: time.hour,
        minute: time.minute,
      },
      timezone,
    ),
  ).toISOString();
  const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
  return { startsAt, endsAt, timezone };
}

function resolveMentionedDate(text: string, selectedDate: string): { value: string; explicit: boolean } {
  const normalized = text.toLowerCase();
  if (normalized.includes("tomorrow")) return { value: addDays(selectedDate, 1), explicit: true };
  if (normalized.includes("today")) return { value: selectedDate, explicit: true };
  const isoDate = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDate?.[1] && normalizeMissionDateKey(isoDate[1])) {
    return { value: isoDate[1], explicit: true };
  }
  const monthDate = normalized.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/,
  );
  if (monthDate) {
    const month = monthIndex(monthDate[1]);
    const day = Number(monthDate[2]);
    if (month !== null && day >= 1 && day <= 31) {
      const year = Number(selectedDate.slice(0, 4));
      const candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { value: normalizeMissionDateKey(candidate) || selectedDate, explicit: true };
    }
  }
  return { value: selectedDate, explicit: false };
}

function resolveMentionedTime(text: string): { hour: number; minute: number } | null {
  const timeMatch =
    text.match(/\b(?:at|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
    text.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)\b/i) ||
    text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (!timeMatch) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  const meridiem = timeMatch[3]?.toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return { hour, minute };
}

function normalizeClockInput(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function cleanupReminderTitle(text: string): string {
  return text.replace(/^remind\s+me\s+(to|that|about)?\s*/i, "").trim() || text;
}

function requireDateKey(value: unknown): string {
  const date = normalizeMissionDateKey(value);
  if (!date) throw new MissionControlInputError("Date must be in YYYY-MM-DD format");
  return date;
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePriority(value: unknown, fallback = 3): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

function normalizeListLimit(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.round(parsed)));
}

function journalPreview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function normalizeConfidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeMemoryKind(value: unknown): MissionMemoryRow["memory_kind"] | null {
  if (
    value === "owner_note" ||
    value === "project_context" ||
    value === "preference" ||
    value === "relationship_note" ||
    value === "correction" ||
    value === "learning"
  ) {
    return value;
  }
  return null;
}

function normalizeScopeKind(value: unknown): MissionMemoryRow["scope_kind"] | null {
  if (value === "owner" || value === "project" || value === "contact" || value === "plugin") {
    return value;
  }
  return null;
}

function normalizeMemoryReviewStatus(value: unknown): MissionMemoryRow["review_status"] | null {
  if (value === "active" || value === "needs_review" || value === "archived") return value;
  return null;
}

function normalizeMemorySourceKind(value: unknown): MissionMemoryRow["source_kind"] | null {
  if (value === "manual" || value === "agent" || value === "import" || value === "daemon") {
    return value;
  }
  return null;
}

function normalizeSourceKind(value: unknown): MissionContextSourceRow["source_kind"] | null {
  if (
    value === "public_me_json" ||
    value === "private_memory" ||
    value === "core_table" ||
    value === "plugin_table" ||
    value === "daemon_directory" ||
    value === "daemon_repo" ||
    value === "provider" ||
    value === "upload" ||
    value === "url"
  ) {
    return value;
  }
  return null;
}

function normalizeSourceStatus(value: unknown): MissionContextSourceRow["status"] | null {
  if (
    value === "active" ||
    value === "setup_required" ||
    value === "paused" ||
    value === "failed" ||
    value === "archived"
  ) {
    return value;
  }
  return null;
}

function parseJsonRecord(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dailyTitle(date: string): string {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(parsed);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

function monthIndex(value: string): number | null {
  const normalized = value.toLowerCase().slice(0, 3);
  const index = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(normalized);
  return index >= 0 ? index : null;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
