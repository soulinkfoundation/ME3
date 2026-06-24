import { getCoreVersionInfo } from "../core-version";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";
import {
  buildApiUrl,
  getCoreApiOrigin,
  getCoreWebOrigin,
  getMe3CloudApiOrigin,
  readResponseJson,
} from "../sites";
import type { Env } from "../types";

const ME3_CLOUD_OWNER_SECRET_NAME = "ME3_CLOUD_OWNER_ID";
const ME3_CLOUD_CORE_TOKEN_SECRET_NAME = "ME3_CLOUD_CORE_TOKEN";
const ME3_CORE_INSTALL_ID_SECRET_NAME = "ME3_CORE_INSTALL_ID";

type CoreGithubStatus = {
  ok: true;
  core: ReturnType<typeof getCoreVersionInfo>;
  me3AppConnected: boolean;
  github: {
    connected: boolean;
    accountLogin: string | null;
    repositoryOwner: string | null;
    repositoryName: string | null;
    repositoryUrl: string | null;
    lastUpdateRunId: string | null;
    lastUpdateRunUrl: string | null;
  };
  unavailableReason: string | null;
};

export function registerCoreGithubUpdaterRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/core/github/status", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const context = await getCoreGithubContext(c);
    if (!context.cloudOwnerId) {
      return c.json(createCoreGithubStatus(false, null, "Connect ME3.app first."));
    }
    if (!context.coreToken) {
      return c.json(
        createCoreGithubStatus(
          true,
          null,
          "Reconnect ME3.app before enabling GitHub updates.",
        ),
      );
    }

    try {
      const cloudStatus = await fetchMe3CloudBroker(c, context, "/api/core/github/status", {
        method: "GET",
      });
      return c.json(createCoreGithubStatus(true, cloudStatus, null));
    } catch (error) {
      return c.json(
        createCoreGithubStatus(
          true,
          null,
          error instanceof Error ? error.message : "GitHub updater is not ready yet.",
        ),
      );
    }
  });

  app.post("/api/core/github/install/start", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const context = await requireCoreGithubContext(c);
    if ("response" in context) return context.response;

    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return c.json(
      await fetchMe3CloudBroker(c, context, "/api/github/install/start", {
        method: "POST",
        body,
      }),
    );
  });

  app.post("/api/core/github/update", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const context = await requireCoreGithubContext(c);
    if ("response" in context) return context.response;

    return c.json(
      await fetchMe3CloudBroker(c, context, "/api/core/github/update", {
        method: "POST",
        body: {},
      }),
    );
  });

  app.post("/api/core/github/disconnect", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const context = await requireCoreGithubContext(c);
    if ("response" in context) return context.response;

    return c.json(
      await fetchMe3CloudBroker(c, context, "/api/core/github/disconnect", {
        method: "POST",
        body: {},
      }),
    );
  });
}

async function requireCoreGithubContext(c: AppContext) {
  const context = await getCoreGithubContext(c);
  if (context.cloudOwnerId && context.coreToken) return context;
  return {
    response: c.json(
      { ok: false, error: "Reconnect ME3.app before connecting GitHub updates." },
      409,
    ),
  };
}

async function getCoreGithubContext(c: AppContext) {
  const [cloudOwnerId, coreToken, installId] = await Promise.all([
    getStoredInstallSecret(c.env, ME3_CLOUD_OWNER_SECRET_NAME),
    getStoredInstallSecret(c.env, ME3_CLOUD_CORE_TOKEN_SECRET_NAME),
    getOrCreateCoreInstallId(c.env),
  ]);

  return {
    cloudOwnerId,
    coreToken,
    installId,
    coreOrigin: getCoreWebOrigin(c.env, c.req.url),
    coreApiOrigin: getCoreApiOrigin(c.env, c.req.url),
  };
}

async function fetchMe3CloudBroker(
  c: AppContext,
  context: Awaited<ReturnType<typeof getCoreGithubContext>>,
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const url = buildApiUrl(getMe3CloudApiOrigin(c.env), path);
  const headers = new Headers({
    Accept: "application/json",
    "X-ME3-Core-Install-ID": context.installId,
    "X-ME3-Core-Owner-ID": context.cloudOwnerId || "",
    "X-ME3-Core-Update-Token": context.coreToken || "",
    "X-ME3-Core-Origin": context.coreOrigin,
    "X-ME3-Core-API-Origin": context.coreApiOrigin,
    "X-ME3-Core-Version": getCoreVersionInfo().version,
  });
  const requestInit: RequestInit = {
    method: init.method,
    headers,
  };

  if (init.method !== "GET") {
    headers.set("Content-Type", "application/json");
    requestInit.body = JSON.stringify({
      coreInstallId: context.installId,
      coreOwnerId: context.cloudOwnerId,
      coreOrigin: context.coreOrigin,
      coreApiOrigin: context.coreApiOrigin,
      coreVersion: getCoreVersionInfo().version,
      ...(init.body || {}),
    });
  }

  const response = await fetch(url, requestInit);
  const payload = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(readString(payload.error) || `ME3 Cloud returned ${response.status}`);
  }
  return payload;
}

function createCoreGithubStatus(
  me3AppConnected: boolean,
  cloudStatus: Record<string, unknown> | null,
  unavailableReason: string | null,
): CoreGithubStatus {
  const repository = readRecord(cloudStatus?.repository);
  const lastRun = readRecord(cloudStatus?.lastUpdateRun);
  const repositoryOwner =
    readString(cloudStatus?.github_repository_owner) ||
    readString(cloudStatus?.repositoryOwner) ||
    readString(repository?.owner);
  const repositoryName =
    readString(cloudStatus?.github_repository_name) ||
    readString(cloudStatus?.repositoryName) ||
    readString(repository?.name);

  return {
    ok: true,
    core: getCoreVersionInfo(),
    me3AppConnected,
    github: {
      connected: readBoolean(cloudStatus?.connected) || Boolean(repositoryOwner && repositoryName),
      accountLogin:
        readString(cloudStatus?.github_account_login) ||
        readString(cloudStatus?.accountLogin) ||
        null,
      repositoryOwner: repositoryOwner || null,
      repositoryName: repositoryName || null,
      repositoryUrl:
        readString(cloudStatus?.repositoryUrl) ||
        readString(cloudStatus?.repository_url) ||
        readString(repository?.url) ||
        readString(repository?.html_url) ||
        null,
      lastUpdateRunId:
        readString(cloudStatus?.last_update_run_id) ||
        readString(cloudStatus?.lastUpdateRunId) ||
        readString(lastRun?.id) ||
        null,
      lastUpdateRunUrl:
        readString(cloudStatus?.last_update_run_url) ||
        readString(cloudStatus?.lastUpdateRunUrl) ||
        readString(lastRun?.url) ||
        null,
    },
    unavailableReason,
  };
}

async function getOrCreateCoreInstallId(env: Env): Promise<string> {
  const existing = await getStoredInstallSecret(env, ME3_CORE_INSTALL_ID_SECRET_NAME);
  if (existing) return existing;

  const installId = `core_${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO install_secrets (name, value, created_at, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(name) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(ME3_CORE_INSTALL_ID_SECRET_NAME, installId)
    .run();
  return installId;
}

async function getStoredInstallSecret(env: Env, name: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
    .bind(name)
    .first<{ value: string }>();
  return row?.value || null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}
