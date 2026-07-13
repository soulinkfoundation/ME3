import { describe, expect, it } from "vitest";
import { getManagedCommerceBridgeConfig } from "./commerce-bridge";
import type { Env } from "./types";

function createEnv(
  secrets: Record<string, string> = {},
  overrides: Partial<Env> = {},
): Env {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(name: string) {
            return {
              async first<T>() {
                if (!sql.includes("FROM install_secrets")) return null;
                const value = secrets[name];
                return value ? ({ value } as T) : null;
              },
            };
          },
        };
      },
    } as unknown as D1Database,
    ...overrides,
  } as Env;
}

describe("managed commerce bridge configuration", () => {
  it("preserves explicit bridge bearer credentials", async () => {
    const config = await getManagedCommerceBridgeConfig(
      createEnv({}, {
        ME3_COMMERCE_BRIDGE_ORIGIN: "https://commerce.example/",
        ME3_COMMERCE_BRIDGE_TOKEN: " bridge-token ",
      }),
    );

    expect(config).toEqual({
      origin: "https://commerce.example",
      headers: { Authorization: "Bearer bridge-token" },
      mode: "explicit",
    });
  });

  it("reuses the claimed cloud identity for managed commerce", async () => {
    const config = await getManagedCommerceBridgeConfig(
      createEnv({
        ME3_CLOUD_OWNER_ID: "cloud-owner",
        ME3_CLOUD_CORE_TOKEN: "core-token",
        ME3_CORE_INSTALL_ID: "core_install",
      }, {
        ME3_CLOUD_API_ORIGIN: "https://api.me3.app/",
        CORE_WEB_ORIGIN: "https://core.example/",
        CORE_API_ORIGIN: "https://core-api.example/",
      }),
    );

    expect(config).toEqual({
      origin: "https://api.me3.app",
      headers: {
        "X-ME3-Core-Owner-ID": "cloud-owner",
        "X-ME3-Core-Update-Token": "core-token",
        "X-ME3-Core-Install-ID": "core_install",
        "X-ME3-Core-Origin": "https://core.example",
        "X-ME3-Core-API-Origin": "https://core-api.example",
      },
      mode: "cloud",
    });
  });

  it("fails closed when only one explicit bridge secret is configured", async () => {
    const config = await getManagedCommerceBridgeConfig(
      createEnv({
        ME3_CLOUD_OWNER_ID: "cloud-owner",
        ME3_CLOUD_CORE_TOKEN: "core-token",
      }, { ME3_COMMERCE_BRIDGE_ORIGIN: "https://commerce.example" }),
    );

    expect(config).toBeNull();
  });
});
