import assert from "node:assert/strict";
import test from "node:test";
import { verifyManagedCloudflarePlacement } from "./verify-managed-cloudflare-placement.mjs";

const ACCOUNT_ID = "a".repeat(32);
const ZONE_ID = "b".repeat(32);

test("verifies that the managed account owns the hostname zone", async () => {
  const result = await verifyManagedCloudflarePlacement(
    contract(),
    async (url, init = {}) => {
      assert.equal(url, `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}`);
      assert.equal(
        new Headers(init.headers).get("Authorization"),
        "Bearer cloudflare-api-token",
      );
      return api({ id: ZONE_ID, name: "me3.app", account: { id: ACCOUNT_ID } });
    },
  );

  assert.deepEqual(result, {
    ok: true,
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    zoneName: "me3.app",
  });
});

test("rejects a zone owned by a different Cloudflare account", async () => {
  await assert.rejects(
    verifyManagedCloudflarePlacement(
      contract(),
      async () =>
        api({
          id: ZONE_ID,
          name: "me3.app",
          account: { id: "c".repeat(32) },
        }),
    ),
    /managed Cloudflare account does not own the configured hostname zone/,
  );
});

test("reports sanitized Cloudflare errors", async () => {
  const exposed = "secret-token-value-123456789012345678901234567890";
  await assert.rejects(
    verifyManagedCloudflarePlacement(contract(), async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 9109, message: `Invalid access token ${exposed}` }],
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    ),
    (error) => {
      assert.match(
        error.message,
        /status 403 \(9109: Invalid access token \[redacted\]\)/,
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
  };
}

function api(result) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
