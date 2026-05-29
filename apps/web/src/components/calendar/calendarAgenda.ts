export interface CalendarAgendaDetailLine {
  label: string;
  value: string;
}

export interface CalendarAgendaEvent {
  id: string;
  sourceLabel: string;
  title: string;
  siteKey: string;
  siteLabel: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  kind?: "event" | "birthday";
  recurrenceRule?: string | null;
  summary: string;
  detailLines: CalendarAgendaDetailLine[];
  notes?: string | null;
  actionLabel?: string | null;
  dangerActionLabel?: string | null;
}

export type CalendarRangeMode = "schedule" | "day" | "month";
