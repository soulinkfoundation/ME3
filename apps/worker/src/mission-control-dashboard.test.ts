import { describe, expect, it } from "vitest";
import {
  createMissionWheelSnapshot,
  getMissionDashboard,
  getMissionWheel,
  updateMissionDashboard,
  updateMissionWheelSettings,
} from "./mission-control";
import type { Env } from "./types";

type DashboardSettingsRow = {
  user_id: string;
  cards_json: string;
  quick_links_json: string;
  settings_json: string;
  mission_statement: string | null;
  created_at: string;
  updated_at: string;
};

type PluginInstallationRow = {
  plugin_id: string;
  version: string;
  enabled: number;
  status: string;
  granted_permissions_json: string;
  setup_state_json: string;
  installed_at: string;
  updated_at: string;
};

type WheelSettingsRow = {
  user_id: string;
  segments_json: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
};

type WheelSnapshotRow = {
  id: string;
  user_id: string;
  segments_json: string;
  notes_json: string;
  created_at: string;
};

describe("Mission Control dashboard settings", () => {
  it("creates stable defaults for a new owner", async () => {
    const env = createDashboardEnv({
      enabledPlugins: ["me3.journal", "me3.social-publishing"],
      activity: [
        {
          id: "activity-1",
          user_id: "owner",
          plugin_id: "me3.assistant-jobs",
          activity_type: "assistant_job.review_packet",
          title: "Daily Briefing",
          summary: null,
          status: "succeeded",
          related_id: "run-1",
          metadata_json: JSON.stringify({
            dailyBriefing: {
              date: "2026-06-04",
              message: "A calm operational day.",
            },
          }),
          created_at: "2026-06-04 08:15:00",
        },
      ],
    });

    const dashboard = await getMissionDashboard(env, "owner");

    expect(
      dashboard.cards.filter((card) => card.enabled).map((card) => card.cardId),
    ).toEqual([
      "mission.daily-briefing",
      "mission.mission-statement",
      "mission.wheel-latest-snapshot",
    ]);
    expect(dashboard.availableCards.map((card) => card.id)).toEqual(
      expect.arrayContaining([
        "mission.projects-summary",
        "journal.latest-entry",
        "social.queue-summary",
      ]),
    );
    expect(dashboard.quickLinks.map((link) => link.destinationId)).toEqual([
      "mission.projects",
      "assistant.chat",
      "journal.today",
      "social.schedule",
    ]);
    expect(dashboard.settings).toEqual({ kanbanEnabled: false });
    expect(dashboard.missionStatement).toContain("I am here to help");
    expect(dashboard.data["mission.daily-briefing"]).toMatchObject({
      message: "A calm operational day.",
      createdAt: "2026-06-04T08:15:00Z",
    });
  });

  it("normalizes dashboard updates through curated cards and destinations", async () => {
    const env = createDashboardEnv({ enabledPlugins: ["me3.journal"] });

    const dashboard = await updateMissionDashboard(env, "owner", {
      missionStatement: "  Help owners steer the day.  ",
      kanbanEnabled: true,
      cards: [
        {
          cardId: "mission.wheel-latest-snapshot",
          enabled: false,
          size: "wide",
          sortOrder: 0,
        },
        {
          cardId: "unknown.card",
          enabled: true,
          size: "wide",
          sortOrder: 1,
        },
      ],
      quickLinks: [
        {
          id: "mission.projects",
          label: "Projects",
          icon: "ListChecks",
          enabled: true,
          sortOrder: 0,
          destinationId: "mission.projects",
        },
        {
          id: "bad",
          label: "Bad route",
          icon: "AlertTriangle",
          enabled: true,
          sortOrder: 1,
          destinationId: "https://example.test",
        },
      ],
    });

    expect(dashboard.missionStatement).toBe("Help owners steer the day.");
    expect(dashboard.settings).toEqual({ kanbanEnabled: true });
    expect(dashboard.cards.find((card) => card.cardId === "unknown.card")).toBeUndefined();
    expect(
      dashboard.cards.find((card) => card.cardId === "mission.wheel-latest-snapshot"),
    ).toMatchObject({
      enabled: false,
      size: "wide",
      sortOrder: 0,
    });
    expect(dashboard.quickLinks.map((link) => link.id)).toEqual([
      "mission.projects",
      "assistant.chat",
      "journal.today",
    ]);
    expect(dashboard.quickLinks[0]).toMatchObject({
      label: "Projects",
      destinationId: "mission.projects",
    });
  });

  it("persists Wheel settings and snapshots for the dashboard card", async () => {
    const env = createDashboardEnv();
    const segments = [
      "health",
      "spirituality",
      "work",
      "finances",
      "home",
      "joy",
    ].map((id, index) => ({
      id,
      label: id,
      helper: `${id} helper`,
      color: "#26806f",
      emoji: "Circle",
      value: index + 1,
    }));

    await updateMissionWheelSettings(env, "owner", { segments });
    const wheel = await getMissionWheel(env, "owner");
    expect(wheel.settings.segments.map((segment) => segment.value)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);

    await createMissionWheelSnapshot(env, "owner", {
      id: "snapshot-1",
      createdAt: "2026-06-04T09:30:00.000Z",
      segments,
      notes: { health: "Slept well." },
    });

    const dashboard = await getMissionDashboard(env, "owner");
    expect(dashboard.data["mission.wheel-latest-snapshot"]).toMatchObject({
      source: "server",
      snapshot: {
        id: "snapshot-1",
        createdAt: "2026-06-04T09:30:00.000Z",
      },
    });
    expect(
      dashboard.data["mission.wheel-latest-snapshot"]?.snapshot?.segments[0],
    ).toMatchObject({ id: "health", notes: "Slept well." });
  });

  it("preserves inactive plugin dashboard settings while marking them unavailable", async () => {
    const env = createDashboardEnv({
      dashboardSettings: {
        cards_json: JSON.stringify([
          {
            cardId: "journal.latest-entry",
            enabled: true,
            size: "medium",
            sortOrder: 0,
          },
        ]),
        quick_links_json: JSON.stringify([
          {
            id: "journal.today",
            label: "Journal",
            icon: "BookOpen",
            enabled: true,
            sortOrder: 0,
            destinationId: "journal.today",
          },
        ]),
      },
    });

    const dashboard = await getMissionDashboard(env, "owner");

    expect(dashboard.availableCards.map((card) => card.id)).not.toContain(
      "journal.latest-entry",
    );
    expect(dashboard.cards.find((card) => card.cardId === "journal.latest-entry"))
      .toMatchObject({ enabled: true, available: false });
    expect(dashboard.quickLinks.find((link) => link.id === "journal.today"))
      .toMatchObject({ enabled: true, available: false });
  });
});

function createDashboardEnv(options: {
  enabledPlugins?: string[];
  activity?: Array<Record<string, unknown> & { id: string; user_id: string }>;
  dashboardSettings?: Partial<DashboardSettingsRow>;
} = {}) {
  const settings = new Map<string, DashboardSettingsRow>();
  const wheelSettings = new Map<string, WheelSettingsRow>();
  const wheelSnapshots = new Map<string, WheelSnapshotRow>();
  const enabledPlugins = new Set(options.enabledPlugins || []);
  const activity = options.activity || [];
  const pluginInstallations = new Map<string, PluginInstallationRow>(
    Array.from(enabledPlugins).map((pluginId) => [
      pluginId,
      {
        plugin_id: pluginId,
        version: "0.1.0",
        enabled: 1,
        status: "installed",
        granted_permissions_json: "[]",
        setup_state_json: "{}",
        installed_at: "2026-06-04 08:00:00",
        updated_at: "2026-06-04 08:00:00",
      },
    ]),
  );
  if (options.dashboardSettings) {
    settings.set("owner", {
      user_id: "owner",
      cards_json: options.dashboardSettings.cards_json || "[]",
      quick_links_json: options.dashboardSettings.quick_links_json || "[]",
      settings_json: options.dashboardSettings.settings_json || "{}",
      mission_statement: options.dashboardSettings.mission_statement || null,
      created_at: "2026-06-04 08:00:00",
      updated_at: "2026-06-04 08:00:00",
    });
  }

  const db = {
    prepare(sql: string) {
      return {
        async all<T>() {
          if (sql.includes("plugin_installations")) {
            return {
              results: Array.from(pluginInstallations.values()) as T[],
            };
          }
          return { results: [] as T[] };
        },
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("mission_dashboard_settings")) {
                return (settings.get(String(values[0])) || null) as T | null;
              }
              if (sql.includes("mission_wheel_settings")) {
                return (wheelSettings.get(String(values[0])) || null) as T | null;
              }
              if (sql.includes("mission_wheel_snapshots")) {
                if (sql.includes("WHERE id = ?")) {
                  return (wheelSnapshots.get(String(values[0])) || null) as T | null;
                }
                return null;
              }
              if (sql.includes("plugin_installations")) {
                return (pluginInstallations.get(String(values[0])) || null) as T | null;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("plugin_installations")) {
                return {
                  results: Array.from(pluginInstallations.values()) as T[],
                };
              }
              if (sql.includes("mission_wheel_snapshots")) {
                const userId = String(values[0]);
                const limit = Number(values[1] || 50);
                return {
                  results: Array.from(wheelSnapshots.values())
                    .filter((row) => row.user_id === userId)
                    .sort((a, b) =>
                      String(b.created_at).localeCompare(String(a.created_at)),
                    )
                    .slice(0, limit) as T[],
                };
              }
              if (sql.includes("mission_plugin_activity")) {
                return {
                  results: activity
                    .filter((row) => row.user_id === values[0])
                    .sort((a, b) =>
                      String(b.created_at).localeCompare(String(a.created_at)),
                    ) as T[],
                };
              }
              return { results: [] as T[] };
            },
            async run() {
              if (sql.includes("mission_dashboard_settings")) {
                const userId = String(values[0]);
                settings.set(userId, {
                  user_id: userId,
                  cards_json: String(values[1]),
                  quick_links_json: String(values[2]),
                  settings_json: String(values[3]),
                  mission_statement:
                    values[4] === null || values[4] === undefined
                      ? null
                      : String(values[4]),
                  created_at: "2026-06-04 08:00:00",
                  updated_at: "2026-06-04 08:00:00",
                });
              }
              if (sql.includes("mission_wheel_settings")) {
                const userId = String(values[0]);
                wheelSettings.set(userId, {
                  user_id: userId,
                  segments_json: String(values[1]),
                  schema_version: 1,
                  created_at: "2026-06-04 08:00:00",
                  updated_at: "2026-06-04 08:00:00",
                });
              }
              if (sql.includes("mission_wheel_snapshots")) {
                const id = String(values[0]);
                wheelSnapshots.set(id, {
                  id,
                  user_id: String(values[1]),
                  segments_json: String(values[2]),
                  notes_json: String(values[3]),
                  created_at: String(values[4]),
                });
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  return { DB: db as unknown as D1Database } as Env;
}
