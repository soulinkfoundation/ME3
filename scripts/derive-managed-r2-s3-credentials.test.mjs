import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deriveManagedR2S3Credentials,
  persistManagedR2S3Credentials,
} from "./derive-managed-r2-s3-credentials.mjs";

const accountId = "a".repeat(32);
const bucket = "me3-mi-0123456789abcdef-r2";
const tokenId = "b".repeat(32);
const apiToken = "managed-cloudflare-api-token";

test("derives S3 credentials only after verifying the active token and exact bucket", async () => {
  const requests = [];
  const credentials = await deriveManagedR2S3Credentials(
    { accountId, apiToken, bucket },
    {
      request: async (url, init) => {
        requests.push({ url, authorization: init.headers.Authorization });
        if (url.endsWith("/user/tokens/verify")) {
          return cloudflareResponse({ id: tokenId, status: "active" });
        }
        return cloudflareResponse({ name: bucket });
      },
    },
  );

  assert.deepEqual(credentials, {
    accessKeyId: tokenId,
    secretAccessKey: createHash("sha256").update(apiToken).digest("hex"),
    bucketPresent: true,
  });
  assert.deepEqual(requests, [
    {
      url: "https://api.cloudflare.com/client/v4/user/tokens/verify",
      authorization: `Bearer ${apiToken}`,
    },
    {
      url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}`,
      authorization: `Bearer ${apiToken}`,
    },
  ]);
});

test("allows an already-absent bucket only for idempotent destructive retries", async () => {
  const request = async (url) =>
    url.endsWith("/user/tokens/verify")
      ? cloudflareResponse({ id: tokenId, status: "active" })
      : new Response(null, { status: 404 });

  await assert.rejects(
    deriveManagedR2S3Credentials({ accountId, apiToken, bucket }, { request }),
    /bucket is absent/,
  );
  const credentials = await deriveManagedR2S3Credentials(
    { accountId, apiToken, bucket, allowMissing: true },
    { request },
  );
  assert.equal(credentials.bucketPresent, false);
});

test("fails closed for inactive tokens, failed bucket access, and identity mismatches", async () => {
  await assert.rejects(
    deriveManagedR2S3Credentials(
      { accountId, apiToken, bucket },
      { request: async () => cloudflareResponse({ id: tokenId, status: "expired" }) },
    ),
    /token is not active/,
  );

  await assert.rejects(
    deriveManagedR2S3Credentials(
      { accountId, apiToken, bucket },
      {
        request: sequenceRequest(
          cloudflareResponse({ id: tokenId, status: "active" }),
          new Response(null, { status: 403 }),
        ),
      },
    ),
    /bucket access verification failed/,
  );

  await assert.rejects(
    deriveManagedR2S3Credentials(
      { accountId, apiToken, bucket },
      {
        request: sequenceRequest(
          cloudflareResponse({ id: tokenId, status: "active" }),
          cloudflareResponse({ name: "me3-mi-fedcba9876543210-r2" }),
        ),
      },
    ),
    /bucket identity does not match/,
  );
});

test("rejects untrusted credential contracts before making a request", async () => {
  let requested = false;
  await assert.rejects(
    deriveManagedR2S3Credentials(
      { accountId: `${accountId}\nAWS_ACCESS_KEY_ID=bad`, apiToken, bucket },
      { request: async () => (requested = true) },
    ),
    /contract is invalid/,
  );
  assert.equal(requested, false);
});

test("masks derived values before writing the runner environment", () => {
  const directory = mkdtempSync(join(tmpdir(), "me3-r2-credentials-"));
  const githubEnv = join(directory, "github-env");
  const secretAccessKey = createHash("sha256").update(apiToken).digest("hex");
  const events = [];
  try {
    persistManagedR2S3Credentials(
      { accessKeyId: tokenId, secretAccessKey, bucketPresent: true },
      {
        githubEnv,
        emitMask: (value) => events.push(["mask", value]),
        append: (path, value, options) => {
          events.push(["append", path]);
          appendFileSync(path, value, options);
        },
      },
    );

    assert.deepEqual(events.slice(0, 2), [
      ["mask", tokenId],
      ["mask", secretAccessKey],
    ]);
    assert.equal(events[2][0], "append");
    assert.equal(
      readFileSync(githubEnv, "utf8"),
      [
        `AWS_ACCESS_KEY_ID=${tokenId}`,
        `AWS_SECRET_ACCESS_KEY=${secretAccessKey}`,
        "AWS_DEFAULT_REGION=auto",
        "ME3_MANAGED_SOURCE_R2_PRESENT=true",
        "",
      ].join("\n"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function cloudflareResponse(result) {
  return Response.json({ success: true, result });
}

function sequenceRequest(...responses) {
  return async () => responses.shift();
}
