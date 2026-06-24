export type JournalReminderCaptureDefaults = {
  today: string;
  fallbackDate: string;
  fallbackTime: string;
};

export type JournalReminderCaptureDraft = {
  title: string;
  date: string;
  time: string;
};

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function parseJournalReminderCapture(
  text: string,
  defaults: JournalReminderCaptureDefaults,
): JournalReminderCaptureDraft {
  const date =
    parseExplicitDate(text) ||
    parseRelativeDate(text, defaults.today) ||
    parseWeekdayDate(text, defaults.today) ||
    defaults.fallbackDate;
  const time = parseTime(text) || defaults.fallbackTime;
  const title = stripReminderDateTime(text).trim() || text.trim();
  return { title, date, time };
}

function parseExplicitDate(text: string): string | null {
  return text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || null;
}

function parseRelativeDate(text: string, today: string): string | null {
  if (/\btomorrow\b/i.test(text)) return addDays(today, 1);
  if (/\btoday\b/i.test(text)) return today;
  return null;
}

function parseWeekdayDate(text: string, today: string): string | null {
  const match = text.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (!match) return null;
  const target = weekdays.indexOf(match[1].toLowerCase());
  const current = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, (target - current + 7) % 7);
}

function parseTime(text: string): string | null {
  const match =
    text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
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

function stripReminderDateTime(text: string): string {
  return text
    .replace(/\b(?:today|tomorrow)\b/gi, "")
    .replace(/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\bon\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "")
    .trim();
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}
