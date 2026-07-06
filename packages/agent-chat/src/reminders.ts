import { normalizeTimeZone } from "@me3-core/plugin-calendar";
import { isCoreChatReminderCreateRequest } from "./planner";
import type { AgentReminderInput } from "./index";

export type PendingReminderCreate = {
  capabilityId: "core.reminders.create";
  status: "active" | "resolved" | "expired";
  missingField: "when";
  threadId: string | null;
  title: string;
  timezone: string;
  createdAt: string;
  expiresAt: string;
};

type StorageLike = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
};

type ReminderTurnContext = {
  userId: string;
  threadId?: string | null;
};

const PENDING_REMINDER_CREATE_TTL_MS = 30 * 60 * 1000;

export function parseReminderChatRequest(
  messageText: string,
  ownerTimezone: string | null | undefined,
  pendingReminderCreate?: PendingReminderCreate | null,
):
  | { input: AgentReminderInput }
  | { error: string; pendingReminderCreate?: PendingReminderCreate }
  | null {
  if (!isCoreChatReminderCreateRequest(messageText) && !pendingReminderCreate) {
    return null;
  }

  const timezone =
    normalizeTimeZone(ownerTimezone) ||
    normalizeTimeZone(pendingReminderCreate?.timezone) ||
    "UTC";
  const explicitDate = parseExplicitDate(messageText);
  const relativeMs = parseRelativeReminderOffsetMs(messageText);
  const weekdayDate = parseReminderWeekdayDate(messageText, timezone);
  const hasTodayOrTomorrow = /\btoday|tomorrow\b/i.test(messageText);
  const hasReminderDate = Boolean(
    explicitDate || weekdayDate || relativeMs !== null || hasTodayOrTomorrow,
  );
  const dayOffset = /\btomorrow\b/i.test(messageText) ? 1 : 0;
  const time = parseExplicitReminderTime(messageText) || "09:00";
  const recurrence = parseReminderRecurrenceInput(messageText);
  let date: string;
  let parsedTime = time;

  if (relativeMs !== null) {
    const parts = dateTimePartsForInstant(new Date(Date.now() + relativeMs), timezone);
    date = parts.date;
    parsedTime = parts.time;
  } else {
    date = explicitDate || weekdayDate || addDaysToDate(localDateForTimezone(timezone), dayOffset);
  }

  const title = extractReminderTitle(messageText) || pendingReminderCreate?.title || null;
  if (!title) {
    return {
      error:
        "I can set that reminder, but I need what you want to be reminded about.",
    };
  }

  if (!hasReminderDate) {
    return {
      error:
        "I can set that reminder. Please include a date, or say today/tomorrow or in a few hours.",
      pendingReminderCreate: buildPendingReminderCreate(title, timezone),
    };
  }

  return {
    input: {
      title,
      date,
      time: parsedTime,
      timezone,
      recurrence,
    },
  };
}

export async function loadPendingReminderCreate(
  storage: StorageLike,
  input: ReminderTurnContext,
): Promise<PendingReminderCreate | null> {
  try {
    const key = pendingReminderCreateStorageKey(input);
    const pending = normalizePendingReminderCreate(await storage.get(key));
    if (!pending) return null;
    if (!isActivePendingReminderCreate(pending)) {
      await storage.put(key, {
        ...pending,
        status: "expired",
        expiresAt: new Date().toISOString(),
      });
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

export async function savePendingReminderCreate(
  storage: StorageLike,
  input: ReminderTurnContext,
  pending: PendingReminderCreate,
): Promise<void> {
  try {
    const threadId = normalizePendingReminderThreadId(input.threadId);
    await storage.put(pendingReminderCreateStorageKey(input), {
      ...pending,
      status: "active",
      threadId,
    });
  } catch {
    // Pending clarification state should improve follow-up routing, not fail chat.
  }
}

export async function resolvePendingReminderCreate(
  storage: StorageLike,
  input: ReminderTurnContext,
): Promise<void> {
  try {
    const key = pendingReminderCreateStorageKey(input);
    const pending = normalizePendingReminderCreate(await storage.get(key));
    if (!pending) return;
    await storage.put(key, {
      ...pending,
      status: "resolved",
      expiresAt: new Date().toISOString(),
    });
  } catch {
    // Reminder persistence has already succeeded; stale pending state can expire.
  }
}

function parseExplicitDate(messageText: string): string | null {
  const match = messageText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match?.[1] || null;
}

function parseRelativeReminderOffsetMs(messageText: string): number | null {
  const match = messageText.match(/\bin\s+(\d+)\s+(minutes?|mins?|hours?|hrs?|days?)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2].toLowerCase();
  if (unit.startsWith("min")) return amount * 60 * 1000;
  if (unit.startsWith("hour") || unit.startsWith("hr")) return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function parseReminderWeekdayDate(messageText: string, timezone: string): string | null {
  const match = messageText.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (!match) return null;
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = weekdays.indexOf(match[1].toLowerCase());
  const today = localDateForTimezone(timezone);
  const current = new Date(`${today}T12:00:00Z`).getUTCDay();
  const daysUntil = (target - current + 7) % 7;
  return addDaysToDate(today, daysUntil);
}

function parseExplicitReminderTime(messageText: string): string | null {
  const match =
    messageText.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
    messageText.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseReminderRecurrenceInput(messageText: string): string | null {
  if (/\bevery day|daily\b/i.test(messageText)) return "daily";
  if (/\bevery week|weekly\b/i.test(messageText)) return "weekly";
  if (/\bevery month|monthly\b/i.test(messageText)) return "monthly";
  return null;
}

function extractReminderTitle(messageText: string): string | null {
  const stripped = messageText
    .replace(/^(?:please\s+)?/i, "")
    .replace(/^(?:can|could|would|will)\s+you\s+/i, "")
    .replace(/^(?:remind(?:er)? me|set (?:a )?reminder|create (?:a )?reminder|add (?:a )?reminder)\s+(?:to|for|about|that)?\s*/i, "")
    .replace(/^(?:don't|dont) let me forget\s+(?:to|about|that)?\s*/i, "")
    .replace(/\b(?:today|tomorrow)\b/gi, "")
    .replace(/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\bon\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\bin\s+\d+\s+(?:minutes?|mins?|hours?|hrs?|days?)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .replace(/\b(?:every day|daily|every week|weekly|every month|monthly)\b/gi, "")
    .replace(/[.?!]+$/g, "")
    .trim();
  return stripped || null;
}

function buildPendingReminderCreate(
  title: string,
  timezone: string,
): PendingReminderCreate {
  const nowMs = Date.now();
  return {
    capabilityId: "core.reminders.create",
    status: "active",
    missingField: "when",
    threadId: null,
    title,
    timezone,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + PENDING_REMINDER_CREATE_TTL_MS).toISOString(),
  };
}

function pendingReminderCreateStorageKey(input: ReminderTurnContext): string {
  const threadKey = normalizePendingReminderThreadId(input.threadId) || "__global__";
  return `agent-chat:pending:core.reminders.create:${encodeURIComponent(input.userId)}:${encodeURIComponent(threadKey)}`;
}

function normalizePendingReminderCreate(value: unknown): PendingReminderCreate | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PendingReminderCreate>;
  if (candidate.capabilityId !== "core.reminders.create") return null;
  if (
    candidate.status !== "active" &&
    candidate.status !== "resolved" &&
    candidate.status !== "expired"
  ) {
    return null;
  }
  if (candidate.status !== "active") return null;
  if (candidate.missingField !== "when") return null;
  const title = normalizeNullableText(candidate.title);
  const timezone = normalizeTimeZone(candidate.timezone) || "UTC";
  const expiresAt = normalizeNullableText(candidate.expiresAt);
  const createdAt = normalizeNullableText(candidate.createdAt);
  if (!title || !expiresAt || !createdAt) return null;
  return {
    capabilityId: "core.reminders.create",
    status: "active",
    missingField: "when",
    threadId: normalizePendingReminderThreadId(candidate.threadId),
    title,
    timezone,
    createdAt,
    expiresAt,
  };
}

function normalizePendingReminderThreadId(value: unknown): string | null {
  return normalizeNullableText(value);
}

function isActivePendingReminderCreate(pending: PendingReminderCreate): boolean {
  const expiresAtMs = Date.parse(pending.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

function dateTimePartsForInstant(date: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

function localDateForTimezone(timezone: string | null): string {
  const normalizedTimezone = normalizeTimeZone(timezone) || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: normalizedTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to UTC if the stored timezone is invalid in this runtime.
  }
  return new Date().toISOString().slice(0, 10);
}

function addDaysToDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
