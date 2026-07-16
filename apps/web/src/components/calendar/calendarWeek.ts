import type { CalendarAgendaEvent } from "./calendarAgenda";

export const WEEK_HOUR_HEIGHT = 64;
export const WEEK_SLOT_MINUTES = 15;
export const WEEK_DEFAULT_EVENT_MINUTES = 60;

export interface CalendarContextAnchor {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  trigger?: HTMLElement;
}

export interface CalendarWeekSlot {
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  allDay?: boolean;
}

export interface CalendarWeekLayoutEvent {
  event: CalendarAgendaEvent;
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  column: number;
  columnCount: number;
}

export function calendarContextAnchor(target: EventTarget | null): CalendarContextAnchor {
  const trigger = target instanceof HTMLElement ? target : undefined;
  const rect = trigger?.getBoundingClientRect();
  return {
    top: rect?.top ?? 0,
    right: rect?.right ?? 0,
    bottom: rect?.bottom ?? 0,
    left: rect?.left ?? 0,
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
    trigger,
  };
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function localDayStart(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function timedSegments(
  event: CalendarAgendaEvent,
  visibleDayKeys: string[],
) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const startTime = start.getTime();
  const endTime = end.getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return [];

  if (endTime <= startTime) {
    const dayKey = localDayKey(start);
    if (!visibleDayKeys.includes(dayKey)) return [];
    const startMinutes = minutesSinceMidnight(start);
    return [
      {
        dayKey,
        startMinutes,
        endMinutes: Math.min(24 * 60, startMinutes + 30),
      },
    ];
  }

  return visibleDayKeys.flatMap((dayKey) => {
    const dayStart = localDayStart(dayKey);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    if (endTime <= dayStart.getTime() || startTime >= dayEnd.getTime()) {
      return [];
    }

    const startMinutes = startTime <= dayStart.getTime()
      ? 0
      : minutesSinceMidnight(start);
    const rawEndMinutes = endTime >= dayEnd.getTime()
      ? 24 * 60
      : minutesSinceMidnight(end);
    return [
      {
        dayKey,
        startMinutes,
        endMinutes: Math.min(
          24 * 60,
          Math.max(startMinutes + 30, rawEndMinutes),
        ),
      },
    ];
  });
}

/** Assigns the minimum number of side-by-side lanes within each overlap cluster. */
export function layoutWeekTimedEvents(
  events: CalendarAgendaEvent[],
  visibleDayKeys: string[],
): CalendarWeekLayoutEvent[] {
  const byDay = new Map<
    string,
    Array<CalendarWeekLayoutEvent & { columnCount: number }>
  >();

  for (const event of events) {
    if (event.allDay) continue;
    for (const segment of timedSegments(event, visibleDayKeys)) {
      const dayEvents = byDay.get(segment.dayKey) ?? [];
      dayEvents.push({
        event,
        ...segment,
        column: 0,
        columnCount: 1,
      });
      byDay.set(segment.dayKey, dayEvents);
    }
  }

  const laidOut: CalendarWeekLayoutEvent[] = [];
  for (const dayEvents of byDay.values()) {
    dayEvents.sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        b.endMinutes - b.startMinutes - (a.endMinutes - a.startMinutes),
    );

    let cluster: typeof dayEvents = [];
    let clusterEnd = -1;
    const finishCluster = () => {
      const columnEnds: number[] = [];
      for (const item of cluster) {
        let column = columnEnds.findIndex((end) => end <= item.startMinutes);
        if (column < 0) column = columnEnds.length;
        item.column = column;
        columnEnds[column] = item.endMinutes;
      }
      const columnCount = Math.max(1, columnEnds.length);
      for (const item of cluster) item.columnCount = columnCount;
      laidOut.push(...cluster);
      cluster = [];
    };

    for (const item of dayEvents) {
      if (cluster.length > 0 && item.startMinutes >= clusterEnd) {
        finishCluster();
        clusterEnd = -1;
      }
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMinutes);
    }
    if (cluster.length > 0) finishCluster();
  }

  return laidOut;
}

export function weekSlotFromPointer(
  dayKey: string,
  clientY: number,
  columnTop: number,
): CalendarWeekSlot {
  const rawMinutes = ((clientY - columnTop) / WEEK_HOUR_HEIGHT) * 60;
  const startMinutes = Math.max(
    0,
    Math.min(
      24 * 60 - WEEK_SLOT_MINUTES,
      Math.floor(rawMinutes / WEEK_SLOT_MINUTES) * WEEK_SLOT_MINUTES,
    ),
  );
  return {
    dayKey,
    startMinutes,
    endMinutes: startMinutes + WEEK_DEFAULT_EVENT_MINUTES,
  };
}
