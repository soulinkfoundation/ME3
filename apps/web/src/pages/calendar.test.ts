import { defineComponent } from "vue";
import {
  enableAutoUnmount,
  flushPromises,
  mount,
} from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useSitesStore } from "../stores/sites";
import CalendarPage from "./calendar.vue";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => router,
}));

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const CalendarMonthBoardStub = defineComponent({
  name: "CalendarMonthBoard",
  props: {
    events: { type: Array, default: () => [] },
  },
  emits: ["select-event", "select-day", "show-day"],
  template: '<div class="calendar-month-board-stub" />',
});

enableAutoUnmount(afterEach);

describe("Calendar Social Publishing source", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const sites = useSitesStore();
    sites.sites = [{
      id: "site-1",
      username: "kieran",
      user_id: "owner",
      custom_domain: null,
      custom_domain_status: null,
      created_at: "2026-07-01T08:00:00.000Z",
      updated_at: "2026-07-18T08:00:00.000Z",
      published_at: "2026-07-01T08:00:00.000Z",
    }];
    sites.fetchSites = vi.fn(async () => undefined) as never;
  });

  it("shows a toggleable source and deep-links the exact projected Publication", async () => {
    vi.mocked(api.get).mockResolvedValue(calendarFeed(true));
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Social publishing");
    const monthBoard = wrapper.getComponent(CalendarMonthBoardStub);
    const projected = (monthBoard.props("events") as Array<Record<string, unknown>>)
      .find((event) => event.entryType === "social_publication");
    expect(projected).toMatchObject({
      id: "social-publication:publication-1",
      recordId: "publication-1",
      title: "A source-backed launch Post",
      summary: "Planned · LinkedIn · Kieran Butler",
      actionLabel: "Open Publication",
    });

    monthBoard.vm.$emit("select-event", projected?.id, {
      left: 20,
      right: 40,
      top: 20,
      bottom: 40,
      trigger: document.createElement("button"),
    });
    await flushPromises();
    const action = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Open Publication");
    expect(action).toBeTruthy();
    await action!.trigger("click");

    expect(router.push).toHaveBeenCalledWith({
      path: "/social",
      query: {
        siteId: "site-1",
        postId: "post-1",
        versionId: "version-1",
        publicationId: "publication-1",
      },
    });
  });

  it("shows neither the source nor records when the plugin is not ready", async () => {
    vi.mocked(api.get).mockResolvedValue(calendarFeed(false));
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain("Social publishing");
    const events = wrapper
      .getComponent(CalendarMonthBoardStub)
      .props("events") as Array<Record<string, unknown>>;
    expect(events.some((event) => event.entryType === "social_publication")).toBe(false);
  });
});

function mountPage() {
  return mount(CalendarPage, {
    global: {
      stubs: {
        Teleport: true,
        CalendarAgenda: { template: '<div class="calendar-agenda-stub" />' },
        CalendarMiniMonth: { template: "<div />" },
        CalendarMonthBoard: CalendarMonthBoardStub,
        CalendarWeekBoard: { template: "<div />" },
        DatePickerPopover: { template: "<div />" },
        CalendarQuickEventPopover: { template: "<div />" },
        BookingAvailabilityEditor: { template: "<div />" },
      },
    },
  });
}

function calendarFeed(ready: boolean) {
  return {
    bookings: [],
    reminders: [],
    events: [],
    importedEvents: [],
    sources: [],
    tasks: [],
    socialPublishing: {
      ready,
      publications: ready
        ? [{
            id: "publication-1",
            siteId: "site-1",
            postId: "post-1",
            postTitle: "A source-backed launch Post",
            versionId: "version-1",
            versionLabel: "LinkedIn Version",
            platform: "linkedin",
            accountId: "account-1",
            accountLabel: "Kieran Butler",
            publicationStatus: "scheduled",
            calendarState: "planned",
            sourceType: "journal",
            sourceRef: "journal:entry-1",
            sourceLabel: "Journal",
            displayAt: "2026-07-20T09:30:00.000Z",
            scheduledFor: "2026-07-20T09:30:00.000Z",
            publishedAt: null,
            timezone: "Europe/Dublin",
            platformPostUrl: null,
            errorMessage: null,
          }]
        : [],
    },
  };
}
