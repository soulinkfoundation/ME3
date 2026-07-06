import { describe, expect, it } from "vitest";
import {
  approveMobilePairing,
  authenticateMobileOwner,
  claimMobilePairing,
  getMobileConfig,
  refreshMobileToken,
  revokeMobileToken,
  startMobilePairing,
} from "./mobile-pairing";
import type { Env } from "./types";

type PairingRow = {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string | null;
  code_hash: string;
  status: "pending" | "approved" | "claimed" | "expired" | "revoked";
  expires_at: string;
  approved_at: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RefreshTokenRow = {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string | null;
  token_hash: string;
  status: "active" | "rotated" | "revoked";
  scope_json: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type TestState = {
  installSecrets: Map<string, string>;
  pairings: PairingRow[];
  refreshTokens: RefreshTokenRow[];
};

const origins = {
  apiOrigin: "https://me3.example",
  webOrigin: "https://me3.example",
};

describe("mobile pairing", () => {
  it("requires owner approval before a device can claim tokens", async () => {
    const env = createEnv();
    const challenge = await startMobilePairing(env, {
      device: {
        id: "ios-device-1",
        name: "Kieran's iPhone",
        platform: "ios",
        appVersion: "0.1.0",
      },
    }, origins);

    await expect(
      claimMobilePairing(env, {
        pairingId: challenge.pairingId,
        userCode: challenge.userCode,
        deviceId: "ios-device-1",
      }, origins),
    ).rejects.toMatchObject({ status: 409 });

    await approveMobilePairing(env, "owner", challenge.pairingId, {
      userCode: challenge.userCode,
    });
    const tokenResponse = await claimMobilePairing(env, {
      pairingId: challenge.pairingId,
      userCode: challenge.userCode,
      deviceId: "ios-device-1",
    }, origins);

    expect(tokenResponse.install.label).toBe("Kieran's ME3");
    expect(tokenResponse.install.apiBaseURL).toBe("https://me3.example/api");
    expect(await authenticateMobileOwner(
      env,
      `Bearer ${tokenResponse.accessToken}`,
    )).toBe("owner");

    const refreshResponse = await refreshMobileToken(env, {
      refreshToken: tokenResponse.refreshToken,
      deviceId: "ios-device-1",
    }, origins);
    expect(refreshResponse.accessToken).toMatch(/^me3mat_/);
    expect(refreshResponse.refreshToken).toMatch(/^me3mrt_/);

    await revokeMobileToken(env, {
      refreshToken: refreshResponse.refreshToken,
      deviceId: "ios-device-1",
    });
    expect(await authenticateMobileOwner(
      env,
      `Bearer ${refreshResponse.accessToken}`,
    )).toBeNull();
  });

  it("rejects approval with the wrong code", async () => {
    const env = createEnv();
    const challenge = await startMobilePairing(env, {
      device: {
        id: "ios-device-2",
        name: "iPhone",
      },
    }, origins);

    await expect(
      approveMobilePairing(env, "owner", challenge.pairingId, {
        userCode: "WRONG1",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns the mobile config contract", async () => {
    const config = await getMobileConfig(createEnv(), origins);

    expect(config.mobileApiVersion).toBe(1);
    expect(config.auth.pairing).toBe("owner-approved-code");
    expect(config.auth.refreshEndpoint).toBe("/api/mobile/token/refresh");
    expect(config.capabilities.assistant).toBe(true);
  });
});

function createEnv(): Env {
  const state: TestState = {
    installSecrets: new Map(),
    pairings: [],
    refreshTokens: [],
  };
  return {
    DB: new MobilePairingDb(state) as unknown as D1Database,
  } as Env;
}

class MobilePairingDb {
  constructor(private readonly state: TestState) {}

  prepare(sql: string) {
    return new MobilePairingStatement(this.state, sql);
  }
}

class MobilePairingStatement {
  private values: unknown[] = [];

  constructor(
    private readonly state: TestState,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    if (this.sql.includes("FROM install_secrets")) {
      const [name] = this.values as [string];
      const value = this.state.installSecrets.get(name);
      return (value ? { value } : null) as T | null;
    }

    if (this.sql.includes("FROM owner_profile")) {
      return {
        id: "owner",
        email: "kieran@example.com",
        name: "Kieran",
        username: "kieran",
        bio: null,
        avatar_url: null,
        timezone: "Europe/Dublin",
        locale: "en-IE",
        assistant_name: null,
        password_hash: null,
      } as T;
    }

    if (this.sql.includes("FROM mobile_pairings")) {
      const [id, userId] = this.values as [string, string | undefined];
      const row = this.state.pairings.find(
        (pairing) => pairing.id === id && (!userId || pairing.user_id === userId),
      );
      return (row || null) as T | null;
    }

    if (this.sql.includes("FROM mobile_refresh_tokens")) {
      const [id, deviceId] = this.values as [string, string | undefined];
      const row = this.state.refreshTokens.find(
        (token) =>
          token.id === id &&
          (!deviceId || token.device_id === deviceId) &&
          (!this.sql.includes("status = 'active'") || token.status === "active"),
      );
      return (row || null) as T | null;
    }

    return null as T | null;
  }

  async run() {
    if (this.sql.includes("INSERT INTO install_secrets")) {
      const [name, value] = this.values as [string, string];
      this.state.installSecrets.set(name, value);
      return result(1);
    }

    if (this.sql.includes("INSERT INTO mobile_pairings")) {
      const [
        id,
        deviceId,
        deviceName,
        platform,
        appVersion,
        codeHash,
        expiresAt,
      ] = this.values as string[];
      this.state.pairings.push({
        id,
        user_id: "owner",
        device_id: deviceId,
        device_name: deviceName,
        platform,
        app_version: appVersion || null,
        code_hash: codeHash,
        status: "pending",
        expires_at: expiresAt,
        approved_at: null,
        claimed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return result(1);
    }

    if (this.sql.includes("SET status = 'approved'")) {
      const [approvedAt, updatedAt, id, userId] = this.values as string[];
      const row = this.state.pairings.find(
        (pairing) =>
          pairing.id === id &&
          pairing.user_id === userId &&
          pairing.status === "pending",
      );
      if (!row) return result(0);
      row.status = "approved";
      row.approved_at = approvedAt;
      row.updated_at = updatedAt;
      return result(1);
    }

    if (this.sql.includes("SET status = 'claimed'")) {
      const [claimedAt, updatedAt, id] = this.values as string[];
      const row = this.state.pairings.find(
        (pairing) => pairing.id === id && pairing.status === "approved",
      );
      if (!row) return result(0);
      row.status = "claimed";
      row.claimed_at = claimedAt;
      row.updated_at = updatedAt;
      return result(1);
    }

    if (this.sql.includes("SET status = 'expired'")) {
      const [updatedAt, id] = this.values as string[];
      const row = this.state.pairings.find((pairing) => pairing.id === id);
      if (!row || !["pending", "approved"].includes(row.status)) return result(0);
      row.status = "expired";
      row.updated_at = updatedAt;
      return result(1);
    }

    if (this.sql.includes("INSERT INTO mobile_refresh_tokens")) {
      const [
        id,
        userId,
        deviceId,
        deviceName,
        platform,
        appVersion,
        tokenHash,
        scopeJson,
        expiresAt,
        createdAt,
        updatedAt,
      ] = this.values as string[];
      this.state.refreshTokens.push({
        id,
        user_id: userId,
        device_id: deviceId,
        device_name: deviceName,
        platform,
        app_version: appVersion || null,
        token_hash: tokenHash,
        status: "active",
        scope_json: scopeJson,
        expires_at: expiresAt,
        last_used_at: null,
        revoked_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return result(1);
    }

    if (this.sql.includes("SET token_hash = ?")) {
      const [tokenHash, expiresAt, lastUsedAt, updatedAt, id] = this.values as string[];
      const row = this.state.refreshTokens.find(
        (token) => token.id === id && token.status === "active",
      );
      if (!row) return result(0);
      row.token_hash = tokenHash;
      row.expires_at = expiresAt;
      row.last_used_at = lastUsedAt;
      row.updated_at = updatedAt;
      return result(1);
    }

    if (this.sql.includes("SET status = 'revoked'")) {
      const [revokedAt, updatedAt, id] = this.values as string[];
      const row = this.state.refreshTokens.find((token) => token.id === id);
      if (!row) return result(0);
      row.status = "revoked";
      row.revoked_at = revokedAt;
      row.updated_at = updatedAt;
      return result(1);
    }

    return result(0);
  }
}

function result(changes: number) {
  return { success: true, meta: { changes } };
}
