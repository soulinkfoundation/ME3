export const MISSION_CONTROL_PLUGIN_ID = "me3.mission-control";

export const MISSION_CONTROL_RUNTIME = {
  id: MISSION_CONTROL_PLUGIN_ID,
  packageName: "@me3-core/plugin-mission-control",
  bundled: true,
  runtimeStatus: "mission_control_workspace",
  defaultRoute: "/mission-control",
  notes: [
    "Core bundles Mission Control as the default first-party owner workspace.",
    "Private memory, local daemon access, and run history stay plugin-owned and owner-scoped.",
    "Personal coaching surfaces such as Wheel of Life stay private and can later feed owner-approved agent context.",
    "Calendar writes are best-effort and keep local capture state when Calendar setup is missing.",
  ],
} as const;

export type MissionCaptureType = "task" | "reminder" | "event";
export type MissionCaptureStatus = "open" | "done" | "archived";
export type MissionTaskStatus =
  | "backlog"
  | "in_progress"
  | "review"
  | "done"
  | "cancelled";
export type MissionProjectStatus = "active" | "paused" | "archived";
export type MissionSyncStatus =
  | "local"
  | "pending"
  | "synced"
  | "failed"
  | "setup_required";

const EVENT_WORDS = [
  "appointment",
  "call",
  "class",
  "coffee",
  "date",
  "event",
  "interview",
  "lunch",
  "meeting",
  "session",
  "workshop",
] as const;

const EVENT_TIME_PHRASES =
  /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+(mon|tue|wed|thu|fri|sat|sun)\w*|\d{1,2}(?::\d{2})?\s?(am|pm))\b/i;

export function inferMissionCaptureType(text: string): MissionCaptureType {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "task";

  if (/^(remind|reminder|nudge|ping)\b/.test(normalized)) {
    return "reminder";
  }

  if (/^(event|meeting|meet|coffee|lunch|dinner|call)\b/.test(normalized)) {
    return "event";
  }

  if (
    /\b(with|at|from)\b/.test(normalized) &&
    EVENT_TIME_PHRASES.test(normalized) &&
    EVENT_WORDS.some((word) => normalized.includes(word))
  ) {
    return "event";
  }

  return "task";
}

export function normalizeMissionDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : normalized;
}

export function missionDateKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeMissionCaptureType(value: unknown): MissionCaptureType | null {
  if (value === "task" || value === "reminder" || value === "event") return value;
  return null;
}

export function normalizeMissionCaptureStatus(value: unknown): MissionCaptureStatus | null {
  if (value === "open" || value === "done" || value === "archived") return value;
  return null;
}

export function normalizeMissionTaskStatus(value: unknown): MissionTaskStatus | null {
  if (
    value === "backlog" ||
    value === "in_progress" ||
    value === "review" ||
    value === "done" ||
    value === "cancelled"
  ) {
    return value;
  }
  return null;
}

export function normalizeMissionProjectStatus(value: unknown): MissionProjectStatus | null {
  if (value === "active" || value === "paused" || value === "archived") return value;
  return null;
}

export function slugifyMissionProjectName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}
