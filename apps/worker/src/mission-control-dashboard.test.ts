import { describe, expect, it } from "vitest";
import { getMissionDashboard, updateMissionDashboard } from "./mission-control";
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

    expect(dashboard.cards.map((card) => card.cardId)).toEqual([
      "mission.daily-briefing",
      "mission.mission-statement",
      "mission.wheel-latest-snapshot",
    ]);
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
});

function createDashboardEnv(options: {
  enabledPlugins?: string[];
  activity?: Array<Record<string, unknown> & { id: string; user_id: string }>;
} = {}) {
  const settings = new Map<string, DashboardSettingsRow>();
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

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("mission_dashboard_settings")) {
                return (settings.get(String(values[0])) || null) as T | null;
              }
              if (sql.includes("plugin_installations")) {
                return (pluginInstallations.get(String(values[0])) || null) as T | null;
              }
              return null;
            },
            async all<T>() {
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
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  return { DB: db as unknown as D1Database } as Env;
}
