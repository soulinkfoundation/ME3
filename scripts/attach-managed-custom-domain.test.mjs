import assert from "node:assert/strict";
import test from "node:test";
import { attachManagedCustomDomain } from "./attach-managed-custom-domain.mjs";

const ACCOUNT_ID = "a".repeat(32);
const ZONE_ID = "b".repeat(32);
const WORKER_NAME = "me3-mi-1234567890abcdef";
const HOSTNAME = "owner.me3.app";

test("attaches and verifies the exact permanent managed hostname", async () => {
  let domain = null;
  const calls = [];
  const result = await attachManagedCustomDomain(
    contract(),
    async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({ method: init.method || "GET", search: parsed.search, body: init.body });
      assert.equal(
        new Headers(init.headers).get("Authorization"),
        "Bearer cloudflare-api-token",
      );
      if ((init.method || "GET") === "PUT") {
        assert.deepEqual(JSON.parse(init.body), {
          hostname: HOSTNAME,
          service: WORKER_NAME,
          zone_id: ZONE_ID,
        });
        domain = exactDomain();
        return api(domain);
      }
      const filter = parsed.searchParams.get("hostname") || parsed.searchParams.get("service");
      return api(domain && [HOSTNAME, WORKER_NAME].includes(filter) ? [domain] : []);
    },
  );

  assert.deepEqual(result, {
    hostname: HOSTNAME,
    origin: `https://${HOSTNAME}`,
    domainId: "domain-id",
  });
  assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
});

test("is idempotent and rejects a hostname assigned to another Worker", async () => {
  let current = exactDomain();
  let puts = 0;
  const request = async (url, init = {}) => {
    const parsed = new URL(url);
    if ((init.method || "GET") === "PUT") puts += 1;
    const filter = parsed.searchParams.get("hostname") || parsed.searchParams.get("service");
    return api([HOSTNAME, WORKER_NAME].includes(filter) ? [current] : []);
  };

  await attachManagedCustomDomain(contract(), request);
  assert.equal(puts, 0);

  current = { ...exactDomain(), service: "unrelated-worker" };
  await assert.rejects(
    attachManagedCustomDomain(contract(), request),
    /conflicts with an existing assignment/,
  );
});

test("reports sanitized Cloudflare API errors", async () => {
  const exposed = "secret-token-value-123456789012345678901234567890";
  await assert.rejects(
    attachManagedCustomDomain(contract(), async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10000, message: `Authentication failed ${exposed}` }],
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    ),
    (error) => {
      assert.match(
        error.message,
        /status 403 \(10000: Authentication failed \[redacted\]\)/,
      );
      assert.doesNotMatch(error.message, new RegExp(exposed));
      return true;
    },
  );
});

function contract() {
  return {
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    apiToken: "cloudflare-api-token",
    workerName: WORKER_NAME,
    hostname: HOSTNAME,
  };
}

function exactDomain() {
  return {
    id: "domain-id",
    hostname: HOSTNAME,
    service: WORKER_NAME,
    zone_id: ZONE_ID,
    zone_name: "me3.app",
  };
}

function api(result) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
