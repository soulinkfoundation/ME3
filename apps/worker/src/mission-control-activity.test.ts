import { describe, expect, it } from "vitest";
import { clearMissionActivity } from "./mission-control";
import type { Env } from "./types";

describe("Mission Control activity", () => {
  it("clears agent runs and plugin activity for the owner", async () => {
    const agentRuns = [
      { id: "run-1", user_id: "owner" },
      { id: "run-2", user_id: "other" },
    ];
    const pluginActivity = [
      { id: "activity-1", user_id: "owner" },
      { id: "activity-2", user_id: "other" },
    ];
    const env = createActivityEnv(agentRuns, pluginActivity);

    const result = await clearMissionActivity(env, "owner");

    expect(result).toEqual({
      cleared: {
        agentRuns: 1,
        pluginActivity: 1,
      },
    });
    expect(agentRuns).toEqual([{ id: "run-2", user_id: "other" }]);
    expect(pluginActivity).toEqual([{ id: "activity-2", user_id: "other" }]);
  });
});

function createActivityEnv(
  agentRuns: Array<{ id: string; user_id: string }>,
  pluginActivity: Array<{ id: string; user_id: string }>,
) {
  const db = {
    prepare(sql: string) {
      return {
        bind(userId: string) {
          return {
            async run() {
              const rows = sql.includes("mission_agent_runs") ? agentRuns : pluginActivity;
              const before = rows.length;
              for (let index = rows.length - 1; index >= 0; index -= 1) {
                if (rows[index]?.user_id === userId) rows.splice(index, 1);
              }
              return { success: true, meta: { changes: before - rows.length } };
            },
          };
        },
      };
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
  return { DB: db as unknown as D1Database } as Env;
}
