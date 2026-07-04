import {
  addDaysToDateString,
  getUtcMsForLocalTime,
  normalizeTimeZone,
} from "./calendar";
import type { Env } from "./types";

export type CalendarWindow = {
  start: string;
  end: string;
};

export type CalendarTaskFeedRow = {
  id: string;
  title: string;
  description: string | null;
  status: "backlog" | "in_progress" | "review" | "done";
  priority: number;
  dueAt: string | null;
  scheduledFor: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string | null;
  allDay: boolean;
  dateSource: "scheduled_for" | "due_at";
  projectId: string | null;
  projectName: string;
  projectColor: string | null;
  projectIcon: string | null;
  sourceKind: string;
  sourceRef: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type MissionCalendarTaskDbRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  due_at: string | null;
  scheduled_for: string | null;
  source_kind: string;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  project_icon: string | null;
};

const CALENDAR_TASK_STATUSES = new Set([
  "backlog",
  "in_progress",
  "review",
  "done",
]);

export function parseCalendarWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): CalendarWindow | { error: string } {
  if (!start || !end) return { error: "start and end are required" };
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { error: "Invalid start or end date" };
  }
  if (endMs <= startMs) return { error: "end must be after start" };
  return { start, end };
}

export async function listCalendarMissionTasks(
  env: Env,
  ownerId: string,
  window: CalendarWindow,
): Promise<CalendarTaskFeedRow[]> {
  const timezone = await getOwnerCalendarTimezone(env, ownerId);
  const startDay = localDayKeyForInstant(window.start, timezone);
  const endDay = localDayKeyForInstant(window.end, timezone);
  const dueStartDay = addDaysToDateString(startDay, -1);
  const dueEndDay = addDaysToDateString(endDay, 1);

  const rows = await env.DB.prepare(
    `SELECT t.id, t.title, t.description, t.status, t.priority,
            t.due_at, t.scheduled_for, t.source_kind, t.source_ref,
            t.created_at, t.updated_at, t.archived_at,
            p.id AS project_id, p.name AS project_name,
            p.color AS project_color, p.icon AS project_icon
     FROM mission_tasks t
     LEFT JOIN mission_projects p ON p.id = t.project_id AND p.user_id = t.user_id
     WHERE t.user_id = ?
       AND t.status IN ('backlog', 'in_progress', 'review', 'done')
       AND (
         (t.due_at IS NOT NULL AND t.due_at != ''
          AND substr(t.due_at, 1, 10) >= ? AND substr(t.due_at, 1, 10) < ?)
         OR
         (t.scheduled_for IS NOT NULL AND t.scheduled_for != ''
          AND t.scheduled_for >= ? AND t.scheduled_for < ?)
       )
     ORDER BY COALESCE(t.due_at, t.scheduled_for) ASC, t.priority ASC, t.id ASC`,
  )
    .bind(ownerId, dueStartDay, dueEndDay, startDay, endDay)
    .all<MissionCalendarTaskDbRow>();

  const windowStartMs = new Date(window.start).getTime();
  const windowEndMs = new Date(window.end).getTime();
  return (rows.results || [])
    .map((row) => serializeCalendarTask(row, timezone))
    .filter((task): task is CalendarTaskFeedRow => {
      if (!task) return false;
      return (
        new Date(task.endsAt).getTime() > windowStartMs &&
        new Date(task.startsAt).getTime() < windowEndMs
      );
    });
}

async function getOwnerCalendarTimezone(env: Env, ownerId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT timezone FROM owner_profile WHERE id = ?")
    .bind(ownerId)
    .first<{ timezone: string | null }>();
  return normalizeTimeZone(row?.timezone) || "UTC";
}

function serializeCalendarTask(
  row: MissionCalendarTaskDbRow,
  timezone: string,
): CalendarTaskFeedRow | null {
  if (!CALENDAR_TASK_STATUSES.has(row.status)) return null;

  const scheduledFor = normalizeDateKey(row.scheduled_for);
  const dueAt = normalizeDateOrDateTime(row.due_at);
  const dateSource = dueAt ? "due_at" : scheduledFor ? "scheduled_for" : null;
  if (!dateSource) return null;

  const range =
    dateSource === "due_at" && dueAt
      ? rangeForDueAt(dueAt, timezone)
      : scheduledFor
        ? allDayRangeForDateKey(scheduledFor, timezone)
        : null;
  if (!range) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as CalendarTaskFeedRow["status"],
    priority: row.priority,
    dueAt,
    scheduledFor,
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    timezone,
    allDay: range.allDay,
    dateSource,
    projectId: row.project_id,
    projectName: row.project_name || "Personal",
    projectColor: normalizeColor(row.project_color),
    projectIcon: row.project_icon,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function rangeForDueAt(
  dueAt: string,
  timezone: string,
): { startsAt: string; endsAt: string; allDay: boolean } | null {
  const dueDateKey = normalizeDateKey(dueAt);
  if (dueDateKey && dueAt.length === 10) {
    return allDayRangeForDateKey(dueDateKey, timezone);
  }

  const startsAt = new Date(dueAt);
  if (!Number.isFinite(startsAt.getTime())) return null;
  const iso = startsAt.toISOString();
  return { startsAt: iso, endsAt: iso, allDay: false };
}

function allDayRangeForDateKey(
  dateKey: string,
  timezone: string,
): { startsAt: string; endsAt: string; allDay: true } | null {
  const parts = datePartsFromKey(dateKey);
  if (!parts) return null;
  const nextParts = datePartsFromKey(addDaysToDateString(dateKey, 1));
  if (!nextParts) return null;
  return {
    startsAt: new Date(
      getUtcMsForLocalTime({ ...parts, hour: 0, minute: 0 }, timezone),
    ).toISOString(),
    endsAt: new Date(
      getUtcMsForLocalTime({ ...nextParts, hour: 0, minute: 0 }, timezone),
    ).toISOString(),
    allDay: true,
  };
}

function localDayKeyForInstant(value: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function datePartsFromKey(
  value: string,
): { year: number; month: number; day: number } | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function normalizeDateKey(value: string | null): string | null {
  if (!value) return null;
  const dateKey = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
}

function normalizeDateOrDateTime(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeColor(value: string | null): string | null {
  const color = value?.trim() || "";
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}
