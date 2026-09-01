export interface CalendarEventEnd {
  endDate: string;
  endTime: string;
}

export function calendarEventEndOneHourAfter(
  startDate: string,
  startTime: string,
): CalendarEventEnd | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{2}:\d{2}$/.test(startTime)) {
    return null;
  }

  const [year, month, day] = startDate.split("-").map(Number);
  const [hour, minute] = startTime.split(":").map(Number);
  const start = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day ||
    start.getHours() !== hour ||
    start.getMinutes() !== minute
  ) {
    return null;
  }

  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    endTime: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
  };
}
