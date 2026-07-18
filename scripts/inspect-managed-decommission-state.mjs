#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.cloudflare.com/client/v4";

export async function inspectManagedDecommissionState(input, request = globalThis.fetch) {
  const manifest = validateInput(input);
  const api = createApi(input.accountId, input.apiToken, request);
  const worker = await api(
    `/accounts/${input.accountId}/workers/scripts/${manifest.workerName}`,
    { raw: true, missingOk: true },
  );
  const d1 = await api(
    `/accounts/${input.accountId}/d1/database/${manifest.d1Id}`,
    { missingOk: true },
  );
  if (
    d1 &&
    (String(d1.uuid || d1.id || "").toLowerCase() !== manifest.d1Id ||
      d1.name !== manifest.d1Name)
  ) {
    throw new Error("managed D1 identity does not match during retry inspection");
  }
  const r2 = await api(
    `/accounts/${input.accountId}/r2/buckets/${manifest.r2Name}`,
    { missingOk: true },
  );
  if (r2 && String(r2.name || manifest.r2Name) !== manifest.r2Name) {
    throw new Error("managed R2 identity does not match during retry inspection");
  }

  let runtimeTerminated = !worker && !d1;
  if (d1 && (!worker || !r2)) {
    const lifecycle = await queryLifecycleState(api, input.accountId, manifest.d1Id);
    runtimeTerminated =
      lifecycle?.state === "suspended" &&
      Boolean(lifecycle.credentials_revoked_at) &&
      Boolean(lifecycle.storage_purged_at);
  }
  if (!worker && d1 && !runtimeTerminated) {
    throw new Error(
      "managed Worker is absent but D1 does not prove completed runtime termination",
    );
  }

  return {
    ok: true,
    workerPresent: Boolean(worker),
    d1Present: Boolean(d1),
    r2Present: Boolean(r2),
    runtimeTerminated,
  };
}

function validateInput(input) {
  const installationId = String(input.installationId || "").toLowerCase();
  const workerName = String(input.workerName || "");
  const d1Name = String(input.d1Name || "");
  const d1Id = String(input.d1Id || "").toLowerCase();
  const r2Name = String(input.r2Name || "");
  if (
    !/^[0-9a-f]{32}$/.test(input.accountId || "") ||
    typeof input.apiToken !== "string" ||
    !input.apiToken ||
    !/^mi-[0-9a-f]{16}$/.test(installationId) ||
    workerName !== `me3-${installationId}` ||
    d1Name !== `${workerName}-d1` ||
    r2Name !== `${workerName}-r2` ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d1Id)
  ) {
    throw new Error("managed decommission retry inspection contract is invalid");
  }
  return { installationId, workerName, d1Name, d1Id, r2Name };
}

async function queryLifecycleState(api, accountId, d1Id) {
  const result = await api(`/accounts/${accountId}/d1/database/${d1Id}/query`, {
    method: "POST",
    body: JSON.stringify({
      sql: `SELECT state, credentials_revoked_at, storage_purged_at
            FROM managed_runtime_state
            WHERE id = 'managed'`,
    }),
  });
  const rows = Array.isArray(result)
    ? result.flatMap((entry) => (Array.isArray(entry?.results) ? entry.results : []))
    : [];
  if (rows.length > 1) throw new Error("managed runtime termination evidence is ambiguous");
  return rows[0] || null;
}

function createApi(accountId, apiToken, request) {
  return async (path, options = {}) => {
    const response = await request(`${API_ROOT}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: options.body } : {}),
    });
    if (response.status === 404 && options.missingOk) return null;
    if (!response.ok) {
      throw new Error(`managed retry inspection failed with status ${response.status}`);
    }
    if (options.raw) return { present: true };
    const body = await response.json().catch(() => null);
    if (body?.success !== true || !Object.hasOwn(body, "result")) {
      throw new Error("managed retry inspection returned an invalid response");
    }
    return body.result;
  };
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--") || !values[index + 1]) throw new Error("invalid argument");
    parsed[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const result = await inspectManagedDecommissionState({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    installationId: args["installation-id"],
    workerName: args["worker-name"],
    d1Name: args["d1-name"],
    d1Id: args["d1-id"],
    r2Name: args["r2-name"],
  });
  if (process.env.GITHUB_ENV) {
    appendFileSync(
      process.env.GITHUB_ENV,
      [
        `ME3_MANAGED_WORKER_PRESENT=${result.workerPresent}`,
        `ME3_MANAGED_D1_PRESENT=${result.d1Present}`,
        `ME3_MANAGED_R2_PRESENT=${result.r2Present}`,
        `ME3_MANAGED_RUNTIME_TERMINATED=${result.runtimeTerminated}`,
        "",
      ].join("\n"),
    );
  }
  console.log(JSON.stringify(result));
}
