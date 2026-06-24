import { resolveUiIconName, type UiIconName } from "../../utils/icons";

export type MissionProject = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  description: string | null;
  color: string | null;
  icon: string | null;
  sourceKind: "manual" | "daemon_repo" | "beads" | "import";
  sourceRef: string | null;
  metadata: Record<string, unknown>;
  columns?: MissionProjectColumn[];
};

export type MissionProjectColumn = {
  id: string;
  projectId: string;
  name: string;
  status: ProjectBoardStatus;
  position: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MissionTask = {
  id: string;
  title: string;
  description: string | null;
  status: "backlog" | "in_progress" | "review" | "done" | "cancelled";
  columnId: string | null;
  projectId: string | null;
  dueAt: string | null;
  scheduledFor: string | null;
  sourceKind: "manual" | "capture" | "agent" | "beads" | "daemon";
  sourceRef: string | null;
  priority: number;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  metadata: Record<string, unknown>;
};

export type WeeklyReviewTaskItem = {
  id: string;
  title: string;
  projectId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  status: string | null;
};

export type WeeklyReviewTaskCleanupAction = "archive" | "done";

export type WeeklyReviewMemorySuggestion = {
  id: string;
  title: string;
  body: string;
  memoryKind: string;
  duplicate: boolean;
  pattern: boolean;
  note: string;
  checked: boolean;
};

export type WeeklyReviewReminderItem = {
  id: string;
  title: string;
  remindAt: string | null;
  status: string | null;
};

export type WeeklyReviewView = {
  reviewDate: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  summary: string;
  openTasks: WeeklyReviewTaskItem[];
  completedTasks: WeeklyReviewTaskItem[];
  reminders: WeeklyReviewReminderItem[];
  memorySuggestions: WeeklyReviewMemorySuggestion[];
  submittedAt: string | null;
};

export type MissionRun = {
  id: string;
  title: string;
  projectId: string | null;
  taskId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  model: string | null;
  runnerId: string | null;
  promptSummary: string | null;
  result: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type LocalExecutorStatusResponse = {
  setup: {
    ready: boolean;
    paired: boolean;
    hasProjectPolicy: boolean;
    nextAction: string;
  };
  pairings: Array<{
    displayName: string;
    status: string;
    lastSeenAt: string | null;
  }>;
};

export type ProjectBoardStatus = Exclude<MissionTask["status"], "cancelled">;

export type ProjectBoardColumn = {
  id: string;
  columnId: string;
  status: ProjectBoardStatus;
  label: string;
  tasks: MissionTask[];
};

export type ProjectTaskDetailDraft = {
  title: string;
  description: string;
  status: ProjectBoardStatus;
  projectId: string;
  scheduledFor: string;
};

export type ProjectTaskListGroup = {
  id: string;
  label: string;
  project: MissionProject | null;
  tasks: MissionTask[];
};

export const projectBoardStatuses: Array<{
  id: ProjectBoardStatus;
  columnId: string;
  label: string;
}> = [
  { id: "backlog", columnId: "", label: "Backlog" },
  { id: "in_progress", columnId: "", label: "Doing" },
  { id: "review", columnId: "", label: "Review" },
  { id: "done", columnId: "", label: "Done" },
];

export const activeProjectTaskStatuses: ProjectBoardStatus[] = [
  "backlog",
  "in_progress",
  "review",
];

export const PROJECT_TASK_PAGE_SIZE = 50;

function projectIconValue(project: MissionProject | null | undefined): string {
  return textValue(project?.icon);
}

export function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function nullableTextValue(value: unknown): string | null {
  const text = textValue(value);
  return text || null;
}

export function boolValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function projectIconSource(
  project: MissionProject | null | undefined,
): string {
  return projectIconValue(project);
}

export function isProjectIconLogo(
  project: MissionProject | null | undefined,
): boolean {
  const icon = projectIconValue(project);
  return (
    icon.startsWith("data:image/") ||
    icon.startsWith("http://") ||
    icon.startsWith("https://") ||
    icon.startsWith("/") ||
    icon.startsWith("blob:")
  );
}

export function projectUiIconName(
  project: MissionProject | null | undefined,
): UiIconName | null {
  if (isProjectIconLogo(project)) return null;
  const resolved = resolveUiIconName(projectIconValue(project));
  return resolved as UiIconName | null;
}

export function projectEmojiIcon(
  project: MissionProject | null | undefined,
): string {
  const icon = projectIconValue(project);
  if (!icon || isProjectIconLogo(project) || projectUiIconName(project)) {
    return "";
  }
  return /\p{Extended_Pictographic}/u.test(icon) ? icon : "";
}

export function weeklyReviewTaskItem(
  value: unknown,
): WeeklyReviewTaskItem | null {
  const record = recordValue(value);
  if (!record) return null;
  const id = textValue(record.id);
  const title = textValue(record.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    projectId: nullableTextValue(record.projectId),
    dueAt: nullableTextValue(record.dueAt),
    completedAt: nullableTextValue(record.completedAt),
    status: nullableTextValue(record.status),
  };
}

export function weeklyReviewMemorySuggestion(
  value: unknown,
  index: number,
): WeeklyReviewMemorySuggestion | null {
  const record = recordValue(value);
  if (!record) return null;
  const title = textValue(record.title);
  const body = textValue(record.body);
  if (!title || !body) return null;
  return {
    id: textValue(record.id) || `suggestion-${index}`,
    title,
    body,
    memoryKind: textValue(record.memoryKind) || "preference",
    duplicate: boolValue(record.duplicate),
    pattern: boolValue(record.pattern),
    note: textValue(record.note),
    checked: boolValue(record.checked, true),
  };
}

export function weeklyReviewReminderItem(
  value: unknown,
): WeeklyReviewReminderItem | null {
  const record = recordValue(value);
  if (!record) return null;
  const id = textValue(record.id);
  const title = textValue(record.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    remindAt: nullableTextValue(record.remindAt),
    status: nullableTextValue(record.status),
  };
}

export function weeklyReviewMetadata(
  task: MissionTask | null | undefined,
): WeeklyReviewView | null {
  const metadata = recordValue(task?.metadata);
  const review = recordValue(metadata?.weeklyReview);
  if (!metadata || !review || metadata.kind !== "weekly_review") return null;
  const weekStart = textValue(review.weekStart);
  const weekEnd = textValue(review.weekEnd);
  const reviewDate = textValue(review.reviewDate) || weekEnd || weekStart;
  const weekLabel =
    textValue(review.weekLabel) ||
    [weekStart, weekEnd].filter(Boolean).join(" to ") ||
    "Weekly Review";
  const openTasks = Array.isArray(review.openTasks)
    ? review.openTasks
        .map((item) => weeklyReviewTaskItem(item))
        .filter((item): item is WeeklyReviewTaskItem => Boolean(item))
    : [];
  const completedTasks = Array.isArray(review.completedTasks)
    ? review.completedTasks
        .map((item) => weeklyReviewTaskItem(item))
        .filter((item): item is WeeklyReviewTaskItem => Boolean(item))
    : [];
  const reminders = Array.isArray(review.reminders)
    ? review.reminders
        .map((item) => weeklyReviewReminderItem(item))
        .filter((item): item is WeeklyReviewReminderItem => Boolean(item))
    : [];
  const memorySuggestions = Array.isArray(review.memorySuggestions)
    ? review.memorySuggestions
        .map((item, index) => weeklyReviewMemorySuggestion(item, index))
        .filter(
          (item): item is WeeklyReviewMemorySuggestion => Boolean(item),
        )
    : [];

  return {
    reviewDate,
    weekStart,
    weekEnd,
    weekLabel,
    summary:
      textValue(review.journalSummary) ||
      `Review ${weekLabel.toLowerCase()}.`,
    openTasks,
    completedTasks,
    reminders,
    memorySuggestions,
    submittedAt: nullableTextValue(review.submittedAt),
  };
}

export function weeklyReviewCardLabel(task: MissionTask): string {
  const review = weeklyReviewMetadata(task);
  if (!review) return "";
  const parts = [
    `${review.openTasks.length} open`,
    `${review.completedTasks.length} done`,
  ];
  if (review.memorySuggestions.length)
    parts.push(`${review.memorySuggestions.length} memories`);
  return parts.join(" / ");
}

export function formatWeeklyReviewRange(review: WeeklyReviewView): string {
  if (!review.weekStart || !review.weekEnd) return review.weekLabel;
  const start = new Date(`${review.weekStart}T12:00:00Z`);
  const end = new Date(`${review.weekEnd}T12:00:00Z`);
  const sameYear =
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start.getUTCFullYear() === end.getUTCFullYear();
  return `${formatWeekdayDate(review.weekStart, !sameYear)} - ${formatWeekdayDate(review.weekEnd, true)}`;
}

export function appendUniqueTasks(
  current: MissionTask[],
  next: MissionTask[],
): MissionTask[] {
  const seen = new Set(current.map((task) => task.id));
  return [
    ...current,
    ...next.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    }),
  ];
}

export function missionTasksUrl(options: {
  active?: boolean;
  archived?: boolean;
  status?: MissionTask["status"];
  projectId?: string;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams({
    limit: String(PROJECT_TASK_PAGE_SIZE),
  });
  if (options.active) params.set("active", "1");
  if (options.archived) params.set("archived", "1");
  if (options.status) params.set("status", options.status);
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.cursor) params.set("cursor", options.cursor);
  return `/mission-control/tasks?${params.toString()}`;
}

export function projectBoardStatusLabel(status: MissionTask["status"]): string {
  if (status === "in_progress") return "Doing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function projectBoardStatusesForProject(
  project: MissionProject | null,
): typeof projectBoardStatuses {
  const columns = project?.columns || [];
  if (!columns.length) return projectBoardStatuses;
  return projectBoardStatuses.map((status) => {
    const column = columns.find((item) => item.status === status.id);
    return column
      ? { id: status.id, columnId: column.id, label: column.name }
      : status;
  });
}

export function projectBoardColumnsForProject(
  project: MissionProject | null,
): Array<Omit<ProjectBoardColumn, "tasks">> {
  const columns = project?.columns || [];
  if (!project || !columns.length) {
    return projectBoardStatuses.map((status) => ({
      id: status.id,
      columnId: status.columnId,
      status: status.id,
      label: status.label,
    }));
  }
  return [...columns]
    .filter((column) => !column.archivedAt)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((column) => ({
      id: column.id,
      columnId: column.id,
      status: column.status,
      label: column.name,
    }));
}

export function activeProjectTasks(tasks: MissionTask[]): MissionTask[] {
  return tasks.filter((task) =>
    activeProjectTaskStatuses.includes(task.status as ProjectBoardStatus),
  );
}

export function sortProjectTasks(tasks: MissionTask[]): MissionTask[] {
  return [...tasks].sort((a, b) => {
    const aPinned = a.pinnedAt ? 0 : 1;
    const bPinned = b.pinnedAt ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    if (a.pinnedAt || b.pinnedAt) {
      const pinnedDelta = (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
      if (pinnedDelta !== 0) return pinnedDelta;
    }
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aSort = a.dueAt || a.scheduledFor || a.createdAt;
    const bSort = b.dueAt || b.scheduledFor || b.createdAt;
    const sortDelta = aSort.localeCompare(bSort);
    if (sortDelta !== 0) return sortDelta;
    return a.id.localeCompare(b.id);
  });
}

export function taskDescriptionText(task: MissionTask | null | undefined): string {
  const description = task?.description?.trim();
  if (!description) return "";
  if (!/[<&]/.test(description)) return description;

  return description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function groupProjectTasks(
  projects: MissionProject[],
  tasks: MissionTask[],
  selectedProject: MissionProject | null,
): ProjectTaskListGroup[] {
  const selectedProjectId = selectedProject?.id || "";
  const scopedTasks = selectedProjectId
    ? tasks.filter((task) => task.projectId === selectedProjectId)
    : tasks;
  const orderedProjects = selectedProject
    ? [selectedProject]
    : [...projects].sort((a, b) => {
        if (a.name === "Personal") return -1;
        if (b.name === "Personal") return 1;
        return a.name.localeCompare(b.name);
      });
  const groups: ProjectTaskListGroup[] = [];

  for (const project of orderedProjects) {
    const projectTasks = scopedTasks.filter(
      (task) => task.projectId === project.id,
    );
    if (projectTasks.length || selectedProjectId) {
      groups.push({
        id: project.id,
        label: project.name,
        project,
        tasks: projectTasks,
      });
    }
  }

  if (!selectedProjectId) {
    const ungroupedTasks = scopedTasks.filter(
      (task) =>
        !task.projectId ||
        !projects.some((project) => project.id === task.projectId),
    );
    if (ungroupedTasks.length || groups.length === 0) {
      groups.push({
        id: "personal",
        label: "Personal",
        project: null,
        tasks: ungroupedTasks,
      });
    }
  }

  return groups;
}

export function projectName(
  projects: MissionProject[],
  projectId: string | null,
): string {
  if (!projectId) return "Personal";
  return (
    projects.find((project) => project.id === projectId)?.name || "Personal"
  );
}

export function projectTaskComposerProjectLabel(
  project: MissionProject,
): string {
  return isLocalProject(project) ? `${project.name} (Local)` : project.name;
}

export function projectForTask(
  projects: MissionProject[],
  task: MissionTask,
): MissionProject | null {
  if (!task.projectId) return null;
  return projects.find((project) => project.id === task.projectId) || null;
}

export function isLocalProject(
  project: MissionProject | null | undefined,
): boolean {
  return project?.sourceKind === "daemon_repo";
}

export function localProjectPath(
  project: MissionProject | null | undefined,
): string {
  const value = project?.metadata?.localPath;
  return typeof value === "string" ? value : "";
}

export function formatDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function ordinalDay(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const last = day % 10;
  if (last === 1) return `${day}st`;
  if (last === 2) return `${day}nd`;
  if (last === 3) return `${day}rd`;
  return `${day}th`;
}

function formatWeekdayDate(value: string, includeYear: boolean): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
  const year = date.getUTCFullYear();
  return `${weekday} ${ordinalDay(date.getUTCDate())} ${month}${includeYear ? ` ${year}` : ""}`;
}
