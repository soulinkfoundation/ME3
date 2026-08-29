export interface CalendarAgendaDetailLine {
  label: string;
  value: string;
  href?: string | null;
}

export interface CalendarAgendaEvent {
  id: string;
  entryType?:
    | "booking"
    | "reminder"
    | "event"
    | "birthday"
    | "imported"
    | "task"
    | "social_publication";
  recordId?: string;
  sourceLabel: string;
  title: string;
  siteKey: string;
  siteLabel: string;
  startsAt: string;
  endsAt: string;
  color?: string | null;
  allDay?: boolean;
  kind?: "event" | "birthday";
  recurrenceRule?: string | null;
  summary: string;
  detailLines: CalendarAgendaDetailLine[];
  notes?: string | null;
  actionLabel?: string | null;
  dangerActionLabel?: string | null;
}

export type CalendarRangeMode = "schedule" | "day" | "week" | "month";

export function calendarActivityDateKeys(
  events: CalendarAgendaEvent[],
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): string[] {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
  const dateKey = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value || "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  };
  const marked = new Set<string>();

  for (const event of events) {
    const start = new Date(event.startsAt);
    if (Number.isNaN(start.getTime())) continue;
    const parsedEnd = new Date(event.endsAt);
    const inclusiveEnd =
      !Number.isNaN(parsedEnd.getTime()) && parsedEnd > start
        ? new Date(parsedEnd.getTime() - 1)
        : start;
    const firstKey = dateKey(start);
    const lastKey = dateKey(inclusiveEnd);
    let cursor = new Date(`${firstKey}T12:00:00Z`);
    const last = new Date(`${lastKey}T12:00:00Z`);
    while (cursor <= last) {
      marked.add(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return [...marked].sort();
}
