import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runCoreAgentToolTurn,
  type AgentToolMessage,
  type CoreNetworkDirectoryToolServices,
} from "@me3-core/plugin-agent-chat";
import {
  getNetworkDirectoryBridgeConfig,
  searchMe3Network,
  syncPublishedProfileToMe3Network,
} from "./network-directory";
import type { Env } from "./types";

const SECRETS = {
  ME3_CLOUD_OWNER_ID: "owner-1",
  ME3_CORE_INSTALL_ID: "core_11111111-1111-4111-8111-111111111111",
  ME3_CLOUD_CORE_TOKEN: "secret-token",
};

afterEach(() => vi.unstubAllGlobals());

describe("ME3 Network directory bridge", () => {
  it("uses only the linked installation identity", async () => {
    await expect(getNetworkDirectoryBridgeConfig(createEnv(SECRETS))).resolves.toEqual({
      origin: "https://api.me3.app",
      headers: {
        "X-ME3-Core-Owner-ID": "owner-1",
        "X-ME3-Core-Install-ID": "core_11111111-1111-4111-8111-111111111111",
        "X-ME3-Core-Update-Token": "secret-token",
      },
    });
  });

  it("does not upload a profile before the owner opts in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ connected: true, listed: false, syncStatus: "not_listed" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      syncPublishedProfileToMe3Network(createEnv(SECRETS), { version: "0.2" }),
    ).resolves.toBe("not_listed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.me3.app/v1/network/status");
  });

  it("normalizes bounded public search results and drops precise coordinates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      query: "event photographer",
      results: [{
        name: "Aoife Lens",
        handle: "aoife",
        kind: "person",
        bio: "Documentary event photographer",
        avatarUrl: "https://aoife.example/avatar.jpg",
        profileUrl: "https://aoife.example/.well-known/me.json",
        publicUrl: "https://aoife.example/",
        location: {
          label: "Galway, Ireland",
          precision: "city",
          countryCode: "IE",
          latitude: 53.2707,
          longitude: -9.0568,
        },
        offerings: [{
          type: "service",
          id: "event-photo",
          title: "Event photography",
          description: "Candid event coverage",
          url: "https://aoife.example/services/event-photo",
          durationMinutes: 120,
          price: { amount: "450", currency: "EUR" },
        }],
        reasons: ["Offers Event photography"],
        indexedAt: "2026-08-19T12:00:00.000Z",
      }],
    })));

    const result = await searchMe3Network(createEnv(SECRETS), {
      query: "event photographer",
      offeringType: "service",
      countryCode: "ie",
    });

    expect(result.results[0]).toMatchObject({
      name: "Aoife Lens",
      location: { label: "Galway, Ireland", countryCode: "IE" },
      offerings: [{ type: "service", title: "Event photography" }],
    });
    expect(result.results[0].location).not.toHaveProperty("latitude");
  });
});

describe("ME3 Network agent tool", () => {
  it("searches the directory for an explicit network discovery request", async () => {
    const search = vi.fn<CoreNetworkDirectoryToolServices["search"]>(async () => ({
      query: "event photographer in Ireland",
      total: 1,
      results: [{
        name: "Aoife Lens",
        handle: "aoife",
        kind: "person",
        bio: "Documentary event photographer",
        avatarUrl: null,
        profileUrl: "https://aoife.example/.well-known/me.json",
        publicUrl: "https://aoife.example/",
        location: {
          label: "Galway, Ireland",
          precision: "city",
          locality: "Galway",
          region: "Connacht",
          country: "Ireland",
          countryCode: "IE",
        },
        offerings: [{
          type: "service",
          id: "event-photo",
          title: "Event photography",
          description: "Candid event coverage",
          url: "https://aoife.example/services/event-photo",
          durationMinutes: 120,
          price: { amount: "450", currency: "EUR" },
        }],
        reasons: ["Offers Event photography"],
        indexedAt: "2026-08-19T12:00:00.000Z",
      }],
    }));
    const aiRun = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [{
          id: "network-search-1",
          name: "core_network_directory_search",
          arguments: {
            query: "event photographer in Ireland",
            offeringType: "service",
            countryCode: "IE",
          },
        }],
      })
      .mockResolvedValueOnce({
        response: "Aoife Lens looks relevant because she offers event photography in Galway.",
      });

    const response = await runCoreAgentToolTurn({
      db: createExecutionDb(),
      userId: "owner",
      requestId: "network-request",
      turnId: "network-turn",
      ownerTimezone: "Europe/Dublin",
      route: {
        providerId: "workers-ai",
        model: "workers-test-model",
        backupModel: null,
        apiKey: null,
        ai: { run: aiRun },
        aiGateway: null,
        configured: true,
      } as never,
      messages: baseMessages(
        "Find someone on the ME3 Network who can photograph an event in Ireland.",
      ),
      networkDirectoryServices: { search },
    });

    expect(search).toHaveBeenCalledWith({
      query: "event photographer in Ireland",
      offeringType: "service",
      countryCode: "IE",
      limit: undefined,
    });
    expect(response).toMatchObject({
      specialist: "core.network.directory.search",
      replyText: "Aoife Lens looks relevant because she offers event photography in Galway.",
    });
  });
});

function baseMessages(message: string): AgentToolMessage[] {
  return [
    { role: "system", content: "You are ME3." },
    { role: "user", content: message },
  ];
}

function createEnv(secrets: Record<string, string>): Env {
  return {
    DB: {
      prepare() {
        return {
          bind(name: string) {
            return {
              async first<T>() {
                const value = secrets[name];
                return value ? ({ value } as T) : null;
              },
            };
          },
        };
      },
    } as unknown as D1Database,
  } as Env;
}

function createExecutionDb() {
  const executions: Array<Record<string, unknown>> = [];
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (!sql.includes("FROM agent_tool_executions")) return null as T;
              return (executions.find((item) =>
                item.user_id === values[0] &&
                item.request_id === values[1] &&
                item.tool_call_id === values[2]) || null) as T;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
                executions.push({
                  id: values[0],
                  user_id: values[1],
                  request_id: values[2],
                  tool_call_id: values[3],
                  tool_name: values[4],
                  status: "running",
                });
              }
              if (sql.includes("UPDATE agent_tool_executions")) {
                const execution = executions.find((item) => item.id === values[1]);
                if (execution) execution.status = sql.includes("status = 'succeeded'")
                  ? "succeeded"
                  : "failed";
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}
