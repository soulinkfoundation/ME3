export type AgentMissionProject = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
};

export type AgentMissionTask = {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectName: string;
  dueAt: string | null;
  status: string;
  priority: number;
  sourceRef?: string | null;
};

type MissionTaskRow = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  status: string;
  priority: number;
  due_at: string | null;
  scheduled_for: string | null;
  source_ref: string | null;
  project_name: string | null;
};

type MissionTaskDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
};

type MissionTaskEnv = { DB: MissionTaskDb };

export type CreateAgentMissionTaskInput = {
  title: string;
  description?: string | null;
  projectId?: string | null;
  dueAt?: string | null;
  priority?: number | null;
  idempotencyKey?: string | null;
};

export type UpdateAgentMissionTaskInput = {
  taskId: string;
  title?: string;
  description?: string | null;
  projectId?: string;
  status?: string;
  dueAt?: string | null;
  priority?: number;
};

export type AgentMissionTaskError = {
  error: string;
  status?: 400 | 404;
};

const TASK_STATUSES = new Set(["backlog", "in_progress", "review", "done"]);

export async function listAgentMissionProjects(
  env: MissionTaskEnv,
  userId: string,
): Promise<AgentMissionProject[]> {
  const rows = await env.DB.prepare(
    `SELECT id, name, slug, description, status
     FROM mission_projects
     WHERE user_id = ? AND status != 'archived'
     ORDER BY CASE WHEN slug = 'personal' THEN 0 ELSE 1 END, name ASC`,
  )
    .bind(userId)
    .all<AgentMissionProject>();
  return rows.results || [];
}

export async function listAgentMissionTasks(
  env: MissionTaskEnv,
  userId: string,
): Promise<AgentMissionTask[]> {
  const rows = await env.DB.prepare(
    `SELECT t.id, t.title, t.description, t.project_id, t.status, t.priority, t.due_at,
            t.scheduled_for, t.source_ref, p.name AS project_name
     FROM mission_tasks t
     LEFT JOIN mission_projects p
       ON p.id = t.project_id AND p.user_id = t.user_id
     WHERE t.user_id = ? AND t.archived_at IS NULL
     ORDER BY t.updated_at DESC, t.id ASC
     LIMIT 100`,
  )
    .bind(userId)
    .all<MissionTaskRow>();
  return (rows.results || []).flatMap(serializeMissionTaskRow);
}

export async function getAgentMissionTask(
  env: MissionTaskEnv,
  userId: string,
  taskId: string,
): Promise<AgentMissionTask | null> {
  const row = await env.DB.prepare(
    `SELECT t.id, t.title, t.description, t.project_id, t.status, t.priority, t.due_at,
            t.scheduled_for, t.source_ref, p.name AS project_name
     FROM mission_tasks t
     LEFT JOIN mission_projects p
       ON p.id = t.project_id AND p.user_id = t.user_id
     WHERE t.id = ? AND t.user_id = ? AND t.archived_at IS NULL
     LIMIT 1`,
  )
    .bind(taskId, userId)
    .first<MissionTaskRow>();
  return row ? serializeMissionTaskRow(row)[0] || null : null;
}

export async function createAgentMissionTask(
  env: MissionTaskEnv,
  userId: string,
  input: CreateAgentMissionTaskInput,
): Promise<AgentMissionTask | AgentMissionTaskError> {
  const title = requiredText(input.title);
  if (!title) return { error: "Task title is required.", status: 400 };
  const dueAt = normalizeDueDate(input.dueAt);
  if (dueAt === undefined) return { error: "Task dueAt must be a valid YYYY-MM-DD date.", status: 400 };
  const priority = normalizePriority(input.priority);
  if (priority === undefined) return { error: "Task priority must be between 1 and 5.", status: 400 };

  const projects = await listAgentMissionProjects(env, userId);
  const project = resolveCreateProject(projects, input.projectId);
  if ("error" in project) return project;

  const idempotencyKey = optionalText(input.idempotencyKey);
  if (idempotencyKey) {
    const existing = await getAgentMissionTaskBySourceRef(env, userId, idempotencyKey);
    if (existing) return existing;
  }

  const id = crypto.randomUUID();
  const status = "backlog";
  const columnId = `${project.id}:${status}`;
  await ensureMissionTaskColumn(env, userId, project.id, status);
  await env.DB.prepare(
    `INSERT ${idempotencyKey ? "OR IGNORE " : ""}INTO mission_tasks
       (id, user_id, project_id, column_id, title, description, status,
        priority, due_at, source_kind, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, 'backlog', ?, ?, 'agent', ?)`,
  )
    .bind(
      id,
      userId,
      project.id,
      columnId,
      title,
      optionalText(input.description),
      priority,
      dueAt,
      idempotencyKey,
    )
    .run();

  if (idempotencyKey) {
    const stored = await getAgentMissionTaskBySourceRef(env, userId, idempotencyKey);
    if (!stored) return { error: "Mission task could not be recorded." };
    return stored;
  }

  return {
    id,
    title,
    description: optionalText(input.description),
    projectId: project.id,
    projectName: project.name,
    dueAt,
    status,
    priority,
    sourceRef: null,
  };
}

export async function updateAgentMissionTask(
  env: MissionTaskEnv,
  userId: string,
  input: UpdateAgentMissionTaskInput,
): Promise<AgentMissionTask | AgentMissionTaskError> {
  const taskId = requiredText(input.taskId);
  if (!taskId) return { error: "Task taskId is required.", status: 400 };
  const existing = await getAgentMissionTask(env, userId, taskId);
  if (!existing) return { error: "Mission task not found.", status: 404 };

  const projects = await listAgentMissionProjects(env, userId);
  const project = input.projectId
    ? projects.find((candidate) => candidate.id === input.projectId)
    : projects.find((candidate) => candidate.id === existing.projectId);
  if (!project) return { error: "Mission Control project not found.", status: 404 };

  const title = input.title === undefined ? existing.title : requiredText(input.title);
  if (!title) return { error: "Task title cannot be empty.", status: 400 };
  const status = input.status || existing.status;
  if (!TASK_STATUSES.has(status)) return { error: "Invalid Mission task status.", status: 400 };
  const dueAt = input.dueAt === undefined ? existing.dueAt : normalizeDueDate(input.dueAt);
  if (dueAt === undefined) return { error: "Task dueAt must be a valid YYYY-MM-DD date.", status: 400 };
  const description = input.description === undefined
    ? existing.description
    : optionalText(input.description);
  const priority = input.priority === undefined
    ? existing.priority
    : normalizePriority(input.priority);
  if (priority === undefined) return { error: "Task priority must be between 1 and 5.", status: 400 };

  await ensureMissionTaskColumn(env, userId, project.id, status);
  const result = await env.DB.prepare(
    `UPDATE mission_tasks
     SET project_id = ?, column_id = ?, title = ?, description = ?, status = ?,
         priority = ?, due_at = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND archived_at IS NULL`,
  )
    .bind(
      project.id,
      `${project.id}:${status}`,
      title,
      description,
      status,
      priority,
      dueAt,
      taskId,
      userId,
    )
    .run();
  if ((result.meta?.changes || 0) === 0) {
    return { error: "Mission task not found.", status: 404 };
  }

  return {
    ...existing,
    title,
    description,
    projectId: project.id,
    projectName: project.name,
    dueAt,
    status,
    priority,
  };
}

export async function archiveAgentMissionTask(
  env: MissionTaskEnv,
  userId: string,
  taskIdInput: string,
): Promise<AgentMissionTask | AgentMissionTaskError> {
  const taskId = requiredText(taskIdInput);
  if (!taskId) return { error: "Task taskId is required.", status: 400 };
  const task = await getAgentMissionTask(env, userId, taskId);
  if (!task) return { error: "Mission task not found.", status: 404 };

  const result = await env.DB.prepare(
    `UPDATE mission_tasks
     SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND archived_at IS NULL`,
  )
    .bind(taskId, userId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    return { error: "Mission task not found.", status: 404 };
  }
  return task;
}

async function getAgentMissionTaskBySourceRef(
  env: MissionTaskEnv,
  userId: string,
  sourceRef: string,
): Promise<AgentMissionTask | null> {
  const row = await env.DB.prepare(
    `SELECT t.id, t.title, t.description, t.project_id, t.status, t.priority, t.due_at,
            t.scheduled_for, t.source_ref, p.name AS project_name
     FROM mission_tasks t
     LEFT JOIN mission_projects p
       ON p.id = t.project_id AND p.user_id = t.user_id
     WHERE t.user_id = ? AND t.source_ref = ? AND t.archived_at IS NULL
     LIMIT 1`,
  )
    .bind(userId, sourceRef)
    .first<MissionTaskRow>();
  return row ? serializeMissionTaskRow(row)[0] || null : null;
}

async function ensureMissionTaskColumn(
  env: MissionTaskEnv,
  userId: string,
  projectId: string,
  status: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO mission_project_columns
       (id, user_id, project_id, name, status, position)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `${projectId}:${status}`,
      userId,
      projectId,
      statusLabel(status),
      status,
      statusPosition(status),
    )
    .run();
}

function resolveCreateProject(
  projects: AgentMissionProject[],
  projectIdInput: string | null | undefined,
): AgentMissionProject | AgentMissionTaskError {
  const projectId = optionalText(projectIdInput);
  if (projectId) {
    return projects.find((project) => project.id === projectId) || {
      error: "Mission Control project not found. List tasks and use a stable project ID.",
      status: 404,
    };
  }
  const fallback = projects.find((project) => project.slug === "personal") ||
    (projects.length === 1 ? projects[0] : null);
  return fallback || {
    error: "A stable projectId is required because no unambiguous default project exists.",
    status: 400,
  };
}

function serializeMissionTaskRow(row: MissionTaskRow): AgentMissionTask[] {
  if (!row.project_id) return [];
  return [{
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    projectName: row.project_name || "Mission Control",
    dueAt: row.due_at || row.scheduled_for || null,
    status: row.status,
    priority: row.priority,
    sourceRef: row.source_ref,
  }];
}

function normalizePriority(value: unknown): number | undefined {
  if (value == null) return 3;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return undefined;
  return parsed;
}

function normalizeDueDate(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return undefined;
  }
  const date = value.trim();
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

function requiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statusLabel(status: string): string {
  if (status === "in_progress") return "Doing";
  if (status === "review") return "Review";
  if (status === "done") return "Done";
  return "Backlog";
}

function statusPosition(status: string): number {
  if (status === "in_progress") return 1;
  if (status === "review") return 2;
  if (status === "done") return 3;
  return 0;
}
