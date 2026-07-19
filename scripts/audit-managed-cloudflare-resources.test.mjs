import assert from "node:assert/strict";
import test from "node:test";
import {
  ManagedResourceAuditError,
  auditManagedCloudflareResources,
  normalizeExpectedManagedResourceManifests,
  runManagedCloudflareResourceAudit,
} from "./audit-managed-cloudflare-resources.mjs";

const ACCOUNT_ID = "a".repeat(32);
const API_TOKEN = "test-token-that-must-never-be-reported";
const FIRST = manifest("1");
const SECOND = manifest("2");

test("audits every managed resource across each documented pagination shape", async () => {
  const fake = inventoryFetch({ manifests: [FIRST, SECOND] });
  const report = await auditManagedCloudflareResources(
    {
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      expectedManifests: JSON.stringify([SECOND, FIRST]),
    },
    fake.request,
  );

  assert.deepEqual(report, {
    ok: true,
    manifestCount: 2,
    counts: {
      expected: {
        workers: 2,
        d1: 2,
        r2: 2,
        queues: 4,
        durableObjectNamespaces: 2,
      },
      observedManaged: {
        workers: 2,
        d1: 2,
        r2: 2,
        queues: 4,
        durableObjectNamespaces: 2,
      },
      missing: 0,
      unexpected: 0,
      identityMismatches: 0,
    },
    missing: [],
    unexpected: [],
    identityMismatches: [],
  });
  assert.equal(fake.calls.length, 9);
  assert.ok(fake.calls.every((call) => call.method === "GET"));
  assert.ok(fake.calls.every((call) => call.authorization === `Bearer ${API_TOKEN}`));
  assert.ok(fake.calls.every((call) => call.body === undefined));
  assert.equal(
    fake.calls.filter((call) => call.pathname.endsWith("/workers/scripts")).length,
    1,
  );
  assert.equal(
    fake.calls.find((call) => call.pathname.endsWith("/workers/scripts"))?.search,
    "",
  );
  assert.deepEqual(
    fake.calls
      .filter((call) => call.pathname.endsWith("/d1/database"))
      .map((call) => call.params.page),
    ["1", "2"],
  );
  assert.deepEqual(
    fake.calls
      .filter((call) => call.pathname.endsWith("/r2/buckets"))
      .map((call) => call.params.cursor || null),
    [null, "r2-next-page"],
  );
  assert.deepEqual(
    fake.calls
      .filter((call) => call.pathname.endsWith("/queues"))
      .map((call) => call.params.page),
    ["1", "2"],
  );
  assert.deepEqual(
    fake.calls
      .filter((call) => call.pathname.endsWith("/workers/durable_objects/namespaces"))
      .map((call) => call.params.page),
    ["1", "2"],
  );
});

test("reports missing, unexpected, and mismatched identities without provider metadata", async () => {
  const orphan = manifest("2");
  const fake = inventoryFetch({
    raw: {
      workers: [
        { id: orphan.workerName, secret: "worker-provider-metadata" },
        { id: "not-managed-owner-worker", secret: "private-worker-data" },
      ],
      d1Pages: [
        [
          {
            name: FIRST.d1Name,
            uuid: "f1111111-1111-4111-8111-111111111111",
            private_field: "database-provider-metadata",
          },
          { name: orphan.d1Name, uuid: orphan.d1Id },
        ],
      ],
      r2Pages: [[{ name: FIRST.r2Name }, { name: orphan.r2Name }]],
      queuePages: [
        [
          {
            queue_name: FIRST.queueNames[0],
            queue_id: "unsafe queue id with private text",
            consumers: [{ script_name: "private-consumer" }],
          },
          { queue_name: orphan.queueNames[0], queue_id: "b".repeat(32) },
        ],
      ],
      durableObjectPages: [
        [
          {
            script: FIRST.workerName,
            id: "f".repeat(32),
            class: "PrivateUnexpectedClass",
          },
          {
            script: orphan.workerName,
            id: orphan.durableObjectNamespaceId,
            class: "Me3UserAgent",
          },
        ],
      ],
    },
  });
  const report = await auditManagedCloudflareResources(
    {
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      expectedManifests: [FIRST],
    },
    fake.request,
  );

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map(({ resourceType, name }) => [resourceType, name]),
    [
      ["queue", FIRST.queueNames[1]],
      ["worker", FIRST.workerName],
    ],
  );
  assert.ok(
    report.unexpected.some(
      (item) => item.resourceType === "worker" && item.name === orphan.workerName,
    ),
  );
  assert.ok(
    report.unexpected.some(
      (item) => item.resourceType === "d1" && item.name === FIRST.d1Name,
    ),
  );
  assert.ok(
    report.identityMismatches.some(
      (item) => item.resourceType === "d1" && item.reason === "name_or_id_mismatch",
    ),
  );
  assert.ok(
    report.identityMismatches.some(
      (item) => item.resourceType === "queue" && item.reason === "invalid_observed_id",
    ),
  );
  assert.ok(
    report.identityMismatches.some(
      (item) =>
        item.resourceType === "durable_object_namespace" &&
        item.reason === "script_id_or_class_mismatch",
    ),
  );
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    API_TOKEN,
    "provider-metadata",
    "private-worker-data",
    "private-consumer",
    "PrivateUnexpectedClass",
    "unsafe queue id",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test("an empty expected manifest array treats every managed resource as unexpected", async () => {
  const fake = inventoryFetch({ manifests: [FIRST] });
  const report = await auditManagedCloudflareResources(
    { accountId: ACCOUNT_ID, apiToken: API_TOKEN, expectedManifests: "[]" },
    fake.request,
  );
  assert.equal(report.ok, false);
  assert.equal(report.manifestCount, 0);
  assert.equal(report.counts.missing, 0);
  assert.equal(report.counts.unexpected, 6);
  assert.equal(report.counts.identityMismatches, 0);
});

test("accepts Cloudflare zero-page pagination for an empty queue inventory", async () => {
  const fake = inventoryFetch({
    manifests: [FIRST],
    raw: { queuePages: [[]] },
    totalPageOverrides: { queues: [0] },
  });
  const report = await auditManagedCloudflareResources(
    { accountId: ACCOUNT_ID, apiToken: API_TOKEN, expectedManifests: [FIRST] },
    fake.request,
  );

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing
      .filter((item) => item.resourceType === "queue")
      .map((item) => item.name),
    FIRST.queueNames,
  );
});

test("strictly validates manifest structure, names, ids, and global uniqueness", () => {
  const invalidValues = [
    {},
    "{}",
    [{ ...FIRST, ownerEmail: "private@example.com" }],
    [{ ...FIRST, installationId: FIRST.installationId.toUpperCase() }],
    [{ ...FIRST, workerName: SECOND.workerName }],
    [{ ...FIRST, d1Name: SECOND.d1Name }],
    [{ ...FIRST, d1Id: `A${FIRST.d1Id.slice(1)}` }],
    [{ ...FIRST, r2Name: SECOND.r2Name }],
    [{ ...FIRST, queueNames: [] }],
    [{ ...FIRST, queueNames: ["me3-social-publish"] }],
    [{ ...FIRST, queueNames: [FIRST.queueNames[0], FIRST.queueNames[0]] }],
    [{ ...FIRST, durableObjectNamespaceId: "not-an-id" }],
    [{ ...FIRST, durableObjectClassName: "AnotherClass" }],
    [FIRST, { ...SECOND, d1Id: FIRST.d1Id }],
    [FIRST, { ...SECOND, durableObjectNamespaceId: FIRST.durableObjectNamespaceId }],
    [FIRST, { ...SECOND, queueNames: [FIRST.queueNames[0]] }],
  ];
  for (const value of invalidValues) {
    assert.throws(
      () => normalizeExpectedManagedResourceManifests(value),
      ManagedResourceAuditError,
    );
  }
  assert.deepEqual(normalizeExpectedManagedResourceManifests("[]"), []);
  assert.deepEqual(
    normalizeExpectedManagedResourceManifests([
      { ...FIRST, durableObjectClassName: "Me3UserAgent" },
    ])[0],
    { ...FIRST, durableObjectClassName: "Me3UserAgent" },
  );
});

test("fails closed for API errors, incomplete numbered pagination, and cursor loops", async (t) => {
  await t.test("status-only provider error", async () => {
    await assert.rejects(
      auditManagedCloudflareResources(
        { accountId: ACCOUNT_ID, apiToken: API_TOKEN, expectedManifests: [] },
        async () => new Response("private provider failure", { status: 403 }),
      ),
      (error) =>
        error instanceof ManagedResourceAuditError && error.code === "cloudflare_response_403",
    );
  });

  await t.test("numbered page count changes", async () => {
    const fake = inventoryFetch({
      raw: { d1Pages: [[], []] },
      totalPageOverrides: { d1: [2, 3] },
    });
    await assert.rejects(
      auditManagedCloudflareResources(
        { accountId: ACCOUNT_ID, apiToken: API_TOKEN, expectedManifests: [] },
        fake.request,
      ),
      (error) =>
        error instanceof ManagedResourceAuditError &&
        error.code === "cloudflare_d1_pagination_invalid",
    );
  });

  await t.test("zero pages cannot contain resources", async () => {
    const fake = inventoryFetch({
      manifests: [FIRST],
      totalPageOverrides: { queues: [0] },
    });
    await assert.rejects(
      auditManagedCloudflareResources(
        { accountId: ACCOUNT_ID, apiToken: API_TOKEN, expectedManifests: [FIRST] },
        fake.request,
      ),
      (error) =>
        error instanceof ManagedResourceAuditError &&
        error.code === "cloudflare_queues_pagination_invalid" &&
        error.details?.requestedPage === 1 &&
        error.details?.resultCount > 0,
    );
  });

  await t.test("R2 cursor repeats", async () => {
    const fake = inventoryFetch({
      raw: { r2Pages: [[], []] },
      r2Cursors: ["repeated", "repeated"],
    });
    await assert.rejects(
      auditManagedCloudflareResources(
        { accountId: ACCOUNT_ID, apiToken: API_TOKEN, expectedManifests: [] },
        fake.request,
      ),
      (error) =>
        error instanceof ManagedResourceAuditError &&
        error.code === "cloudflare_r2_pagination_invalid",
    );
  });
});

test("CLI runner returns clean, drift, and configuration exit codes with JSON-only output", async () => {
  const clean = outputSink();
  assert.equal(
    await runManagedCloudflareResourceAudit({
      env: auditEnv([FIRST]),
      request: inventoryFetch({ manifests: [FIRST] }).request,
      stdout: clean.stdout,
      stderr: clean.stderr,
    }),
    0,
  );
  assert.equal(JSON.parse(clean.out()).ok, true);
  assert.equal(clean.err(), "");

  const drift = outputSink();
  assert.equal(
    await runManagedCloudflareResourceAudit({
      env: auditEnv([]),
      request: inventoryFetch({ manifests: [FIRST] }).request,
      stdout: drift.stdout,
      stderr: drift.stderr,
    }),
    1,
  );
  assert.equal(JSON.parse(drift.out()).ok, false);
  assert.equal(drift.err(), "");

  const invalid = outputSink();
  assert.equal(
    await runManagedCloudflareResourceAudit({
      env: { ...auditEnv([]), CLOUDFLARE_ACCOUNT_ID: "invalid" },
      request: inventoryFetch({ manifests: [] }).request,
      stdout: invalid.stdout,
      stderr: invalid.stderr,
    }),
    2,
  );
  assert.equal(invalid.out(), "");
  assert.deepEqual(JSON.parse(invalid.err()), {
    ok: false,
    error: "cloudflare_credentials_invalid",
  });
  assert.doesNotMatch(invalid.err(), new RegExp(API_TOKEN));
});

function manifest(digit) {
  const installationId = `mi-${digit.repeat(16)}`;
  const workerName = `me3-${installationId}`;
  return {
    installationId,
    workerName,
    d1Name: `${workerName}-d1`,
    d1Id: `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`,
    r2Name: `${workerName}-r2`,
    queueNames: [`${workerName}-social-publish`, `${workerName}-social-publish-dlq`],
    durableObjectNamespaceId: digit.repeat(32),
  };
}

function inventoryFetch({
  manifests = [],
  raw = {},
  totalPageOverrides = {},
  r2Cursors,
} = {}) {
  const workers = raw.workers || [
    ...manifests.map((item) => ({ id: item.workerName })),
    { id: "self-hosted-me3" },
  ];
  const d1Pages = raw.d1Pages || splitPages([
    ...manifests.map((item) => ({ name: item.d1Name, uuid: item.d1Id })),
    { name: "self-hosted-database", uuid: "99999999-9999-4999-8999-999999999999" },
  ]);
  const r2Pages = raw.r2Pages || splitPages([
    ...manifests.map((item) => ({ name: item.r2Name })),
    { name: "self-hosted-bucket" },
  ]);
  const queueItems = manifests.flatMap((item, manifestIndex) =>
    item.queueNames.map((queueName, queueIndex) => ({
      queue_name: queueName,
      queue_id: `${manifestIndex + 1}${queueIndex + 1}`.padEnd(32, "a"),
    })),
  );
  const queuePages = raw.queuePages || splitPages([
    ...queueItems,
    { queue_name: "self-hosted-queue", queue_id: "9".repeat(32) },
  ]);
  const durableObjectPages = raw.durableObjectPages || splitPages([
    ...manifests.map((item) => ({
      script: item.workerName,
      id: item.durableObjectNamespaceId,
      class: "Me3UserAgent",
    })),
    { script: "self-hosted-me3", id: "9".repeat(32), class: "Me3UserAgent" },
  ]);
  const calls = [];

  return {
    calls,
    request: async (input, init = {}) => {
      const url = new URL(input);
      const accountPrefix = `/client/v4/accounts/${ACCOUNT_ID}/`;
      assert.equal(url.origin, "https://api.cloudflare.com");
      assert.ok(url.pathname.startsWith(accountPrefix));
      calls.push({
        method: init.method,
        authorization: init.headers?.Authorization,
        body: init.body,
        pathname: url.pathname,
        search: url.search,
        params: Object.fromEntries(url.searchParams),
      });
      const resource = url.pathname.slice(accountPrefix.length);
      if (resource === "workers/scripts") return response(workers);
      if (resource === "d1/database") {
        return numberedResponse(
          d1Pages,
          url,
          totalPageOverrides.d1,
        );
      }
      if (resource === "r2/buckets") {
        const page = url.searchParams.has("cursor") ? 1 : 0;
        const cursors = r2Cursors || r2Pages.map((_, index) =>
          index < r2Pages.length - 1 ? "r2-next-page" : undefined,
        );
        return response(
          { buckets: r2Pages[page] || [] },
          cursors[page] ? { cursor: cursors[page], per_page: 100 } : { per_page: 100 },
        );
      }
      if (resource === "queues") {
        return numberedResponse(
          queuePages,
          url,
          totalPageOverrides.queues,
        );
      }
      if (resource === "workers/durable_objects/namespaces") {
        return numberedResponse(
          durableObjectPages,
          url,
          totalPageOverrides.durableObjectNamespaces,
        );
      }
      return new Response("not found", { status: 404 });
    },
  };
}

function splitPages(values) {
  if (values.length <= 1) return [values];
  const midpoint = Math.ceil(values.length / 2);
  return [values.slice(0, midpoint), values.slice(midpoint)];
}

function numberedResponse(pages, url, overrides) {
  const page = Number(url.searchParams.get("page"));
  const totalPages = overrides?.[page - 1] ?? pages.length;
  return response(pages[page - 1] || [], {
    count: (pages[page - 1] || []).length,
    page,
    per_page: 100,
    total_count: pages.flat().length,
    total_pages: totalPages,
  });
}

function response(result, resultInfo) {
  return new Response(
    JSON.stringify({
      success: true,
      result,
      ...(resultInfo ? { result_info: resultInfo } : {}),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function auditEnv(manifests) {
  return {
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: API_TOKEN,
    ME3_MANAGED_EXPECTED_MANIFESTS: JSON.stringify(manifests),
  };
}

function outputSink() {
  let out = "";
  let err = "";
  return {
    stdout: { write: (value) => (out += value) },
    stderr: { write: (value) => (err += value) },
    out: () => out.trim(),
    err: () => err.trim(),
  };
}
