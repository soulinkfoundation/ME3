#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;
const TOKEN_ID_PATTERN = /^[0-9a-f]{32}$/;
const MANAGED_BUCKET_PATTERN = /^me3-mi-[0-9a-f]{16}-r2$/;

export async function deriveManagedR2S3Credentials(
  input,
  { request = globalThis.fetch } = {},
) {
  const accountId = String(input.accountId || "").toLowerCase();
  const apiToken = input.apiToken;
  const bucket = String(input.bucket || "");
  const allowMissing = input.allowMissing === true;
  if (
    !ACCOUNT_ID_PATTERN.test(accountId) ||
    typeof apiToken !== "string" ||
    apiToken.length < 1 ||
    apiToken.length > 4096 ||
    /[\u0000-\u001f\u007f]/u.test(apiToken) ||
    !MANAGED_BUCKET_PATTERN.test(bucket) ||
    typeof request !== "function"
  ) {
    throw new Error("managed source R2 credential contract is invalid");
  }

  const verification = await request(`${API_ROOT}/user/tokens/verify`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const verified = await readCloudflareResult(
    verification,
    "managed source R2 token verification failed",
  );
  const accessKeyId = String(verified?.id || "").toLowerCase();
  if (!TOKEN_ID_PATTERN.test(accessKeyId) || verified?.status !== "active") {
    throw new Error("managed source R2 token is not active");
  }

  const bucketResponse = await request(
    `${API_ROOT}/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}`,
    { headers: { Authorization: `Bearer ${apiToken}` } },
  );
  let bucketPresent = true;
  if (bucketResponse.status === 404) {
    if (!allowMissing) {
      throw new Error("managed source R2 bucket is absent");
    }
    bucketPresent = false;
  } else {
    const found = await readCloudflareResult(
      bucketResponse,
      "managed source R2 bucket access verification failed",
    );
    if (found?.name !== bucket) {
      throw new Error("managed source R2 bucket identity does not match");
    }
  }

  return {
    accessKeyId,
    // Cloudflare documents the API token ID and SHA-256 token value as its
    // S3-compatible Access Key ID and Secret Access Key, respectively.
    // https://developers.cloudflare.com/r2/api/tokens/#get-s3-api-credentials-from-an-api-token
    secretAccessKey: createHash("sha256").update(apiToken, "utf8").digest("hex"),
    bucketPresent,
  };
}

export function persistManagedR2S3Credentials(
  credentials,
  {
    githubEnv,
    emitMask = (value) => process.stdout.write(`::add-mask::${value}\n`),
    append = appendFileSync,
  } = {},
) {
  if (
    !TOKEN_ID_PATTERN.test(credentials?.accessKeyId || "") ||
    !/^[0-9a-f]{64}$/.test(credentials?.secretAccessKey || "") ||
    typeof credentials?.bucketPresent !== "boolean" ||
    typeof githubEnv !== "string" ||
    !githubEnv
  ) {
    throw new Error("managed source R2 credentials are invalid");
  }

  // Mask both values before either is persisted for later workflow steps.
  emitMask(credentials.accessKeyId);
  emitMask(credentials.secretAccessKey);
  append(
    githubEnv,
    [
      `AWS_ACCESS_KEY_ID=${credentials.accessKeyId}`,
      `AWS_SECRET_ACCESS_KEY=${credentials.secretAccessKey}`,
      "AWS_DEFAULT_REGION=auto",
      `ME3_MANAGED_SOURCE_R2_PRESENT=${credentials.bucketPresent}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
}

async function readCloudflareResult(response, failureMessage) {
  if (!response?.ok) throw new Error(failureMessage);
  const body = await response.json().catch(() => null);
  if (body?.success !== true || !Object.hasOwn(body, "result")) {
    throw new Error(failureMessage);
  }
  return body.result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const operation = process.env.ME3_MANAGED_OPERATION;
  if (!["export", "decommission", "cleanup_failed_provision"].includes(operation)) {
    throw new Error("managed source R2 credential operation is invalid");
  }
  const credentials = await deriveManagedR2S3Credentials({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    bucket: process.env.R2_NAME,
    allowMissing: operation !== "export",
  });
  persistManagedR2S3Credentials(credentials, { githubEnv: process.env.GITHUB_ENV });
  console.log(JSON.stringify({ ok: true, bucketPresent: credentials.bucketPresent }));
}
