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
    patch: vi.fn(),
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
    window.confirm = vi.fn(() => true);

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

  it("shows a toggleable source and manages the exact projected Publication", async () => {
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
      actionLabel: "Manage schedule",
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
      .find((button) => button.text().trim() === "Manage schedule");
    expect(action).toBeTruthy();
    await action!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Reschedule Publication");
    expect(wrapper.text()).toContain(
      "The approved Version, account, copy, and media stay unchanged.",
    );
    const open = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Open in Social Publishing");
    await open!.trigger("click");

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

  it("reschedules with the Publication timezone and stale-state token", async () => {
    vi.mocked(api.get).mockResolvedValue(calendarFeed(true));
    vi.mocked(api.patch).mockResolvedValue({
      publication: { id: "publication-1" },
      result: { action: "rescheduled", approvalPreserved: true },
    });
    const wrapper = mountPage();
    await flushPromises();

    await openProjectedPublication(wrapper);
    const form = wrapper.get("#quick-create-panel-social");
    await form.get('input[type="date"]').setValue("2099-07-21");
    await form.get('input[type="time"]').setValue("10:30");
    await form.trigger("submit");
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith(
      "/social/publications/publication-1",
      {
        scheduledFor: "2099-07-21T09:30:00.000Z",
        timezone: "Europe/Dublin",
        expectedUpdatedAt: "2026-07-18T08:00:00.000Z",
        requestContext: { surface: "calendar", view: "month" },
      },
    );
  });

  it("cancels a planned Publication by exact Publication id", async () => {
    vi.mocked(api.get).mockResolvedValue(calendarFeed(true));
    vi.mocked(api.delete).mockResolvedValue({
      result: { action: "cancelled", publicationId: "publication-1" },
    });
    const wrapper = mountPage();
    await flushPromises();

    await openProjectedPublication(wrapper);
    const cancel = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Cancel Publication");
    await cancel!.trigger("click");
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledWith(
      "Cancel this planned Publication?",
    );
    expect(api.delete).toHaveBeenCalledWith(
      "/social/publications/publication-1",
    );
  });

  it("keeps a stale scheduling error visible for the owner", async () => {
    vi.mocked(api.get).mockResolvedValue(calendarFeed(true));
    vi.mocked(api.patch).mockRejectedValue(
      new Error(
        "This Publication changed after Calendar loaded it. Refresh and try again.",
      ),
    );
    const wrapper = mountPage();
    await flushPromises();

    await openProjectedPublication(wrapper);
    const form = wrapper.get("#quick-create-panel-social");
    await form.get('input[type="date"]').setValue("2099-07-21");
    await form.trigger("submit");
    await flushPromises();

    const alert = wrapper
      .findAll('[role="alert"]')
      .find((node) => node.text().includes("changed after Calendar loaded"));
    expect(alert?.text()).toContain("Refresh and try again.");
  });

  it("opens an approved-Version chooser from an empty Calendar slot", async () => {
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint.startsWith("/calendar/feed?")) {
        return Promise.resolve(calendarFeed(true));
      }
      if (endpoint === "/social/scheduling/approved-versions") {
        return Promise.resolve({ versions: [approvedVersion()] });
      }
      throw new Error(`Unexpected GET ${endpoint}`);
    });
    vi.mocked(api.post).mockResolvedValue({
      publication: { id: "publication-new" },
      result: { action: "scheduled" },
    });
    const wrapper = mountPage();
    await flushPromises();

    wrapper
      .getComponent(CalendarMonthBoardStub)
      .vm.$emit("select-day", "2099-07-20");
    await flushPromises();
    const scheduleSocial = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Schedule social");
    await scheduleSocial!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Choose an exact approved Version.");
    expect(wrapper.text()).toContain("A source-backed launch Post");
    const form = wrapper.get("#quick-create-panel-social");
    expect(form.text().toLowerCase()).not.toContain("package");
    expect(form.text().toLowerCase()).not.toContain("variant");
    expect(form.text().toLowerCase()).not.toContain("occurrence");
    await form.get('input[type="time"]').setValue("10:30");
    await form.get('input[type="text"]').setValue("Europe/Dublin");
    await form.trigger("submit");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(
      "/social/versions/version-1/publications",
      {
        scheduledFor: "2099-07-20T09:30:00.000Z",
        timezone: "Europe/Dublin",
        requestContext: { surface: "calendar", view: "month" },
      },
    );
  });

  it("asks the owner to choose another time when fall-back repeats a wall time", async () => {
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint.startsWith("/calendar/feed?")) {
        return Promise.resolve(calendarFeed(true));
      }
      if (endpoint === "/social/scheduling/approved-versions") {
        return Promise.resolve({ versions: [approvedVersion()] });
      }
      throw new Error(`Unexpected GET ${endpoint}`);
    });
    const wrapper = mountPage();
    await flushPromises();

    wrapper
      .getComponent(CalendarMonthBoardStub)
      .vm.$emit("select-day", "2099-11-01");
    await flushPromises();
    const scheduleSocial = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Schedule social");
    await scheduleSocial!.trigger("click");
    await flushPromises();

    const form = wrapper.get("#quick-create-panel-social");
    await form.get('input[type="time"]').setValue("01:30");
    await form.get('input[type="text"]').setValue("America/New_York");
    await form.trigger("submit");
    await flushPromises();

    const alert = wrapper
      .findAll('[role="alert"]')
      .find((node) => node.text().includes("occurs twice"));
    expect(alert?.text()).toContain("clocks move back");
    expect(api.post).not.toHaveBeenCalled();
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

async function openProjectedPublication(wrapper: ReturnType<typeof mountPage>) {
  const monthBoard = wrapper.getComponent(CalendarMonthBoardStub);
  const projected = (monthBoard.props("events") as Array<Record<string, unknown>>)
    .find((event) => event.entryType === "social_publication");
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
    .find((button) => button.text().trim() === "Manage schedule");
  await action!.trigger("click");
  await flushPromises();
}

function approvedVersion() {
  return {
    versionId: "version-1",
    postId: "post-1",
    siteId: "site-1",
    postTitle: "A source-backed launch Post",
    versionLabel: "LinkedIn Version",
    platform: "linkedin",
    accountId: "account-1",
    accountLabel: "Kieran Butler",
    sourceLabel: "Journal",
    approvedAt: "2026-07-18T07:30:00.000Z",
  };
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
            updatedAt: "2026-07-18T08:00:00.000Z",
          }]
        : [],
    },
  };
}
