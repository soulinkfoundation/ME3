<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import CalendarAgenda from "../components/calendar/CalendarAgenda.vue";
import DatePickerPopover from "../components/calendar/DatePickerPopover.vue";
import CalendarMiniMonth from "../components/calendar/CalendarMiniMonth.vue";
import CalendarMonthBoard from "../components/calendar/CalendarMonthBoard.vue";
import Button from "../components/Button.vue";
import PageLoading from "../components/PageLoading.vue";
import UiIcon from "../components/UiIcon.vue";
import type { UiIconName } from "../utils/icons";
import BookingAvailabilityEditor, {
  type BookingAvailability,
} from "../components/booking/BookingAvailabilityEditor.vue";
import { useAppToast } from "../composables/useAppToast";
import type {
  CalendarAgendaEvent,
  CalendarRangeMode,
} from "../components/calendar/calendarAgenda";
import { ApiError, api } from "../api";
import { useSitesStore, type SiteContent } from "../stores/sites";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    requiresPlugin: "me3.calendar",
    title: "Calendar | ME3",
    description:
      "View upcoming bookings, reminders, events, and imported calendars across your ME3 workspace.",
    robots: "noindex,follow",
  },
});

interface CalendarBookingRow {
  id: string;
  site_id: string;
  username: string;
  guest_name: string;
  guest_email: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  calendar_event_id: string | null;
  status: "confirmed" | "cancelled";
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
  payment_intent_id: string | null;
  amount_paid: number | null;
  suggested_amount: number | null;
  currency:
    | "usd"
    | "gbp"
    | "eur"
    | "cad"
    | "aud"
    | "chf"
    | "sgd"
    | "inr"
    | "pkr"
    | null;
  payment_status: "pending" | "succeeded" | "failed" | "not_required" | null;
  is_free_booking: number;
  paid_at: string | null;
}

interface CalendarReminderRow {
  id: string;
  title: string;
  notes: string | null;
  remindAt: string;
  timezone: string | null;
  recurrenceRule: string | null;
  contextType: "contact" | "booking" | null;
  contextId: string | null;
  contextLabel: string | null;
  status: "pending" | "delivered" | "dismissed" | "cancelled" | "failed";
  deliveredAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

interface CalendarEventRow {
  id: string;
  title: string;
  notes: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string | null;
  allDay: boolean;
  kind?: "event" | "birthday";
  recurrenceRule?: string | null;
  sourceId: string | null;
  sourceName: string;
  sourceKind: "native" | "imported";
  createdAt: string;
}

interface CalendarSourceRow {
  id: string;
  name: string;
  kind: "ics_upload" | "ics_url";
  originalFilename: string | null;
  sourceUrlHint: string | null;
  importedEventCount: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
}

interface CalendarSiteOption {
  value: string;
  label: string;
}

interface CalendarFeedResponse {
  bookings: CalendarBookingRow[];
  reminders: CalendarReminderRow[];
  events: CalendarEventRow[];
  importedEvents: CalendarEventRow[];
  sources: CalendarSourceRow[];
}

type CreateMode =
  | "booking"
  | "reminder"
  | "event"
  | "birthday"
  | "import"
  | null;
type QuickCreateMode = Exclude<CreateMode, "import" | null>;

const PERSONAL_EVENTS_KEY = "__events__";
const BIRTHDAYS_KEY = "__birthdays__";
const REMINDERS_KEY = "__reminders__";
const QUICK_CREATE_MODES: QuickCreateMode[] = [
  "event",
  "birthday",
  "reminder",
  "booking",
];
const QUICK_CREATE_LABELS: Record<QuickCreateMode, string> = {
  event: "Event",
  birthday: "Birthday",
  reminder: "Reminder",
  booking: "Booking",
};
const sites = useSitesStore();
const bookings = ref<CalendarBookingRow[]>([]);
const reminders = ref<CalendarReminderRow[]>([]);
const events = ref<CalendarEventRow[]>([]);
const importedEvents = ref<CalendarEventRow[]>([]);
const sources = ref<CalendarSourceRow[]>([]);
const loading = ref(false);
const calendarLoaded = ref(false);
const error = ref("");
const updatingReminderId = ref<string | null>(null);
const cancellingBookingId = ref<string | null>(null);
const deletingEventId = ref<string | null>(null);
const removingSourceId = ref<string | null>(null);
const addingImportedBirthdayId = ref<string | null>(null);
const { toastSuccess, toastFromUnknown } = useAppToast();
let calendarLoadToken = 0;
/** Matches `.cal-shell` stacked layout at `max-width: 1100px`. */
const CALENDAR_COMPACT_MAX_WIDTH_PX = 1100;

const rangeMode = ref<CalendarRangeMode>("month");
const monthCursor = ref(new Date());
const dayCursor = ref(new Date());
const activeCreateMode = ref<CreateMode>(null);
const showCreateMenu = ref(false);
const showSettingsMenu = ref(false);
const calendarPickerOpen = ref(false);
const calendarPickerMonth = ref(monthKeyFromDate(new Date()));
const quickCreateDayKey = ref<string | null>(null);
const availabilityModalOpen = ref(false);
const availabilityLoading = ref(false);
const availabilitySaving = ref(false);
const availabilityError = ref("");
const availabilitySiteUsername = ref("");
const availabilitySourceProfile = ref<Record<string, unknown> | null>(null);
const availabilityDraft = ref<BookingAvailability>(defaultBookingAvailability());
const availabilityBufferTime = ref(0);
const availabilityTimezone = ref("UTC");

function startOfWeekMonday(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function monthGridWindow(from: Date): { start: Date; end: Date } {
  const year = from.getFullYear();
  const month = from.getMonth();
  const first = new Date(year, month, 1);
  const start = startOfWeekMonday(first);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rowCount = Math.ceil((lead + daysInMonth) / 7);
  const end = new Date(start);
  end.setDate(start.getDate() + rowCount * 7);
  return { start, end };
}

function monthWindow(from: Date): { start: Date; end: Date } {
  const year = from.getFullYear();
  const month = from.getMonth();
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 1),
  };
}

const focusedDayKey = ref<string | null>(null);
const preferSelectEventId = ref<string | null>(null);
const sidebarSiteFilter = ref<string>("all");
const boardHighlightId = ref("");
let mobileMediaQuery: MediaQueryList | null = null;

const todayDayKey = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

const monthToolbarTitle = computed(() =>
  new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(monthCursor.value),
);

const dayToolbarTitle = computed(() =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dayCursor.value),
);

const miniCalendarCursor = computed(() =>
  rangeMode.value === "day"
    ? dayCursor.value
    : monthCursor.value,
);

const rangeLabel = computed(() => {
  if (rangeMode.value === "schedule") return "Schedule";
  if (rangeMode.value === "day") return "Day";
  return "Month";
});

const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const defaultFormTimeZone = resolvedTimeZone || "UTC";
const timeZoneOptions = resolvedTimeZone
  ? { timeZone: resolvedTimeZone }
  : ({} as Intl.DateTimeFormatOptions);

const newBookingSubmitting = ref(false);
const newBookingError = ref("");
const newBookingForm = ref({
  username: "",
  guestName: "",
  guestEmail: "",
  date: "",
  startTime: "09:00",
  durationMinutes: 30,
  notes: "",
});

const newReminderSubmitting = ref(false);
const newReminderError = ref("");
const newReminderForm = ref({
  title: "",
  date: "",
  time: "",
  timezone: defaultFormTimeZone,
  recurrence: "none",
  notes: "",
});
const editingReminderId = ref<string | null>(null);

const newEventSubmitting = ref(false);
const newEventError = ref("");
const newEventForm = ref({
  title: "",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  timezone: defaultFormTimeZone,
  allDay: false,
  recurrence: "none",
  customInterval: 1,
  customUnit: "day" as "day" | "week" | "month" | "year",
  customEnd: "never" as "never" | "on" | "after",
  customUntilDate: "",
  customCount: 30,
  location: "",
  notes: "",
});
const editingEventId = ref<string | null>(null);

const newBirthdayForm = ref({
  name: "",
  date: "",
  notes: "",
});

const importSubmitting = ref(false);
const importError = ref("");
const importForm = ref({
  mode: "url" as "url" | "file",
  name: "",
  url: "",
  file: null as File | null,
});

const importSubmitLabel = computed(() => {
  if (importSubmitting.value) {
    return importForm.value.mode === "url" ? "Syncing..." : "Importing...";
  }
  return importForm.value.mode === "url" ? "Sync calendar" : "Import calendar";
});

const calendarWindow = computed(() => {
  if (rangeMode.value === "day") {
    const start = new Date(dayCursor.value);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const c = monthCursor.value;
  if (rangeMode.value === "schedule") return monthWindow(c);
  return monthGridWindow(c);
});

const dayKeyFormatter = computed(
  () =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...timeZoneOptions,
    }),
);

const calendarWindowStartDayKey = computed(() =>
  dayKeyFormatter.value.format(calendarWindow.value.start),
);

const calendarWindowEndDayKey = computed(() =>
  dayKeyFormatter.value.format(calendarWindow.value.end),
);

const quickCreateDateLabel = computed(() => {
  if (!quickCreateDayKey.value) return "your calendar";
  const [year, month, day] = quickCreateDayKey.value.split("-").map(Number);
  if (!year || !month || !day) return "your calendar";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, day));
});

const quickCreateTitle = computed(() => `Add to ${quickCreateDateLabel.value}`);

const quickCreateHeading = computed(() => {
  const mode = activeCreateMode.value;
  if ((editingEventId.value || editingReminderId.value) && isQuickCreateMode(mode)) {
    return `Edit ${QUICK_CREATE_LABELS[mode].toLowerCase()}`;
  }
  return quickCreateTitle.value;
});

const activeToolbarTitle = computed(() => {
  if (rangeMode.value === "schedule") return monthToolbarTitle.value;
  if (rangeMode.value === "day") return dayToolbarTitle.value;
  return monthToolbarTitle.value;
});

const mobileToolbarTitle = computed(() => activeToolbarTitle.value);

const calendarPickerSelectedDate = computed(() => {
  if (rangeMode.value === "day") return dayKeyFormatter.value.format(dayCursor.value);
  if (focusedDayKey.value) return focusedDayKey.value;
  return null;
});

const mobileRangeCycleLabel = computed(() => {
  const nextMode = nextCycleRangeMode();
  return `Switch to ${nextMode === "schedule" ? "Schedule" : "Month"} view`;
});

const mobileRangeIcon = computed<UiIconName>(() => {
  if (rangeMode.value === "schedule") return "List";
  return "CalendarDays";
});

const focusedAgendaDayKey = computed(() => {
  if (rangeMode.value !== "day") return focusedDayKey.value;
  return dayKeyFormatter.value.format(dayCursor.value);
});

function formatReminderRecurrence(rule: string): string {
  const normalized = rule.trim().toLowerCase();
  if (normalized === "daily") return "Daily";
  if (normalized.startsWith("weekly:")) {
    return `Weekly on ${normalized.slice("weekly:".length).replace(/,/g, ", ")}`;
  }
  if (normalized.startsWith("biweekly:")) {
    return `Every other ${normalized.slice("biweekly:".length)}`;
  }
  if (normalized.startsWith("monthly:")) {
    return `Monthly on day ${normalized.slice("monthly:".length)}`;
  }
  return rule;
}

function formatEventRecurrence(rule: string | null | undefined): string {
  if (rule === "daily") return "Daily";
  if (rule?.startsWith("weekly:")) {
    return `Weekly on ${rule.slice("weekly:".length).replace(/,/g, ", ")}`;
  }
  if (rule?.startsWith("monthly:")) {
    return `Monthly on day ${rule.slice("monthly:".length)}`;
  }
  if (rule === "yearly") return "Yearly";
  const custom = parseCustomEventRecurrence(rule);
  if (custom) {
    const unit = custom.interval === 1 ? custom.unit : `${custom.unit}s`;
    const suffix = custom.until
      ? ` until ${custom.until}`
      : custom.count
        ? ` for ${custom.count} occurrences`
        : "";
    return `Every ${custom.interval} ${unit}${suffix}`;
  }
  return rule || "";
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    ...timeZoneOptions,
  }).format(new Date(value));
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...timeZoneOptions,
  }).format(new Date(value));
}

function formatEventTimeRange(event: CalendarAgendaEvent) {
  if (event.allDay) {
    return formatEventDate(event.startsAt);
  }
  if (event.startsAt === event.endsAt) return formatEventTime(event.startsAt);
  return `${formatEventDate(event.startsAt)}, ${formatEventTime(event.startsAt)} - ${formatEventDate(event.endsAt)}, ${formatEventTime(event.endsAt)}`;
}

function formatCurrencyAmount(amount: number | null, currency: string | null) {
  if (amount == null || !currency) return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function formatBookingPayment(booking: CalendarBookingRow) {
  if (booking.is_free_booking === 1) {
    return "Free booking";
  }

  if (booking.payment_status === "not_required") {
    const formatted = formatCurrencyAmount(
      booking.suggested_amount,
      booking.currency,
    );
    return formatted ? `Manual booking (${formatted})` : "Manual booking";
  }

  if (booking.payment_status === "succeeded" || booking.amount_paid != null) {
    const formatted = formatCurrencyAmount(
      booking.amount_paid ?? booking.suggested_amount,
      booking.currency,
    );
    return formatted ? `Paid ${formatted}` : "Paid";
  }

  if (booking.payment_status === "pending") {
    return "Payment pending";
  }

  return "Payment status unavailable";
}

function defaultDateInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonthsToKey(monthKeyValue: string, delta: number): string {
  const [year, month] = monthKeyValue.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return monthKeyFromDate(date);
}

function defaultTimeInput(offsetHours = 1): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + offsetHours);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function dateInputFromDate(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function syncEventEndFromStart() {
  const form = newEventForm.value;
  if (form.allDay) {
    form.endDate = form.startDate;
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) || !/^\d{2}:\d{2}$/.test(form.startTime)) {
    return;
  }

  const [year, month, day] = form.startDate.split("-").map(Number);
  const [hour, minute] = form.startTime.split(":").map(Number);
  const end = new Date(year, month - 1, day, hour + 1, minute, 0, 0);
  form.endDate = dateInputFromDate(end);
  form.endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

function dateInputFromIso(value: string, subtractDays = 0): string {
  const d = new Date(value);
  if (subtractDays) d.setDate(d.getDate() - subtractDays);
  return dayKeyFormatter.value.format(d);
}

function timeInputFromIso(value: string): string {
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function recurrenceInputFromRule(rule: string | null | undefined): string {
  if (!rule) return "none";
  if (rule === "daily" || rule === "yearly") return rule;
  if (rule.startsWith("weekly:")) return "weekly";
  if (rule.startsWith("monthly:")) return "monthly";
  if (parseCustomEventRecurrence(rule)) return "custom";
  return "none";
}

function parseCustomEventRecurrence(rule: string | null | undefined) {
  if (!rule) return null;
  const parts = rule.trim().toLowerCase().split(":");
  if (parts[0] !== "custom") return null;
  const interval = Number(parts[1]);
  const unit = parts[2] as "day" | "week" | "month" | "year" | undefined;
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) return null;
  if (unit !== "day" && unit !== "week" && unit !== "month" && unit !== "year") {
    return null;
  }
  const parsed: {
    interval: number;
    unit: "day" | "week" | "month" | "year";
    until?: string;
    count?: number;
  } = { interval, unit };
  if (parts.length === 3) return parsed;
  if (parts.length !== 5) return null;
  if (parts[3] === "until" && /^\d{4}-\d{2}-\d{2}$/.test(parts[4])) {
    parsed.until = parts[4];
    return parsed;
  }
  if (parts[3] === "count") {
    const count = Number(parts[4]);
    if (Number.isInteger(count) && count >= 1 && count <= 999) {
      parsed.count = count;
      return parsed;
    }
  }
  return null;
}

function buildEventRecurrenceRule(): string {
  const form = newEventForm.value;
  if (form.recurrence !== "custom") return form.recurrence;
  const interval = Math.max(1, Math.min(99, Math.round(Number(form.customInterval) || 1)));
  const base = `custom:${interval}:${form.customUnit}`;
  if (form.customEnd === "on" && form.customUntilDate) {
    return `${base}:until:${form.customUntilDate}`;
  }
  if (form.customEnd === "after") {
    const count = Math.max(1, Math.min(999, Math.round(Number(form.customCount) || 1)));
    return `${base}:count:${count}`;
  }
  return base;
}

function applyCustomEventRecurrence(rule: string | null | undefined) {
  const custom = parseCustomEventRecurrence(rule);
  if (!custom) return;
  newEventForm.value.customInterval = custom.interval;
  newEventForm.value.customUnit = custom.unit;
  newEventForm.value.customEnd = custom.until ? "on" : custom.count ? "after" : "never";
  newEventForm.value.customUntilDate = custom.until || "";
  newEventForm.value.customCount = custom.count || 30;
}

function preferredCreateDate(): string {
  return focusedDayKey.value || defaultDateInput();
}

function mapBookingToCalendarEvent(
  booking: CalendarBookingRow,
): CalendarAgendaEvent {
  return {
    id: booking.id,
    sourceLabel: "Booking",
    title: booking.guest_name || "Unnamed booking",
    siteKey: booking.username,
    siteLabel: `${booking.username}.example.com`,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    summary: booking.guest_email,
    detailLines: [
      { label: "Guest", value: booking.guest_name || "Unknown guest" },
      { label: "Email", value: booking.guest_email },
      { label: "Duration", value: `${booking.duration_minutes} minutes` },
      { label: "Payment", value: formatBookingPayment(booking) },
    ],
    notes: booking.notes,
  };
}

function mapReminderToCalendarEvent(
  reminder: CalendarReminderRow,
): CalendarAgendaEvent {
  return {
    id: reminder.id,
    sourceLabel: "Reminder",
    title: reminder.title,
    siteKey: REMINDERS_KEY,
    siteLabel: "Agent reminders",
    startsAt: reminder.remindAt,
    endsAt: reminder.remindAt,
    summary: reminder.recurrenceRule
      ? `Recurring: ${formatReminderRecurrence(reminder.recurrenceRule)}`
      : "One-time reminder",
    detailLines: [
      { label: "Status", value: reminder.status },
      ...(reminder.timezone
        ? [{ label: "Timezone", value: reminder.timezone }]
        : []),
      ...(reminder.contextLabel
        ? [{ label: "Context", value: reminder.contextLabel }]
        : []),
    ],
    notes: reminder.notes,
    actionLabel: "Edit reminder",
    dangerActionLabel: "Cancel reminder",
  };
}

function mapEventToCalendarEvent(event: CalendarEventRow): CalendarAgendaEvent {
  const isImported = event.sourceKind === "imported";
  const isBirthday = event.kind === "birthday";
  const importedBirthdayCandidate = isImportedBirthdayCandidate(event);
  const siteKey = isImported
    ? `import:${event.sourceId}`
    : isBirthday
      ? BIRTHDAYS_KEY
      : PERSONAL_EVENTS_KEY;
  return {
    id: event.id,
    sourceLabel: isImported ? "Imported" : isBirthday ? "Birthday" : "Event",
    title: event.title || "Untitled event",
    siteKey,
    siteLabel: isBirthday ? "Birthdays" : event.sourceName,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    kind: event.kind || "event",
    recurrenceRule: event.recurrenceRule || null,
    summary:
      event.location ||
      (isBirthday ? "Birthday" : event.allDay ? "All day" : "Personal event"),
    detailLines: [
      ...(event.allDay ? [{ label: "When", value: "All day" }] : []),
      ...(event.location ? [{ label: "Location", value: event.location }] : []),
      ...(event.timezone ? [{ label: "Timezone", value: event.timezone }] : []),
      ...(event.recurrenceRule
        ? [
            {
              label: "Repeats",
              value: formatEventRecurrence(event.recurrenceRule),
            },
          ]
        : []),
      ...(isImported
        ? [{ label: "Imported from", value: event.sourceName }]
        : [
            {
              label: "Type",
              value: isBirthday ? "Birthday" : "Personal event",
            },
          ]),
    ],
    notes: event.notes,
    actionLabel: isImported
      ? importedBirthdayCandidate
        ? addingImportedBirthdayId.value === event.id
          ? "Adding..."
          : "Add to Birthdays"
        : null
      : "Edit event",
    dangerActionLabel: isImported ? null : "Delete event",
  };
}

function isImportedBirthdayCandidate(event: CalendarEventRow): boolean {
  return (
    event.sourceKind === "imported" &&
    event.allDay === true &&
    /\bbirthdays?\b/i.test(event.title)
  );
}

const siteOptions = computed<CalendarSiteOption[]>(() => [
  ...sites.sites.map((site) => ({
    value: site.username,
    label: `${site.username}.example.com`,
  })),
  { value: PERSONAL_EVENTS_KEY, label: "Personal events" },
  { value: BIRTHDAYS_KEY, label: "Birthdays" },
  { value: REMINDERS_KEY, label: "Agent reminders" },
  ...sources.value.map((source) => ({
    value: `import:${source.id}`,
    label: source.name,
  })),
]);

const mergedRangeEvents = computed(() =>
  [
    ...bookings.value.map(mapBookingToCalendarEvent),
    ...events.value.map(mapEventToCalendarEvent),
    ...importedEvents.value.map(mapEventToCalendarEvent),
    ...reminders.value.map(mapReminderToCalendarEvent),
  ].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  ),
);

const visibleEvents = computed(() => {
  if (sidebarSiteFilter.value === "all") return mergedRangeEvents.value;
  return mergedRangeEvents.value.filter(
    (event) => event.siteKey === sidebarSiteFilter.value,
  );
});

const initialCalendarLoading = computed(
  () => loading.value && !calendarLoaded.value,
);
const calendarRefreshing = computed(
  () => loading.value && calendarLoaded.value,
);
const showCalendarUnavailable = computed(
  () => !!error.value && !calendarLoaded.value,
);

const selectedBoardEvent = computed(() => {
  if (!boardHighlightId.value) return null;
  return (
    visibleEvents.value.find((event) => event.id === boardHighlightId.value) ??
    null
  );
});

async function reloadCalendar() {
  const token = ++calendarLoadToken;
  loading.value = true;
  error.value = "";

  try {
    const { start, end } = calendarWindow.value;
    const qs = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    const response = await api.get<CalendarFeedResponse>(
      `/calendar/feed?${qs.toString()}`,
    );
    if (token !== calendarLoadToken) return;
    bookings.value = response.bookings || [];
    reminders.value = response.reminders || [];
    events.value = response.events || [];
    importedEvents.value = response.importedEvents || [];
    sources.value = response.sources || [];
    calendarLoaded.value = true;
  } catch (err) {
    if (token !== calendarLoadToken) return;
    error.value =
      err instanceof Error ? err.message : "Failed to load calendar";
    if (!calendarLoaded.value) {
      bookings.value = [];
      reminders.value = [];
      events.value = [];
      importedEvents.value = [];
      sources.value = [];
    } else {
      toastFromUnknown(err, "Failed to refresh calendar");
    }
  } finally {
    if (token === calendarLoadToken) {
      loading.value = false;
    }
  }
}

async function cancelReminder(reminderId: string) {
  if (updatingReminderId.value) return;
  updatingReminderId.value = reminderId;
  try {
    await api.put(`/agent/reminders/${reminderId}/cancel`);
    toastSuccess("Reminder cancelled.");
    await reloadCalendar();
  } finally {
    updatingReminderId.value = null;
  }
}

async function deleteCalendarEvent(eventId: string) {
  if (deletingEventId.value) return;
  if (!window.confirm("Delete this event from your calendar?")) {
    return;
  }
  deletingEventId.value = eventId;
  try {
    await api.delete(`/calendar/events/${eventId}`);
    toastSuccess("Event deleted.");
    await reloadCalendar();
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to delete event";
  } finally {
    deletingEventId.value = null;
  }
}

function handleEventAction(event: CalendarAgendaEvent) {
  if (event.sourceLabel === "Reminder") {
    openEditReminder(event.id);
    return;
  }

  const importedSourceEvent = importedEvents.value.find(
    (item) => item.id === event.id,
  );
  if (importedSourceEvent && isImportedBirthdayCandidate(importedSourceEvent)) {
    void addImportedEventToBirthdays(event);
    return;
  }

  if (event.sourceLabel === "Event" || event.sourceLabel === "Birthday") {
    openEditEvent(event.id);
  }
}

function handleEventDangerAction(event: CalendarAgendaEvent) {
  if (event.sourceLabel === "Reminder") {
    void cancelReminder(event.id);
    return;
  }

  if (event.sourceLabel === "Event" || event.sourceLabel === "Birthday") {
    void deleteCalendarEvent(event.id);
  }
}

async function handleCancelBooking(event: CalendarAgendaEvent) {
  if (event.sourceLabel !== "Booking") return;
  if (
    !window.confirm(
      "Cancel this booking? The guest will receive a cancellation email.",
    )
  ) {
    return;
  }
  if (cancellingBookingId.value) return;
  cancellingBookingId.value = event.id;
  try {
    await api.delete(`/book/cancel/${event.id}`);
    toastSuccess("Booking cancelled.");
    await reloadCalendar();
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to cancel booking";
  } finally {
    cancellingBookingId.value = null;
  }
}

async function removeImportedCalendarSource(source: CalendarSourceRow) {
  if (removingSourceId.value) return;
  if (
    !window.confirm(
      `Remove ${source.name} from your calendar? Imported events from this source will be removed locally.`,
    )
  ) {
    return;
  }

  removingSourceId.value = source.id;
  try {
    await api.delete(`/calendar/sources/${encodeURIComponent(source.id)}`);
    const sourceKey = `import:${source.id}`;
    if (sidebarSiteFilter.value === sourceKey) {
      sidebarSiteFilter.value = "all";
    }
    if (boardHighlightId.value) {
      const removedEventIds = new Set(
        importedEvents.value
          .filter((event) => event.sourceId === source.id)
          .map((event) => event.id),
      );
      if (removedEventIds.has(boardHighlightId.value)) {
        boardHighlightId.value = "";
      }
    }
    sources.value = sources.value.filter((item) => item.id !== source.id);
    importedEvents.value = importedEvents.value.filter(
      (event) => event.sourceId !== source.id,
    );
    toastSuccess(`${source.name} removed.`);
  } catch (err) {
    toastFromUnknown(err, "Could not remove calendar source");
  } finally {
    removingSourceId.value = null;
  }
}

async function addImportedEventToBirthdays(event: CalendarAgendaEvent) {
  if (addingImportedBirthdayId.value) return;
  const startDate = dateInputFromIso(event.startsAt);
  if (!startDate) return;

  addingImportedBirthdayId.value = event.id;
  try {
    const response = await api.post<{ ok: boolean; event: { id: string } }>(
      "/calendar/events",
      {
        title: event.title,
        startDate,
        endDate: startDate,
        timezone: defaultFormTimeZone,
        allDay: true,
        kind: "birthday",
        recurrenceRule: "yearly",
        notes: event.notes || undefined,
      },
    );
    preferSelectEventId.value = response.event.id;
    boardHighlightId.value = response.event.id;
    sidebarSiteFilter.value = BIRTHDAYS_KEY;
    toastSuccess("Added to Birthdays.");
    await reloadCalendar();
  } catch (err) {
    toastFromUnknown(err, "Could not add birthday");
  } finally {
    addingImportedBirthdayId.value = null;
  }
}

const SITE_DOT_PALETTE = [
  "#7dbaf9",
  "#f28b82",
  "#fdd663",
  "#81c995",
  "#c58af9",
  "#ffad47",
  "#78d9ec",
];

function siteDotColor(key: string): string {
  if (key === REMINDERS_KEY) return "#9aa0a6";
  if (key === PERSONAL_EVENTS_KEY) return "#111111";
  if (key === BIRTHDAYS_KEY) return "#81c995";
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return SITE_DOT_PALETTE[Math.abs(h) % SITE_DOT_PALETTE.length];
}

const cycleRangeModes: CalendarRangeMode[] = ["schedule", "month"];

function nextCycleRangeMode(): CalendarRangeMode {
  const currentIndex = cycleRangeModes.indexOf(rangeMode.value);
  if (currentIndex < 0) return "schedule";
  return cycleRangeModes[(currentIndex + 1) % cycleRangeModes.length];
}

function cycleRangeMode() {
  onRangeChange(nextCycleRangeMode());
}

function syncCalendarPickerMonth() {
  calendarPickerMonth.value = monthKeyFromDate(miniCalendarCursor.value);
}

function toggleCalendarPicker() {
  if (!calendarPickerOpen.value) {
    syncCalendarPickerMonth();
  }
  showCreateMenu.value = false;
  showSettingsMenu.value = false;
  calendarPickerOpen.value = !calendarPickerOpen.value;
}

function moveCalendarPickerMonth(delta: number) {
  calendarPickerMonth.value = addMonthsToKey(calendarPickerMonth.value, delta);
}

function chooseCalendarPickerDay(dayKey: string) {
  calendarPickerOpen.value = false;
  onMiniPick(dayKey);
}

function pickCalendarToday() {
  chooseCalendarPickerDay(todayDayKey.value);
}

function toggleCreateMenu() {
  calendarPickerOpen.value = false;
  showSettingsMenu.value = false;
  showCreateMenu.value = !showCreateMenu.value;
}

function toggleSettingsMenu() {
  calendarPickerOpen.value = false;
  showCreateMenu.value = false;
  showSettingsMenu.value = !showSettingsMenu.value;
}

function defaultBookingAvailability(): BookingAvailability {
  return {
    monday: ["09:00-17:00"],
    tuesday: ["09:00-17:00"],
    wednesday: ["09:00-17:00"],
    thursday: ["09:00-17:00"],
    friday: ["09:00-17:00"],
    saturday: [],
    sunday: [],
  };
}

function normalizeBookingAvailability(input: unknown): BookingAvailability {
  const record =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fallback = defaultBookingAvailability();
  const next: BookingAvailability = {};
  for (const day of Object.keys(fallback)) {
    next[day] = Array.isArray(record[day])
      ? (record[day] as unknown[])
          .filter((window): window is string => typeof window === "string")
      : [...fallback[day]];
  }
  return next;
}

function compactAvailabilityWindows(availability: BookingAvailability) {
  const windows: Record<string, string[]> = {};
  for (const [day, dayWindows] of Object.entries(availability)) {
    if (dayWindows.length > 0) {
      windows[day] = [...dayWindows];
    }
  }
  return windows;
}

function isRealSiteUsername(value: string): boolean {
  return sites.sites.some((site) => site.username === value);
}

function preferredAvailabilitySiteUsername(): string {
  if (isRealSiteUsername(sidebarSiteFilter.value)) return sidebarSiteFilter.value;
  if (isRealSiteUsername(newBookingForm.value.username)) {
    return newBookingForm.value.username;
  }
  return sites.sites[0]?.username ?? "";
}

function applyAvailabilityContent(content: SiteContent | null) {
  if (!content?.ok || !content.profile) {
    availabilitySourceProfile.value = null;
    availabilityDraft.value = defaultBookingAvailability();
    availabilityBufferTime.value = 0;
    availabilityTimezone.value = defaultFormTimeZone;
    availabilityError.value = "No published site profile was found for this site.";
    return;
  }

  const profile = JSON.parse(JSON.stringify(content.profile)) as Record<
    string,
    unknown
  >;
  const intents =
    profile.intents && typeof profile.intents === "object"
      ? (profile.intents as Record<string, unknown>)
      : {};
  const book =
    intents.book && typeof intents.book === "object"
      ? (intents.book as Record<string, any>)
      : {};
  const oneToOneType = Array.isArray(book.bookingTypes)
    ? book.bookingTypes.find(
        (entry: unknown) =>
          entry &&
          typeof entry === "object" &&
          ((entry as Record<string, unknown>).type === "one_to_one" ||
            (entry as Record<string, unknown>).id === "one_to_one"),
      )
    : null;
  const oneToOneAvailability =
    oneToOneType &&
    typeof oneToOneType === "object" &&
    (oneToOneType as Record<string, any>).availability
      ? (oneToOneType as Record<string, any>).availability
      : null;
  const availability =
    oneToOneAvailability && typeof oneToOneAvailability === "object"
      ? oneToOneAvailability
      : book.availability && typeof book.availability === "object"
        ? book.availability
        : null;

  availabilitySourceProfile.value = profile;
  availabilityDraft.value = normalizeBookingAvailability(
    availability && typeof availability === "object"
      ? (availability as Record<string, unknown>).windows
      : null,
  );
  availabilityBufferTime.value =
    book.bufferTime === 0 ||
    book.bufferTime === 5 ||
    book.bufferTime === 10 ||
    book.bufferTime === 15 ||
    book.bufferTime === 30
      ? book.bufferTime
      : 0;
  availabilityTimezone.value =
    availability &&
    typeof availability === "object" &&
    typeof (availability as Record<string, unknown>).timezone === "string"
      ? ((availability as Record<string, unknown>).timezone as string)
      : defaultFormTimeZone;
}

async function loadAvailabilitySettings() {
  const username = availabilitySiteUsername.value;
  availabilityError.value = "";
  availabilitySourceProfile.value = null;
  if (!username) {
    availabilityError.value = "Create a site before editing booking availability.";
    return;
  }

  availabilityLoading.value = true;
  try {
    applyAvailabilityContent(await sites.getSiteContent(username));
  } catch (err) {
    availabilityError.value =
      err instanceof Error ? err.message : "Could not load booking availability.";
  } finally {
    availabilityLoading.value = false;
  }
}

async function openAvailabilitySettings() {
  showSettingsMenu.value = false;
  showCreateMenu.value = false;
  calendarPickerOpen.value = false;
  availabilityModalOpen.value = true;
  availabilitySiteUsername.value = preferredAvailabilitySiteUsername();
  await loadAvailabilitySettings();
}

function closeAvailabilitySettings() {
  availabilityModalOpen.value = false;
  availabilityError.value = "";
  availabilitySourceProfile.value = null;
}

async function saveAvailabilitySettings() {
  const username = availabilitySiteUsername.value;
  if (!username || !availabilitySourceProfile.value || availabilitySaving.value) {
    return;
  }

  availabilitySaving.value = true;
  availabilityError.value = "";
  try {
    const nextProfile = JSON.parse(
      JSON.stringify(availabilitySourceProfile.value),
    ) as Record<string, any>;
    const intents =
      nextProfile.intents && typeof nextProfile.intents === "object"
        ? { ...nextProfile.intents }
        : {};
    const book =
      intents.book && typeof intents.book === "object"
        ? { ...intents.book }
        : {};
    const availability = {
      ...(book.availability && typeof book.availability === "object"
        ? book.availability
        : {}),
      timezone: availabilityTimezone.value || defaultFormTimeZone,
      windows: compactAvailabilityWindows(availabilityDraft.value),
    };

    book.enabled = book.enabled ?? true;
    book.bufferTime = availabilityBufferTime.value;
    book.availability = availability;
    if (Array.isArray(book.bookingTypes)) {
      book.bookingTypes = book.bookingTypes.map((entry: unknown) => {
        if (!entry || typeof entry !== "object") return entry;
        const bookingType = entry as Record<string, any>;
        if (bookingType.type !== "one_to_one" && bookingType.id !== "one_to_one") {
          return bookingType;
        }
        return {
          ...bookingType,
          availability: {
            ...(bookingType.availability &&
            typeof bookingType.availability === "object"
              ? bookingType.availability
              : {}),
            ...availability,
          },
        };
      });
    }

    intents.book = book;
    nextProfile.intents = intents;

    const me3File = new File(
      [JSON.stringify(nextProfile, null, 2)],
      "me.json",
      { type: "application/json" },
    );
    const saved = await sites.uploadSite(username, [me3File]);
    if (!saved) {
      throw new Error(sites.error || "Could not save booking availability.");
    }

    availabilitySourceProfile.value = nextProfile;
    toastSuccess("Booking availability updated.");
    closeAvailabilitySettings();
  } catch (err) {
    availabilityError.value =
      err instanceof Error ? err.message : "Could not save booking availability.";
  } finally {
    availabilitySaving.value = false;
  }
}

function onRangeChange(mode: CalendarRangeMode) {
  const previous = rangeMode.value;
  rangeMode.value = mode;
  calendarPickerOpen.value = false;
  showSettingsMenu.value = false;
  boardHighlightId.value = "";
  if (mode === "day" && previous !== "day") {
    dayCursor.value = new Date();
    focusedDayKey.value = dayKeyFormatter.value.format(dayCursor.value);
  }
  if (mode === "month" && previous !== "month") {
    monthCursor.value = new Date();
    focusedDayKey.value = null;
  }
  if (mode === "schedule" && previous !== "schedule") {
    monthCursor.value = new Date();
    focusedDayKey.value = null;
  }
  void reloadCalendar();
}

function onPrevDay() {
  const d = new Date(dayCursor.value);
  d.setDate(d.getDate() - 1);
  dayCursor.value = d;
  focusedDayKey.value = dayKeyFormatter.value.format(d);
  void reloadCalendar();
}

function onNextDay() {
  const d = new Date(dayCursor.value);
  d.setDate(d.getDate() + 1);
  dayCursor.value = d;
  focusedDayKey.value = dayKeyFormatter.value.format(d);
  void reloadCalendar();
}

function onPrevMonth() {
  const c = monthCursor.value;
  monthCursor.value = new Date(c.getFullYear(), c.getMonth() - 1, 1);
  focusedDayKey.value = null;
  void reloadCalendar();
}

function onNextMonth() {
  const c = monthCursor.value;
  monthCursor.value = new Date(c.getFullYear(), c.getMonth() + 1, 1);
  focusedDayKey.value = null;
  void reloadCalendar();
}

function onToolbarPrev() {
  if (rangeMode.value === "day") onPrevDay();
  else if (rangeMode.value === "month" || rangeMode.value === "schedule") {
    onPrevMonth();
  }
}

function onToolbarNext() {
  if (rangeMode.value === "day") onNextDay();
  else if (rangeMode.value === "month" || rangeMode.value === "schedule") {
    onNextMonth();
  }
}

watch(visibleEvents, (nextEvents) => {
  if (
    boardHighlightId.value &&
    !nextEvents.some((event) => event.id === boardHighlightId.value)
  ) {
    boardHighlightId.value = "";
  }
});

watch(miniCalendarCursor, () => {
  if (calendarPickerOpen.value) {
    syncCalendarPickerMonth();
  }
});

watch(siteOptions, (nextOptions) => {
  if (
    sidebarSiteFilter.value !== "all" &&
    !nextOptions.some((option) => option.value === sidebarSiteFilter.value)
  ) {
    sidebarSiteFilter.value = "all";
  }
});

function applyCalendarViewportDefaults(matches: boolean) {
  sidebarSiteFilter.value = "all";
  rangeMode.value = matches ? "schedule" : "month";
  monthCursor.value = new Date();
  focusedDayKey.value = null;
  boardHighlightId.value = "";
}

function onMobileCalendarChange(event: MediaQueryListEvent) {
  applyCalendarViewportDefaults(event.matches);
  void reloadCalendar();
}

function onBoardSelectEvent(id: string) {
  boardHighlightId.value = id;
  preferSelectEventId.value = id;
  focusedDayKey.value = null;
}

function focusBoardDay(dayKey: string) {
  const toggle = focusedDayKey.value === dayKey ? null : dayKey;
  focusedDayKey.value = toggle;
  if (!toggle) return;
  const keyFmt = dayKeyFormatter.value;
  const first = visibleEvents.value.find(
    (event) => keyFmt.format(new Date(event.startsAt)) === toggle,
  );
  if (first) {
    boardHighlightId.value = first.id;
    preferSelectEventId.value = first.id;
  }
}

function onBoardSelectDay(dayKey: string) {
  focusedDayKey.value = dayKey;
  boardHighlightId.value = "";
  preferSelectEventId.value = null;
  openCreateMode("event", dayKey);
}

function onMiniPick(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (year && month && day) {
    const picked = new Date(year, month - 1, day);
    if (rangeMode.value === "day") {
      dayCursor.value = picked;
      focusedDayKey.value = dayKey;
      void reloadCalendar();
    } else if (rangeMode.value === "month" || rangeMode.value === "schedule") {
      monthCursor.value = new Date(year, month - 1, 1);
      void reloadCalendar();
    }
  }
  focusBoardDay(dayKey);
}

function resetBookingForm() {
  const firstSite = sites.sites[0]?.username ?? "";
  newBookingError.value = "";
  newBookingForm.value = {
    username: newBookingForm.value.username || firstSite,
    guestName: "",
    guestEmail: "",
    date: preferredCreateDate(),
    startTime: "09:00",
    durationMinutes: 30,
    notes: "",
  };
}

function resetReminderForm() {
  editingReminderId.value = null;
  newReminderError.value = "";
  newReminderForm.value = {
    title: "",
    date: preferredCreateDate(),
    time: defaultTimeInput(),
    timezone: defaultFormTimeZone,
    recurrence: "none",
    notes: "",
  };
}

function resetEventForm() {
  const date = preferredCreateDate();
  editingEventId.value = null;
  newEventError.value = "";
  newEventForm.value = {
    title: "",
    startDate: date,
    startTime: defaultTimeInput(),
    endDate: date,
    endTime: defaultTimeInput(2),
    timezone: defaultFormTimeZone,
    allDay: false,
    recurrence: "none",
    customInterval: 1,
    customUnit: "day",
    customEnd: "never",
    customUntilDate: "",
    customCount: 30,
    location: "",
    notes: "",
  };
}

function resetBirthdayForm() {
  editingEventId.value = null;
  newEventError.value = "";
  newBirthdayForm.value = {
    name: "",
    date: preferredCreateDate(),
    notes: "",
  };
}

function resetImportForm() {
  importError.value = "";
  importForm.value = {
    mode: "url",
    name: "",
    url: "",
    file: null,
  };
}

function openCreateMode(mode: Exclude<CreateMode, null>, dayKey?: string) {
  showCreateMenu.value = false;
  showSettingsMenu.value = false;
  calendarPickerOpen.value = false;
  if (dayKey) {
    focusedDayKey.value = dayKey;
  }
  quickCreateDayKey.value =
    mode === "import" ? null : (dayKey ?? focusedDayKey.value);

  if (mode === "booking") resetBookingForm();
  if (mode === "reminder") resetReminderForm();
  if (mode === "event") resetEventForm();
  if (mode === "birthday") resetBirthdayForm();
  if (mode === "import") resetImportForm();

  activeCreateMode.value = mode;
}

function switchQuickCreateMode(mode: QuickCreateMode) {
  if (activeCreateMode.value === mode) return;
  if (mode === "booking") resetBookingForm();
  if (mode === "reminder") resetReminderForm();
  if (mode === "event") resetEventForm();
  if (mode === "birthday") resetBirthdayForm();
  activeCreateMode.value = mode;
}

function openEditReminder(reminderId: string) {
  const reminder = reminders.value.find((item) => item.id === reminderId);
  if (!reminder) return;
  showCreateMenu.value = false;
  showSettingsMenu.value = false;
  calendarPickerOpen.value = false;
  newReminderError.value = "";
  editingReminderId.value = reminder.id;
  quickCreateDayKey.value = dateInputFromIso(reminder.remindAt);
  newReminderForm.value = {
    title: reminder.title,
    date: dateInputFromIso(reminder.remindAt),
    time: timeInputFromIso(reminder.remindAt),
    timezone: reminder.timezone || defaultFormTimeZone,
    recurrence: recurrenceInputFromRule(reminder.recurrenceRule),
    notes: reminder.notes || "",
  };
  activeCreateMode.value = "reminder";
}

function openEditEvent(eventId: string) {
  const event = events.value.find((item) => item.id === eventId);
  if (!event) return;
  showCreateMenu.value = false;
  showSettingsMenu.value = false;
  calendarPickerOpen.value = false;
  newEventError.value = "";
  editingEventId.value = event.id;
  quickCreateDayKey.value = dateInputFromIso(event.startsAt);

  if (event.kind === "birthday") {
    newBirthdayForm.value = {
      name: event.title.replace(/'s birthday$/i, ""),
      date: dateInputFromIso(event.startsAt),
      notes: event.notes || "",
    };
    activeCreateMode.value = "birthday";
    return;
  }

  newEventForm.value = {
    title: event.title,
    startDate: dateInputFromIso(event.startsAt),
    startTime: event.allDay ? "" : timeInputFromIso(event.startsAt),
    endDate: dateInputFromIso(event.endsAt, event.allDay ? 1 : 0),
    endTime: event.allDay ? "" : timeInputFromIso(event.endsAt),
    timezone: event.timezone || defaultFormTimeZone,
    allDay: event.allDay,
    recurrence: recurrenceInputFromRule(event.recurrenceRule),
    customInterval: 1,
    customUnit: "day",
    customEnd: "never",
    customUntilDate: "",
    customCount: 30,
    location: event.location || "",
    notes: event.notes || "",
  };
  applyCustomEventRecurrence(event.recurrenceRule);
  activeCreateMode.value = "event";
}

function isQuickCreateMode(mode: CreateMode): mode is QuickCreateMode {
  return (
    mode === "event" ||
    mode === "birthday" ||
    mode === "reminder" ||
    mode === "booking"
  );
}

function closeCreateMode() {
  activeCreateMode.value = null;
  showCreateMenu.value = false;
  showSettingsMenu.value = false;
  calendarPickerOpen.value = false;
  quickCreateDayKey.value = null;
  editingEventId.value = null;
  editingReminderId.value = null;
}

async function submitNewBooking() {
  newBookingError.value = "";
  const form = newBookingForm.value;
  if (
    !form.username.trim() ||
    !form.guestName.trim() ||
    !form.guestEmail.trim()
  ) {
    newBookingError.value = "Site, guest name, and email are required.";
    return;
  }

  newBookingSubmitting.value = true;
  try {
    const response = await api.post<{ ok: boolean; booking: { id: string } }>(
      "/book/workspace",
      {
        username: form.username.trim(),
        guestName: form.guestName.trim(),
        guestEmail: form.guestEmail.trim(),
        date: form.date,
        startTime: form.startTime,
        durationMinutes: form.durationMinutes,
        notes: form.notes.trim() || undefined,
      },
    );
    preferSelectEventId.value = response.booking.id;
    boardHighlightId.value = response.booking.id;
    toastSuccess("Booking created.");
    closeCreateMode();
    await reloadCalendar();
  } catch (err) {
    newBookingError.value =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not create booking.";
  } finally {
    newBookingSubmitting.value = false;
  }
}

async function submitNewReminder() {
  newReminderError.value = "";
  const form = newReminderForm.value;
  if (!form.title.trim()) {
    newReminderError.value = "Title is required.";
    return;
  }

  newReminderSubmitting.value = true;
  try {
    const payload = {
      title: form.title.trim(),
      date: form.date,
      time: form.time,
      timezone: form.timezone,
      recurrence: form.recurrence,
      notes: form.notes.trim() || undefined,
    };
    const response = editingReminderId.value
      ? await api.put<{ ok: boolean; reminder: { id: string } }>(
          `/agent/reminders/${editingReminderId.value}`,
          payload,
        )
      : await api.post<{ ok: boolean; reminder: { id: string } }>(
          "/agent/reminders",
          payload,
        );
    preferSelectEventId.value = response.reminder.id;
    boardHighlightId.value = response.reminder.id;
    toastSuccess(
      editingReminderId.value
        ? "Reminder updated."
        : "Reminder added to your calendar.",
    );
    closeCreateMode();
    await reloadCalendar();
  } catch (err) {
    newReminderError.value =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not save reminder.";
  } finally {
    newReminderSubmitting.value = false;
  }
}

async function submitNewEvent() {
  newEventError.value = "";
  const form = newEventForm.value;
  if (!form.title.trim()) {
    newEventError.value = "Title is required.";
    return;
  }
  if (form.recurrence === "custom") {
    if (form.customEnd === "on" && !form.customUntilDate) {
      newEventError.value = "Choose an end date or set custom recurrence to never end.";
      return;
    }
    if (form.customEnd === "after" && (!form.customCount || form.customCount < 1)) {
      newEventError.value = "Custom recurrence needs at least one occurrence.";
      return;
    }
  }

  newEventSubmitting.value = true;
  try {
    const payload = {
      title: form.title.trim(),
      startDate: form.startDate,
      startTime: form.startTime,
      endDate: form.endDate,
      endTime: form.endTime,
      timezone: form.timezone,
      allDay: form.allDay,
      recurrenceRule: buildEventRecurrenceRule(),
      location: form.location.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    const response = editingEventId.value
      ? await api.put<{ ok: boolean; event: { id: string } }>(
          `/calendar/events/${editingEventId.value}`,
          payload,
        )
      : await api.post<{ ok: boolean; event: { id: string } }>(
          "/calendar/events",
          payload,
    );
    preferSelectEventId.value = response.event.id;
    boardHighlightId.value = response.event.id;
    toastSuccess(
      editingEventId.value
        ? "Event updated."
        : "Event added to your calendar.",
    );
    closeCreateMode();
    await reloadCalendar();
  } catch (err) {
    newEventError.value =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not save event.";
  } finally {
    newEventSubmitting.value = false;
  }
}

async function submitNewBirthday() {
  newEventError.value = "";
  const form = newBirthdayForm.value;
  if (!form.name.trim()) {
    newEventError.value = "Name is required.";
    return;
  }

  newEventSubmitting.value = true;
  try {
    const payload = {
      title: `${form.name.trim()}'s birthday`,
      startDate: form.date,
      endDate: form.date,
      timezone: defaultFormTimeZone,
      allDay: true,
      kind: "birthday",
      recurrenceRule: "yearly",
      notes: form.notes.trim() || undefined,
    };
    const response = editingEventId.value
      ? await api.put<{ ok: boolean; event: { id: string } }>(
          `/calendar/events/${editingEventId.value}`,
          payload,
        )
      : await api.post<{ ok: boolean; event: { id: string } }>(
          "/calendar/events",
          payload,
    );
    preferSelectEventId.value = response.event.id;
    boardHighlightId.value = response.event.id;
    toastSuccess(
      editingEventId.value
        ? "Birthday updated."
        : "Birthday added to your calendar.",
    );
    closeCreateMode();
    await reloadCalendar();
  } catch (err) {
    newEventError.value =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not save birthday.";
  } finally {
    newEventSubmitting.value = false;
  }
}

function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  importForm.value.file = input?.files?.[0] || null;
}

async function submitImport() {
  importError.value = "";
  if (importForm.value.mode === "url" && !importForm.value.url.trim()) {
    importError.value = "Paste an iCalendar subscription URL.";
    return;
  }
  if (importForm.value.mode === "file" && !importForm.value.file) {
    importError.value = "Choose an .ics file to import.";
    return;
  }

  importSubmitting.value = true;
  try {
    let response: {
      ok: boolean;
      importedCount: number;
      source: { name: string };
    };

    if (importForm.value.mode === "url") {
      response = await api.post<{
        ok: boolean;
        importedCount: number;
        source: { name: string };
      }>("/calendar/sources/ics-url", {
        name: importForm.value.name.trim(),
        url: importForm.value.url.trim(),
      });
    } else {
      const formData = new FormData();
      if (importForm.value.file) formData.set("file", importForm.value.file);
      if (importForm.value.name.trim()) {
        formData.set("name", importForm.value.name.trim());
      }
      response = await api.upload<{
        ok: boolean;
        importedCount: number;
        source: { name: string };
      }>("/calendar/import/ics", formData);
    }

    toastSuccess(
      `${importForm.value.mode === "url" ? "Synced" : "Imported"} ${response.importedCount} events from ${response.source.name}.`,
    );
    closeCreateMode();
    await reloadCalendar();
  } catch (err) {
    importError.value =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not import calendar.";
  } finally {
    importSubmitting.value = false;
  }
}

watch(
  () => sites.sites.length,
  (nextCount) => {
    if (nextCount > 0 && !newBookingForm.value.username) {
      newBookingForm.value.username = sites.sites[0]?.username ?? "";
    }
  },
);

function closeCalendarHeaderMenus() {
  calendarPickerOpen.value = false;
  showCreateMenu.value = false;
  showSettingsMenu.value = false;
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (availabilityModalOpen.value) {
      closeAvailabilitySettings();
      return;
    }
    closeCalendarHeaderMenus();
  }
}

function handleWindowClick() {
  closeCalendarHeaderMenus();
}

onMounted(async () => {
  mobileMediaQuery = window.matchMedia(
    `(max-width: ${CALENDAR_COMPACT_MAX_WIDTH_PX}px)`,
  );
  applyCalendarViewportDefaults(mobileMediaQuery.matches);
  mobileMediaQuery.addEventListener("change", onMobileCalendarChange);
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("click", handleWindowClick);
  await sites.fetchSites();
  if (sites.sites[0]) {
    newBookingForm.value.username = sites.sites[0].username;
  }
  await reloadCalendar();
});

onBeforeUnmount(() => {
  mobileMediaQuery?.removeEventListener("change", onMobileCalendarChange);
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener("click", handleWindowClick);
});
</script>

<template>
  <div class="ops-page calendar-spike">
    <Teleport to="#app-side-nav-mobile-page-controls">
      <div
        v-if="!initialCalendarLoading && !showCalendarUnavailable"
        class="cal-mobile-nav-controls"
        @click.stop
      >
        <div class="cal-period-switcher cal-period-switcher--mobile" aria-label="Calendar period">
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            class="cal-arrow"
            aria-label="Previous period"
            title="Previous period"
            type="button"
            @click="onToolbarPrev"
          >
            <UiIcon name="ChevronLeft" :size="18" aria-hidden="true" />
          </Button>
          <button
            type="button"
            class="cal-period-title"
            :aria-expanded="calendarPickerOpen"
            aria-haspopup="dialog"
            aria-label="Choose calendar date"
            @click="toggleCalendarPicker"
          >
            {{ mobileToolbarTitle }}
          </button>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            class="cal-arrow"
            aria-label="Next period"
            title="Next period"
            type="button"
            @click="onToolbarNext"
          >
            <UiIcon name="ChevronRight" :size="18" aria-hidden="true" />
          </Button>
          <DatePickerPopover
            v-if="calendarPickerOpen"
            :month-key="calendarPickerMonth"
            :selected-date="calendarPickerSelectedDate"
            :today-date="todayDayKey"
            aria-label="Choose calendar date"
            @move-month="moveCalendarPickerMonth"
            @select-date="chooseCalendarPickerDay"
            @today="pickCalendarToday"
          />
        </div>
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          class="cal-mobile-icon-btn"
          :aria-label="mobileRangeCycleLabel"
          :title="mobileRangeCycleLabel"
          type="button"
          @click="cycleRangeMode"
        >
          <UiIcon :name="mobileRangeIcon" :size="18" aria-hidden="true" />
        </Button>
        <div class="cal-mobile-settings-wrap">
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            class="cal-mobile-icon-btn"
            aria-label="Calendar settings"
            title="Calendar settings"
            type="button"
            :aria-expanded="showSettingsMenu"
            aria-haspopup="menu"
            @click="toggleSettingsMenu"
          >
            <UiIcon name="Settings" :size="18" aria-hidden="true" />
          </Button>
          <div
            v-if="showSettingsMenu"
            class="cal-create-menu cal-settings-menu cal-settings-menu--mobile-nav"
            role="menu"
          >
            <button
              type="button"
              class="cal-settings-menu-item"
              role="menuitem"
              @click="openAvailabilitySettings"
            >
              <UiIcon name="CalendarClock" :size="16" aria-hidden="true" />
              Availability
            </button>
            <button
              type="button"
              class="cal-settings-menu-item"
              role="menuitem"
              @click="openCreateMode('import')"
            >
              <UiIcon name="RefreshCw" :size="16" aria-hidden="true" />
              Sync calendar
            </button>
          </div>
        </div>
        <div class="cal-mobile-create-wrap">
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            class="cal-mobile-icon-btn"
            aria-label="Create calendar item"
            title="Create calendar item"
            type="button"
            :aria-expanded="showCreateMenu"
            aria-haspopup="menu"
            @click="toggleCreateMenu"
          >
            <UiIcon name="Plus" :size="18" aria-hidden="true" />
          </Button>
          <div
            v-if="showCreateMenu"
            class="cal-create-menu cal-create-menu--mobile-nav"
            role="menu"
          >
            <button type="button" role="menuitem" @click="openCreateMode('booking')">
              New booking
            </button>
            <button type="button" role="menuitem" @click="openCreateMode('reminder')">
              New reminder
            </button>
            <button type="button" role="menuitem" @click="openCreateMode('event')">
              New event
            </button>
            <button type="button" role="menuitem" @click="openCreateMode('birthday')">
              New birthday
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <main class="main">
      <div
        v-if="!initialCalendarLoading && !showCalendarUnavailable"
        class="cal-toolbar"
        @click.stop
      >
        <div class="cal-toolbar-left">
          <div class="cal-view-toggle" role="group" aria-label="Calendar range">
            <button
              type="button"
              :class="{ 'is-on': rangeMode === 'schedule' }"
              @click="onRangeChange('schedule')"
            >
              Schedule
            </button>
            <button
              type="button"
              :class="{ 'is-on': rangeMode === 'month' }"
              @click="onRangeChange('month')"
            >
              Month
            </button>
          </div>
        </div>
        <div class="cal-period-switcher" aria-label="Calendar period">
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            class="cal-arrow"
            aria-label="Previous period"
            title="Previous period"
            type="button"
            @click="onToolbarPrev"
          >
            <UiIcon name="ChevronLeft" :size="20" aria-hidden="true" />
          </Button>
          <button
            type="button"
            class="cal-period-title"
            :aria-expanded="calendarPickerOpen"
            aria-haspopup="dialog"
            aria-label="Choose calendar date"
            @click="toggleCalendarPicker"
          >
            {{ activeToolbarTitle }}
          </button>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            class="cal-arrow"
            aria-label="Next period"
            title="Next period"
            type="button"
            @click="onToolbarNext"
          >
            <UiIcon name="ChevronRight" :size="20" aria-hidden="true" />
          </Button>
          <DatePickerPopover
            v-if="calendarPickerOpen"
            :month-key="calendarPickerMonth"
            :selected-date="calendarPickerSelectedDate"
            :today-date="todayDayKey"
            aria-label="Choose calendar date"
            @move-month="moveCalendarPickerMonth"
            @select-date="chooseCalendarPickerDay"
            @today="pickCalendarToday"
          />
        </div>
        <div class="cal-toolbar-actions">
          <div class="cal-create-wrap">
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              class="cal-toolbar-icon-btn"
              aria-label="Calendar settings"
              title="Calendar settings"
              type="button"
              :aria-expanded="showSettingsMenu"
              aria-haspopup="menu"
              @click="toggleSettingsMenu"
            >
              <UiIcon name="Settings" :size="18" aria-hidden="true" />
            </Button>
            <div
              v-if="showSettingsMenu"
              class="cal-create-menu cal-settings-menu cal-settings-menu--toolbar"
              role="menu"
            >
              <button
                type="button"
                class="cal-settings-menu-item"
                role="menuitem"
                @click="openAvailabilitySettings"
              >
                <UiIcon name="CalendarClock" :size="16" aria-hidden="true" />
                Availability
              </button>
              <button
                type="button"
                class="cal-settings-menu-item"
                role="menuitem"
                @click="openCreateMode('import')"
              >
                <UiIcon name="RefreshCw" :size="16" aria-hidden="true" />
                Sync calendar
              </button>
            </div>
          </div>
          <div class="cal-create-wrap">
            <Button
              color="primary"
              shape="soft"
              size="compact"
              type="button"
              :aria-expanded="showCreateMenu"
              aria-haspopup="menu"
              @click="toggleCreateMenu"
            >
              <template #icon>
                <UiIcon name="Plus" :size="16" aria-hidden="true" />
              </template>
              Create
            </Button>
            <div
              v-if="showCreateMenu"
              class="cal-create-menu cal-create-menu--toolbar"
              role="menu"
            >
              <button type="button" role="menuitem" @click="openCreateMode('booking')">
                New booking
              </button>
              <button type="button" role="menuitem" @click="openCreateMode('reminder')">
                New reminder
              </button>
              <button type="button" role="menuitem" @click="openCreateMode('event')">
                New event
              </button>
              <button type="button" role="menuitem" @click="openCreateMode('birthday')">
                New birthday
              </button>
            </div>
          </div>
        </div>
      </div>

      <PageLoading v-if="initialCalendarLoading" label="Loading calendar..." />
      <div v-else-if="showCalendarUnavailable" class="cal-error-banner">
        {{ error }}
      </div>
      <template v-else>
        <div
          class="cal-shell"
          :class="{
            'cal-shell--board-view': rangeMode !== 'schedule',
            'cal-shell--refreshing': calendarRefreshing,
          }"
        >
            <div
              v-if="calendarRefreshing"
              class="cal-refresh-indicator"
              role="status"
              aria-live="polite"
            >
              Updating…
            </div>
            <aside class="cal-sidebar">
              <div class="cal-sidebar-calendar-tools">
                <CalendarMiniMonth
                  :year="miniCalendarCursor.getFullYear()"
                  :month="miniCalendarCursor.getMonth()"
                  :today-day-key="todayDayKey"
                  :selected-day-key="focusedDayKey"
                  @pick-day="onMiniPick"
                />
              </div>
              <section
                class="cal-filters cal-sidebar-calendar-tools"
                aria-label="Calendars"
              >
                <h3 class="cal-filters-title">Calendars</h3>
                <label class="cal-filter-row">
                  <input
                    v-model="sidebarSiteFilter"
                    type="radio"
                    class="cal-filter-input"
                    value="all"
                  />
                  <span
                    class="cal-swatch cal-swatch--neutral"
                    aria-hidden="true"
                  />
                  <span class="cal-filter-label">All calendars</span>
                </label>
                <label
                  v-for="s in sites.sites"
                  :key="s.username"
                  class="cal-filter-row"
                >
                  <input
                    v-model="sidebarSiteFilter"
                    type="radio"
                    class="cal-filter-input"
                    :value="s.username"
                  />
                  <span
                    class="cal-swatch"
                    :style="{ background: siteDotColor(s.username) }"
                    aria-hidden="true"
                  />
                  <span class="cal-filter-label">{{ s.username }}</span>
                </label>
                <label class="cal-filter-row">
                  <input
                    v-model="sidebarSiteFilter"
                    type="radio"
                    class="cal-filter-input"
                    value="__reminders__"
                  />
                  <span
                    class="cal-swatch cal-swatch--muted"
                    aria-hidden="true"
                  />
                  <span class="cal-filter-label">Reminders</span>
                </label>
                <label class="cal-filter-row">
                  <input
                    v-model="sidebarSiteFilter"
                    type="radio"
                    class="cal-filter-input"
                    :value="PERSONAL_EVENTS_KEY"
                  />
                  <span
                    class="cal-swatch"
                    :style="{ background: siteDotColor(PERSONAL_EVENTS_KEY) }"
                    aria-hidden="true"
                  />
                  <span class="cal-filter-label">Personal events</span>
                </label>
                <label class="cal-filter-row">
                  <input
                    v-model="sidebarSiteFilter"
                    type="radio"
                    class="cal-filter-input"
                    :value="BIRTHDAYS_KEY"
                  />
                  <span
                    class="cal-swatch"
                    :style="{ background: siteDotColor(BIRTHDAYS_KEY) }"
                    aria-hidden="true"
                  />
                  <span class="cal-filter-label">Birthdays</span>
                </label>
                <div
                  v-for="source in sources"
                  :key="source.id"
                  class="cal-filter-row cal-filter-row--with-action"
                >
                  <label class="cal-filter-choice">
                    <input
                      v-model="sidebarSiteFilter"
                      type="radio"
                      class="cal-filter-input"
                      :value="`import:${source.id}`"
                    />
                    <span
                      class="cal-swatch"
                      :style="{ background: siteDotColor(`import:${source.id}`) }"
                      aria-hidden="true"
                    />
                    <span class="cal-filter-label">
                      {{ source.name }}
                      <small v-if="source.lastSyncError" class="cal-filter-meta cal-filter-meta--error">
                        Sync failed
                      </small>
                      <small v-else-if="source.kind === 'ics_url'" class="cal-filter-meta">
                        {{ source.sourceUrlHint || "Subscribed" }}
                      </small>
                    </span>
                  </label>
                  <button
                    type="button"
                    class="cal-filter-action"
                    :disabled="removingSourceId === source.id"
                    :aria-label="`Remove ${source.name}`"
                    :title="`Remove ${source.name}`"
                    @click="removeImportedCalendarSource(source)"
                  >
                    <UiIcon name="Trash2" :size="14" />
                  </button>
                </div>
              </section>
            </aside>

            <div class="cal-board-wrap">
              <CalendarAgenda
                v-if="rangeMode === 'schedule'"
                :events="visibleEvents"
                :range-mode="rangeMode"
                :range-label="rangeLabel"
                :start-day-key="calendarWindowStartDayKey"
                :end-day-key="calendarWindowEndDayKey"
                :focus-day-key="focusedDayKey"
                :today-day-key="todayDayKey"
                :prefer-select-event-id="preferSelectEventId"
                :cancelling-booking-id="cancellingBookingId"
                title="Schedule"
                description="Scheduled items across your calendars."
                @clear-focus="focusedDayKey = null"
                @consumed-prefer-select="preferSelectEventId = null"
                @event-action="handleEventAction"
                @event-danger-action="handleEventDangerAction"
                @cancel-booking="handleCancelBooking"
              />
              <CalendarAgenda
                v-else-if="rangeMode === 'day'"
                :events="visibleEvents"
                title="Daily schedule"
                description="Bookings, reminders, events, and imported calendars."
                range-label="Day"
                range-mode="day"
                :start-day-key="calendarWindowStartDayKey"
                :end-day-key="calendarWindowEndDayKey"
                :focus-day-key="focusedAgendaDayKey"
                :today-day-key="todayDayKey"
                :prefer-select-event-id="preferSelectEventId"
                :cancelling-booking-id="cancellingBookingId"
                @event-action="handleEventAction"
                @event-danger-action="handleEventDangerAction"
                @cancel-booking="handleCancelBooking"
                @clear-focus="focusedDayKey = null"
                @consumed-prefer-select="preferSelectEventId = null"
              />
              <template v-else>
                <CalendarMonthBoard
                  :year="monthCursor.getFullYear()"
                  :month="monthCursor.getMonth()"
                  :events="visibleEvents"
                  :selected-event-id="boardHighlightId"
                  :today-day-key="todayDayKey"
                  @select-event="onBoardSelectEvent"
                  @select-day="onBoardSelectDay"
                />
              </template>
            </div>
        </div>

      </template>
    </main>

    <div
      v-if="selectedBoardEvent"
      class="modal-overlay"
      @click.self="boardHighlightId = ''"
    >
      <aside
        class="modal-card event-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
      >
        <div class="modal-header">
          <div>
            <p class="modal-kicker">{{ selectedBoardEvent.sourceLabel }}</p>
            <h2 id="event-detail-title">{{ selectedBoardEvent.title }}</h2>
          </div>
          <button
            type="button"
            class="icon-close"
            aria-label="Close"
            @click="boardHighlightId = ''"
          >
            ×
          </button>
        </div>

        <p class="event-detail-summary">{{ selectedBoardEvent.summary }}</p>
        <p class="event-detail-time">
          {{ formatEventTimeRange(selectedBoardEvent) }}
        </p>
        <p class="event-detail-site">{{ selectedBoardEvent.siteLabel }}</p>

        <dl class="event-detail-list">
          <div
            v-for="line in selectedBoardEvent.detailLines"
            :key="line.label"
            class="event-detail-row"
          >
            <dt>{{ line.label }}</dt>
            <dd>{{ line.value }}</dd>
          </div>
        </dl>

        <div v-if="selectedBoardEvent.notes" class="event-detail-notes">
          <h3>Notes</h3>
          <p>{{ selectedBoardEvent.notes }}</p>
        </div>

        <button
          v-if="selectedBoardEvent.actionLabel"
          type="button"
          class="event-detail-action"
          @click="handleEventAction(selectedBoardEvent)"
        >
          {{ selectedBoardEvent.actionLabel }}
        </button>

        <button
          v-if="selectedBoardEvent.dangerActionLabel"
          type="button"
          class="event-detail-action event-detail-action--danger"
          @click="handleEventDangerAction(selectedBoardEvent)"
        >
          {{ selectedBoardEvent.dangerActionLabel }}
        </button>

        <button
          v-if="selectedBoardEvent.sourceLabel === 'Booking'"
          type="button"
          class="event-detail-action event-detail-action--danger"
          :disabled="cancellingBookingId === selectedBoardEvent.id"
          @click="handleCancelBooking(selectedBoardEvent)"
        >
          {{
            cancellingBookingId === selectedBoardEvent.id
              ? "Cancelling…"
              : "Cancel booking"
          }}
        </button>
      </aside>
    </div>

    <div
      v-if="isQuickCreateMode(activeCreateMode)"
      class="modal-overlay"
      @click.self="closeCreateMode"
    >
      <div
        class="modal-card quick-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-create-title"
      >
        <div class="modal-header">
          <div>
            <p class="modal-kicker">Quick create</p>
            <h2 id="quick-create-title">{{ quickCreateHeading }}</h2>
          </div>
          <button
            type="button"
            class="icon-close"
            aria-label="Close"
            @click="closeCreateMode"
          >
            ×
          </button>
        </div>

        <div class="create-tabs" role="tablist" aria-label="Create type">
          <button
            v-for="mode in QUICK_CREATE_MODES"
            :id="`quick-create-tab-${mode}`"
            :key="mode"
            type="button"
            role="tab"
            :aria-selected="activeCreateMode === mode"
            :aria-controls="`quick-create-panel-${mode}`"
            :class="{ active: activeCreateMode === mode }"
            @click="switchQuickCreateMode(mode)"
          >
            {{ QUICK_CREATE_LABELS[mode] }}
          </button>
        </div>

        <form
          v-if="activeCreateMode === 'event'"
          id="quick-create-panel-event"
          class="booking-form"
          role="tabpanel"
          aria-labelledby="quick-create-tab-event"
          @submit.prevent="submitNewEvent"
        >
          <p class="form-hint">
            Use events for time blocks, appointments, or anything that belongs
            on your calendar without going through the booking flow.
          </p>

          <label>
            <span>Title</span>
            <input
              v-model="newEventForm.title"
              type="text"
              required
              autofocus
            />
          </label>

          <label class="checkbox-row">
            <input v-model="newEventForm.allDay" type="checkbox" @change="syncEventEndFromStart" />
            <span>All day</span>
          </label>

          <div class="field-row">
            <label>
              <span>Start date</span>
              <input v-model="newEventForm.startDate" type="date" required @change="syncEventEndFromStart" />
            </label>
            <label v-if="!newEventForm.allDay">
              <span>Start time</span>
              <input v-model="newEventForm.startTime" type="time" required @change="syncEventEndFromStart" />
            </label>
          </div>

          <div class="field-row">
            <label>
              <span>End date</span>
              <input v-model="newEventForm.endDate" type="date" required />
            </label>
            <label v-if="!newEventForm.allDay">
              <span>End time</span>
              <input v-model="newEventForm.endTime" type="time" required />
            </label>
          </div>

          <div class="field-row">
            <label>
              <span>Timezone</span>
              <input v-model="newEventForm.timezone" type="text" required />
            </label>
            <label>
              <span>Location</span>
              <input v-model="newEventForm.location" type="text" />
            </label>
          </div>

          <label>
            <span>Repeat</span>
            <select v-model="newEventForm.recurrence">
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <div
            v-if="newEventForm.recurrence === 'custom'"
            class="custom-recurrence"
          >
            <div class="field-row">
              <label>
                <span>Repeat every</span>
                <input
                  v-model.number="newEventForm.customInterval"
                  type="number"
                  min="1"
                  max="99"
                  required
                />
              </label>
              <label>
                <span>Unit</span>
                <select v-model="newEventForm.customUnit">
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </label>
            </div>

            <label>
              <span>Ends</span>
              <select v-model="newEventForm.customEnd">
                <option value="never">Never</option>
                <option value="on">On date</option>
                <option value="after">After occurrences</option>
              </select>
            </label>

            <label v-if="newEventForm.customEnd === 'on'">
              <span>End date</span>
              <input v-model="newEventForm.customUntilDate" type="date" />
            </label>

            <label v-if="newEventForm.customEnd === 'after'">
              <span>Occurrences</span>
              <input
                v-model.number="newEventForm.customCount"
                type="number"
                min="1"
                max="999"
              />
            </label>
          </div>

          <label>
            <span>Notes</span>
            <textarea
              v-model="newEventForm.notes"
              rows="3"
              maxlength="2000"
              placeholder="Optional"
            />
          </label>

          <p v-if="newEventError" class="form-error">{{ newEventError }}</p>

          <div class="modal-actions">
            <Button
              size="small"
              type="button"
              color="outline"
              @click="closeCreateMode"
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="submit"
              color="primary"
              :disabled="newEventSubmitting"
            >
              {{
                newEventSubmitting
                  ? editingEventId
                    ? "Updating…"
                    : "Creating…"
                  : editingEventId
                    ? "Update event"
                    : "Create event"
              }}
            </Button>
          </div>
        </form>

        <form
          v-else-if="activeCreateMode === 'birthday'"
          id="quick-create-panel-birthday"
          class="booking-form"
          role="tabpanel"
          aria-labelledby="quick-create-tab-birthday"
          @submit.prevent="submitNewBirthday"
        >
          <p class="form-hint">
            Birthdays are all-day events that repeat every year.
          </p>

          <label>
            <span>Name</span>
            <input
              v-model="newBirthdayForm.name"
              type="text"
              required
              autofocus
            />
          </label>

          <label>
            <span>Birthday</span>
            <input v-model="newBirthdayForm.date" type="date" required />
          </label>

          <label>
            <span>Notes</span>
            <textarea
              v-model="newBirthdayForm.notes"
              rows="3"
              maxlength="2000"
              placeholder="Optional"
            />
          </label>

          <p v-if="newEventError" class="form-error">{{ newEventError }}</p>

          <div class="modal-actions">
            <Button
              size="small"
              type="button"
              color="outline"
              @click="closeCreateMode"
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="submit"
              color="primary"
              :disabled="newEventSubmitting"
            >
              {{
                newEventSubmitting
                  ? editingEventId
                    ? "Updating…"
                    : "Creating…"
                  : editingEventId
                    ? "Update birthday"
                    : "Create birthday"
              }}
            </Button>
          </div>
        </form>

        <form
          v-else-if="activeCreateMode === 'reminder'"
          id="quick-create-panel-reminder"
          class="booking-form"
          role="tabpanel"
          aria-labelledby="quick-create-tab-reminder"
          @submit.prevent="submitNewReminder"
        >
          <p class="form-hint">
            Reminders use your selected timezone and stay in sync with the ME3
            agent reminder system.
          </p>

          <label>
            <span>Title</span>
            <input
              v-model="newReminderForm.title"
              type="text"
              required
              autofocus
            />
          </label>

          <div class="field-row">
            <label>
              <span>Date</span>
              <input v-model="newReminderForm.date" type="date" required />
            </label>
            <label>
              <span>Time</span>
              <input v-model="newReminderForm.time" type="time" required />
            </label>
          </div>

          <div class="field-row">
            <label>
              <span>Timezone</span>
              <input v-model="newReminderForm.timezone" type="text" required />
            </label>
            <label>
              <span>Repeat</span>
              <select v-model="newReminderForm.recurrence">
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>

          <label>
            <span>Notes</span>
            <textarea
              v-model="newReminderForm.notes"
              rows="3"
              maxlength="2000"
              placeholder="Optional"
            />
          </label>

          <p v-if="newReminderError" class="form-error">
            {{ newReminderError }}
          </p>

          <div class="modal-actions">
            <Button
              size="small"
              type="button"
              color="outline"
              @click="closeCreateMode"
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="submit"
              color="primary"
              :disabled="newReminderSubmitting"
            >
              {{
                newReminderSubmitting
                  ? editingReminderId
                    ? "Updating…"
                    : "Creating…"
                  : editingReminderId
                    ? "Update reminder"
                    : "Create reminder"
              }}
            </Button>
          </div>
        </form>

        <form
          v-else
          id="quick-create-panel-booking"
          class="booking-form"
          role="tabpanel"
          aria-labelledby="quick-create-tab-booking"
          @submit.prevent="submitNewBooking"
        >
          <p class="form-hint">
            Times use your site’s booking timezone from me.json. Confirmation
            emails and reminders follow your site’s booking settings.
          </p>

          <label>
            <span>Site</span>
            <select v-model="newBookingForm.username" required>
              <option disabled value="">Select a site</option>
              <option
                v-for="s in sites.sites"
                :key="s.username"
                :value="s.username"
              >
                {{ s.username }}.example.com
              </option>
            </select>
          </label>

          <label>
            <span>Guest name</span>
            <input
              v-model="newBookingForm.guestName"
              type="text"
              autocomplete="name"
              required
              autofocus
            />
          </label>

          <label>
            <span>Guest email</span>
            <input
              v-model="newBookingForm.guestEmail"
              type="email"
              autocomplete="email"
              required
            />
          </label>

          <div class="field-row">
            <label>
              <span>Date</span>
              <input v-model="newBookingForm.date" type="date" required />
            </label>
            <label>
              <span>Start time</span>
              <input v-model="newBookingForm.startTime" type="time" required />
            </label>
          </div>

          <label>
            <span>Duration (minutes)</span>
            <select v-model.number="newBookingForm.durationMinutes">
              <option :value="15">15</option>
              <option :value="30">30</option>
              <option :value="45">45</option>
              <option :value="60">60</option>
              <option :value="90">90</option>
              <option :value="120">120</option>
            </select>
          </label>

          <label>
            <span>Notes</span>
            <textarea
              v-model="newBookingForm.notes"
              rows="3"
              maxlength="2000"
              placeholder="Optional"
            />
          </label>

          <p v-if="newBookingError" class="form-error">{{ newBookingError }}</p>

          <div class="modal-actions">
            <Button
              size="small"
              type="button"
              color="outline"
              @click="closeCreateMode"
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="submit"
              color="primary"
              :disabled="newBookingSubmitting"
            >
              {{ newBookingSubmitting ? "Creating…" : "Create booking" }}
            </Button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="activeCreateMode === 'import'"
      class="modal-overlay"
      @click.self="closeCreateMode"
    >
      <div
        class="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-calendar-title"
      >
        <div class="modal-header">
          <h2 id="import-calendar-title">Sync calendar</h2>
          <button
            type="button"
            class="icon-close"
            aria-label="Close"
            @click="closeCreateMode"
          >
            ×
          </button>
        </div>

        <form class="booking-form" @submit.prevent="submitImport">
          <div class="create-tabs" role="tablist" aria-label="Calendar sync method">
            <button
              type="button"
              role="tab"
              :aria-selected="importForm.mode === 'url'"
              :class="{ active: importForm.mode === 'url' }"
              @click="importForm.mode = 'url'"
            >
              Subscribe
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="importForm.mode === 'file'"
              :class="{ active: importForm.mode === 'file' }"
              @click="importForm.mode = 'file'"
            >
              Upload
            </button>
          </div>

          <p class="form-hint">
            <template v-if="importForm.mode === 'url'">
              Paste a Google, Apple, or Outlook `.ics` subscription URL. ME3
              will keep it as a read-only source and refresh it automatically.
            </template>
            <template v-else>
              Upload an `.ics` export to bring an external calendar into ME3 as
              a read-only source.
            </template>
          </p>

          <label>
            <span>Calendar name</span>
            <input
              v-model="importForm.name"
              type="text"
              placeholder="Optional"
            />
          </label>

          <label v-if="importForm.mode === 'url'">
            <span>Subscription URL</span>
            <input
              v-model="importForm.url"
              type="url"
              inputmode="url"
              placeholder="https://calendar.google.com/calendar/ical/..."
              autocomplete="off"
            />
          </label>

          <label v-else>
            <span>.ics file</span>
            <input
              accept=".ics,text/calendar"
              type="file"
              @change="onImportFileChange"
            />
          </label>

          <p v-if="importError" class="form-error">{{ importError }}</p>

          <div class="modal-actions">
            <Button
              size="small"
              type="button"
              color="outline"
              @click="closeCreateMode"
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="submit"
              color="primary"
              :disabled="importSubmitting"
            >
              {{ importSubmitLabel }}
            </Button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="availabilityModalOpen"
      class="modal-overlay"
      @click.self="closeAvailabilitySettings"
    >
      <div
        class="modal-card availability-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Booking availability"
      >
        <div class="modal-header modal-header--actions-only">
          <button
            type="button"
            class="icon-close"
            aria-label="Close"
            @click="closeAvailabilitySettings"
          >
            ×
          </button>
        </div>

        <form class="availability-form" @submit.prevent="saveAvailabilitySettings">
          <PageLoading
            v-if="availabilityLoading"
            compact
            label="Loading availability..."
          />
          <BookingAvailabilityEditor
            v-else
            v-model:availability="availabilityDraft"
            v-model:buffer-time="availabilityBufferTime"
            v-model:timezone="availabilityTimezone"
            description="Set or update your availability here."
          />

          <p v-if="availabilityError" class="form-error">
            {{ availabilityError }}
          </p>

          <div class="modal-actions">
            <Button
              size="small"
              type="button"
              color="outline"
              :disabled="availabilitySaving"
              @click="closeAvailabilitySettings"
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="submit"
              color="primary"
              :disabled="
                availabilityLoading ||
                availabilitySaving ||
                !availabilitySourceProfile
              "
            >
              {{ availabilitySaving ? "Saving…" : "Save availability" }}
            </Button>
          </div>
        </form>
      </div>
    </div>

  </div>
</template>

<style scoped>
:global(body) {
  background: var(--color-bg);
}

.calendar-spike {
  --cal-grid: color-mix(in oklab, var(--color-border) 88%, transparent);
  --cal-surface: var(--color-bg);
  --cal-subtle: var(--color-bg-subtle);
  --cal-muted: var(--color-text-muted);
  --cal-hover: color-mix(in oklab, var(--color-text) 6%, transparent);
  --cal-today-bg: color-mix(in oklab, var(--color-text) 5%, transparent);
  --cal-chip: color-mix(in oklab, var(--color-text) 8%, var(--color-bg));
  --cal-accent: #7dbaf9;
}

.ops-page {
  min-height: 100vh;
  color: var(--color-text);
}

.main {
  max-width: 1680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 24px 40px;
}

.cal-toolbar {
  display: none;
}

.cal-mobile-nav-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px 36px 36px;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.cal-period-switcher--mobile {
  grid-template-columns: 32px auto 32px;
  justify-self: start;
  width: max-content;
  max-width: 100%;
  min-width: 0;
}

.cal-period-switcher--mobile .cal-arrow {
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
}

.cal-period-switcher--mobile .cal-period-title {
  min-height: 32px;
  max-width: min(220px, calc(100vw - 220px));
  padding-inline: 6px;
  font-size: 14px;
}

.cal-create-menu--mobile-nav,
.cal-settings-menu--mobile-nav {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  left: auto;
  width: min(220px, calc(100vw - 32px));
}

:global(#app-side-nav-mobile-page-controls:has(.cal-mobile-nav-controls)) {
  min-height: var(--app-shell-mobile-nav-height);
  height: var(--app-shell-mobile-nav-height);
  overflow: visible;
  padding: var(--workspace-topbar-padding-block) 8px
    var(--workspace-topbar-padding-block)
    var(--app-shell-mobile-nav-leading-padding);
}

.cal-toolbar-left {
  display: flex;
  align-items: center;
  justify-self: start;
  min-width: 0;
}

.cal-period-switcher {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(148px, 240px) 36px;
  align-items: center;
  justify-self: center;
  gap: 4px;
  min-width: 0;
}

.cal-arrow {
  flex: 0 0 auto;
}

.cal-period-title {
  display: inline-flex;
  min-width: 0;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.cal-period-title:hover,
.cal-period-title[aria-expanded="true"] {
  background: var(--ui-surface-muted);
}

.cal-view-toggle {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.cal-view-toggle button {
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
}

.cal-view-toggle button:hover,
.cal-view-toggle button.is-on {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.cal-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  justify-self: end;
  gap: 8px;
  min-width: 0;
}

.cal-error-banner {
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  font-size: 14px;
}

.cal-error-banner {
  color: #b33b2e;
}

.cal-shell {
  position: relative;
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.cal-shell--refreshing .cal-board-wrap {
  opacity: 0.72;
  transition: opacity 140ms ease;
}

.cal-refresh-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  padding: 6px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  box-shadow: var(--ui-shadow-sm);
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
}

.cal-sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cal-create-wrap {
  position: relative;
}

.cal-create-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 10;
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: 0 18px 50px color-mix(in oklab, #000, transparent 86%);
}

.cal-create-menu--toolbar {
  right: 0;
  left: auto;
  width: 190px;
}

.cal-create-menu.cal-create-menu--mobile-nav,
.cal-create-menu.cal-settings-menu--mobile-nav {
  top: calc(100% + 8px);
  right: 0;
  left: auto;
  width: min(220px, calc(100vw - 32px));
}

.cal-settings-menu--toolbar {
  width: 180px;
}

.cal-create-menu button {
  padding: 10px 12px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.cal-create-menu button:hover {
  background: var(--ui-surface-muted);
}

.cal-settings-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cal-filters-title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.cal-filters {
  padding-top: 4px;
}

.cal-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.cal-filter-row--with-action {
  gap: 6px;
  cursor: default;
}

.cal-filter-choice {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
}

.cal-filter-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.cal-filter-action:hover:not(:disabled),
.cal-filter-action:focus-visible {
  border-color: color-mix(in oklab, #b33b2e, var(--ui-border) 50%);
  background: color-mix(in oklab, #b33b2e, transparent 90%);
  color: #b33b2e;
}

.cal-filter-action:disabled {
  cursor: wait;
  opacity: 0.5;
}

.cal-filter-input {
  accent-color: var(--color-text);
}

.cal-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.cal-swatch--neutral {
  background: linear-gradient(
    135deg,
    var(--color-border-strong) 0%,
    var(--color-text-muted) 100%
  );
}

.cal-swatch--muted {
  background: #9aa0a6;
}

.cal-filter-label {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-filter-meta {
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
}

.cal-filter-meta--error {
  color: #b33b2e;
}

.cal-board-wrap {
  min-width: 0;
}

.cal-detail-wrap {
  min-width: 0;
  position: sticky;
  top: 12px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.32);
}

.modal-card {
  width: min(100%, 480px);
  max-height: min(90vh, 720px);
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg);
  padding: 24px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.12);
}

.quick-create-modal {
  width: min(100%, 560px);
}

.event-detail-modal {
  width: min(100%, 520px);
}

.availability-modal {
  position: relative;
  width: min(100%, 760px);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
}

.modal-header--actions-only {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 1;
  justify-content: flex-end;
  margin: 0;
}

.modal-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.event-detail-summary,
.event-detail-site {
  margin: 0 0 14px;
  color: var(--color-text-muted);
}

.event-detail-time {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
}

.event-detail-list {
  display: grid;
  gap: 10px;
  margin: 18px 0 0;
}

.event-detail-row {
  display: grid;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

.event-detail-row dt,
.event-detail-notes h3 {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.event-detail-row dd {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.event-detail-notes {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.event-detail-notes h3 {
  margin: 0 0 8px;
}

.event-detail-notes p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.event-detail-action {
  margin-top: 18px;
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.event-detail-action--danger {
  margin-top: 10px;
}

.event-detail-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.icon-close {
  border: 0;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-muted);
}

.create-tabs {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 18px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg-subtle);
}

.create-tabs button {
  min-width: 84px;
  padding: 8px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.create-tabs button:hover {
  color: var(--color-text);
}

.create-tabs button.active {
  background: var(--color-text);
  color: var(--color-bg);
}

.booking-form {
  display: grid;
  gap: 14px;
}

.availability-form {
  display: grid;
  gap: 16px;
}

.availability-modal :deep(.booking-availability-editor) {
  padding: 0;
  border-top: 0;
}

.form-hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.booking-form label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.checkbox-row {
  display: flex !important;
  align-items: center;
  gap: 8px;
}

.checkbox-row input {
  width: 16px;
  height: 16px;
  margin: 0;
}

.booking-form input,
.booking-form select,
.booking-form textarea {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-subtle);
  color: var(--color-text);
  font: inherit;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-error {
  margin: 0;
  font-size: 13px;
  color: #b33b2e;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

@media (max-width: 1100px) {
  .cal-shell {
    grid-template-columns: 1fr;
  }

  .cal-detail-wrap {
    position: static;
  }

  .cal-sidebar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .cal-filters {
    grid-column: 1 / -1;
  }
}

@media (min-width: 960px) and (max-width: 1100px) {
  .cal-sidebar {
    display: none;
  }
}

.cal-mobile-icon-btn {
  flex: 0 0 auto;
}

.cal-toolbar-icon-btn {
  width: 36px;
  height: 36px;
}

.cal-mobile-create-wrap,
.cal-mobile-settings-wrap {
  position: relative;
}

@media (max-width: 959px) {
  .ops-page {
    padding: 0;
  }

  .main {
    padding: 0;
  }

  .cal-sidebar {
    grid-template-columns: 1fr;
  }

  .cal-sidebar {
    display: none;
  }

  .cal-shell {
    display: block;
  }

  .cal-board-wrap {
    width: 100%;
  }

  .field-row {
    grid-template-columns: 1fr;
  }

  .create-tabs {
    display: flex;
  }

  .create-tabs button {
    min-width: 0;
    flex: 1;
    padding-inline: 10px;
  }
}
</style>
