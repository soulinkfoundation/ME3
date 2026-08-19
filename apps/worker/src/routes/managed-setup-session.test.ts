import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";

vi.mock("../me3-cloud-jwt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../me3-cloud-jwt")>()),
  verifyMe3CloudJwt: vi.fn(),
}));

import { verifyMe3CloudJwt } from "../me3-cloud-jwt";
import { registerManagedSetupSessionRoutes } from "./managed-setup-session";

const INSTALLATION_ID = "mi-1234567890abcdef";
const CORE_INSTALL_ID = "core_11111111-1111-4111-8111-111111111111";
const CORE_ORIGIN = "https://sarahshook.me3.app";
const SESSION_JTI = "22222222-2222-4222-8222-222222222222";

function createEnv() {
  const secrets = new Map<string, string>([
    ["ME3_CLOUD_OWNER_ID", "owner-user-1"],
    ["ME3_CORE_INSTALL_ID", CORE_INSTALL_ID],
  ]);
  const env = {
    ME3_DEPLOYMENT_MODE: "managed",
    ME3_MANAGED_INSTALLATION_ID: INSTALLATION_ID,
    CORE_WEB_ORIGIN: CORE_ORIGIN,
    DB: {
      prepare: vi.fn((sql: string) => {
        let values: unknown[] = [];
        const statement = {
          bind: vi.fn((...input: unknown[]) => {
            values = input;
            return statement;
          }),
          first: vi.fn(async () => {
            if (!sql.includes("FROM install_secrets")) return null;
            const value = secrets.get(String(values[0]));
            return value ? { value } : null;
          }),
          run: vi.fn(async () => {
            if (!sql.includes("INSERT OR IGNORE INTO install_secrets")) {
              return { success: true, meta: { changes: 0 } };
            }
            const name = String(values[0]);
            if (secrets.has(name)) {
              return { success: true, meta: { changes: 0 } };
            }
            secrets.set(name, String(values[1]));
            return { success: true, meta: { changes: 1 } };
          }),
        };
        return statement;
      }),
    },
  } as unknown as Env;
  return { env, secrets };
}

function validClaims() {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://api.me3.app",
    sub: "owner-user-1",
    aud: "me3-managed-setup-session",
    typ: "me3_managed_setup_session",
    managed_installation_id: INSTALLATION_ID,
    core_install_id: CORE_INSTALL_ID,
    core_origin: CORE_ORIGIN,
    operator_user_id: "admin-user-1",
    iat: now,
    exp: now + 5 * 60,
    jti: SESSION_JTI,
  };
}

describe("managed setup session", () => {
  const setOwnerSession = vi.fn(async () => undefined);
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono<{ Bindings: Env }>();
    registerManagedSetupSessionRoutes(app, { setOwnerSession });
  });

  it("opens one short owner session and rejects replay", async () => {
    const { env, secrets } = createEnv();
    vi.mocked(verifyMe3CloudJwt).mockResolvedValue(validClaims());

    const first = await app.request(
      `${CORE_ORIGIN}/api/auth/managed-setup-session?token=signed-token`,
      undefined,
      env,
    );
    expect(first.status).toBe(302);
    expect(first.headers.get("Location")).toBe(`${CORE_ORIGIN}/account`);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(first.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(setOwnerSession).toHaveBeenCalledWith(
      expect.anything(),
      "owner",
      2 * 60 * 60,
    );
    expect(
      secrets.has(`ME3_MANAGED_SETUP_SESSION_USED:${SESSION_JTI}`),
    ).toBe(true);

    const replay = await app.request(
      `${CORE_ORIGIN}/api/auth/managed-setup-session?token=signed-token`,
      undefined,
      env,
    );
    expect(replay.status).toBe(409);
    expect(setOwnerSession).toHaveBeenCalledTimes(1);
  });

  it("rejects a token bound to another installation origin", async () => {
    const { env, secrets } = createEnv();
    vi.mocked(verifyMe3CloudJwt).mockResolvedValue({
      ...validClaims(),
      core_origin: "https://another.me3.app",
    } as any);

    const response = await app.request(
      `${CORE_ORIGIN}/api/auth/managed-setup-session?token=signed-token`,
      undefined,
      env,
    );
    expect(response.status).toBe(403);
    expect(setOwnerSession).not.toHaveBeenCalled();
    expect(
      secrets.has(`ME3_MANAGED_SETUP_SESSION_USED:${SESSION_JTI}`),
    ).toBe(false);
  });
});
