import { describe, expect, it } from "vitest";
import app from "./index";
import type { Env, OwnerProfile } from "./types";

type StoredMessage = {
  id: string;
  ownerId: string;
  role: string;
  content: string;
};

type StoredOwner = OwnerProfile & { password_hash: string | null };

function createEnv(): Env & { owner: StoredOwner | null; messages: StoredMessage[] } {
  const state = {
    owner: null as StoredOwner | null,
    messages: [] as StoredMessage[],
  };

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO owner_profile")) {
                state.owner = {
                  id: values[0] as string,
                  email: values[1] as string | null,
                  name: values[2] as string | null,
                  username: values[3] as string | null,
                  bio: values[4] as string | null,
                  avatar_url: values[5] as string | null,
                  timezone: values[6] as string | null,
                  locale: null,
                  password_hash: values[7] as string | null,
                };
              }

              if (sql.includes("UPDATE owner_profile") && state.owner) {
                let valueIndex = 0;
                if (sql.includes("timezone = ?")) {
                  state.owner.timezone = values[valueIndex] as string | null;
                  valueIndex += 1;
                }
                if (sql.includes("locale = ?")) {
                  state.owner.locale = values[valueIndex] as string | null;
                }
              }

              if (sql.includes("DELETE FROM owner_profile")) {
                state.owner = null;
              }

              if (sql.includes("INSERT INTO assistant_messages")) {
                state.messages.push({
                  id: values[0] as string,
                  ownerId: values[1] as string,
                  role: values[2] as string,
                  content: values[3] as string,
                });
              }

              return { success: true };
            },
            async first<T>() {
              if (sql.includes("SELECT password_hash FROM owner_profile")) {
                return state.owner ? ({ password_hash: state.owner.password_hash } as T) : null;
              }

              if (sql.includes("lower(email)") && String(values[0]) === state.owner?.email?.toLowerCase()) {
                return state.owner as T;
              }

              if (sql.includes("FROM owner_profile") && values[0] === state.owner?.id) {
                return state.owner as T;
              }
              return null;
            },
          };
        },
      };
    },
  };

  return {
    ...state,
    DB: db as unknown as D1Database,
    ENVIRONMENT: "local",
    CORE_WEB_ORIGIN: "http://localhost:5174",
    CORE_API_ORIGIN: "http://localhost:8787",
    JWT_SECRET: "test-secret-at-least-long-enough",
    TOKEN_ENCRYPTION_KEY: "test-encryption-key",
    ADMIN_BOOTSTRAP_CODE: "owner-code",
  };
}

async function bootstrap(env: Env) {
  return app.fetch(
    new Request("http://localhost/api/admin/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5174" },
      body: JSON.stringify({
        bootstrapCode: "owner-code",
        email: "owner@example.com",
        name: "ME3 Core Owner",
        username: "owner",
        password: "correct-horse-battery",
      }),
    }),
    env,
  );
}

function cookieHeader(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0];
}

describe("ME3 Core Worker auth", () => {
  it("bootstraps the owner and sets an httpOnly session cookie", async () => {
    const env = createEnv();

    const response = await bootstrap(env);
    const body = (await response.json()) as { ok: boolean; owner: OwnerProfile };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.owner.email).toBe("owner@example.com");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("me3_core_session=");
  });

  it("reports whether owner password auth is configured", async () => {
    const env = createEnv();

    const before = await app.fetch(new Request("http://localhost/api/config"), env);
    expect((await before.json()) as { ownerAuthConfigured: boolean }).toMatchObject({
      ownerAuthConfigured: false,
    });

    await bootstrap(env);

    const after = await app.fetch(new Request("http://localhost/api/config"), env);
    expect((await after.json()) as { ownerAuthConfigured: boolean }).toMatchObject({
      ownerAuthConfigured: true,
    });
  });

  it("rejects invalid bootstrap codes without issuing a session", async () => {
    const env = createEnv();

    const response = await app.fetch(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapCode: "wrong" }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("requires a password during bootstrap", async () => {
    const env = createEnv();

    const response = await app.fetch(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapCode: "owner-code",
          email: "owner@example.com",
          name: "ME3 Core Owner",
          username: "owner",
          password: "short",
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("logs in the owner with email and password", async () => {
    const env = createEnv();
    await bootstrap(env);

    const response = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "correct-horse-battery",
        }),
      }),
      env,
    );
    const body = (await response.json()) as { ok: boolean; owner: OwnerProfile & { password_hash?: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.owner.id).toBe("owner");
    expect(body.owner.password_hash).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects invalid owner passwords", async () => {
    const env = createEnv();
    await bootstrap(env);

    const response = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "wrong-password",
        }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("hydrates the owner session from the signed cookie", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/auth/me", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as { ok: boolean; user: OwnerProfile };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.user.id).toBe("owner");
  });

  it("clears the owner session cookie on logout", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("me3_core_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects owner-only assistant requests without a valid session", async () => {
    const env = createEnv();

    const response = await app.fetch(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(env.messages).toHaveLength(0);
  });

  it("allows owner-only assistant requests with a valid session", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ message: "Hello" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(env.messages).toMatchObject([{ ownerId: "owner", content: "Hello" }]);
  });

  it("loads account settings for the signed-in owner", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/account", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      user: { email: string; timezone: string; locale: string; localeSource: string };
    };

    expect(response.status).toBe(200);
    expect(body.user.email).toBe("owner@example.com");
    expect(body.user.timezone).toBe("UTC");
    expect(body.user.locale).toBe("en-US");
    expect(body.user.localeSource).toBe("inferred");
  });

  it("updates account timezone and explicit locale", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/account", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ timezone: "Europe/Dublin", locale: "en-IE" }),
      }),
      env,
    );
    const body = (await response.json()) as {
      user: { timezone: string; locale: string; localeSource: string };
    };

    expect(response.status).toBe(200);
    expect(body.user.timezone).toBe("Europe/Dublin");
    expect(body.user.locale).toBe("en-IE");
    expect(body.user.localeSource).toBe("explicit");
  });

  it("deletes the owner account and clears the session cookie", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(env.owner).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
