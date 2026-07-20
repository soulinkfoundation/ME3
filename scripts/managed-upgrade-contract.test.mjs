import assert from "node:assert/strict";
import test from "node:test";
import {
  hashManagedUpgradeResourceManifest,
  MANAGED_UPGRADE_CALLBACK_URL,
  normalizeManagedUpgradeContract,
} from "./managed-upgrade-contract.mjs";

const installationId = "mi-1234567890abcdef";
const workerName = `me3-${installationId}`;
const base = {
  attemptId: "11111111-1111-4111-8111-111111111111",
  installationId,
  currentReleaseTag: "v0.1.108",
  targetReleaseTag: "v0.1.109",
  targetReleaseSha: "a".repeat(40),
  callbackUrl: MANAGED_UPGRADE_CALLBACK_URL,
  workerName,
  d1Name: `${workerName}-d1`,
  d1Id: "22222222-2222-4222-8222-222222222222",
  r2Name: `${workerName}-r2`,
  queueNames: [
    `${workerName}-social-publish-dlq`,
    `${workerName}-social-publish`,
  ],
  durableObjectNamespaceId: "b".repeat(32),
  publicOrigin: "https://owner.me3.app",
  canonicalHostname: "owner.me3.app",
  zoneId: "c".repeat(32),
};

test("normalizes one exact immutable managed upgrade contract", () => {
  const value = normalizeManagedUpgradeContract({
    ...base,
    queueNames: JSON.stringify(base.queueNames),
  });

  assert.deepEqual(value.queueNames, [...base.queueNames].sort());
  assert.equal(value.publicOrigin, `https://${value.canonicalHostname}`);
  assert.match(hashManagedUpgradeResourceManifest(value), /^[0-9a-f]{64}$/);
  assert.equal(
    hashManagedUpgradeResourceManifest(value),
    hashManagedUpgradeResourceManifest({
      ...value,
      queueNames: [...value.queueNames].reverse(),
    }),
  );
});

test("allows an exact same-release rehearsal", () => {
  assert.equal(
    normalizeManagedUpgradeContract({
      ...base,
      targetReleaseTag: base.currentReleaseTag,
    }).targetReleaseTag,
    base.currentReleaseTag,
  );
});

test("rejects substituted or incomplete frozen identities", () => {
  const invalid = [
    { workerName: "me3-mi-ffffffffffffffff" },
    { d1Id: "not-a-d1-id" },
    { queueNames: [base.queueNames[0], base.queueNames[0]] },
    { queueNames: ["me3-shared-queue"] },
    { durableObjectNamespaceId: "d".repeat(31) },
    { publicOrigin: "https://other.me3.app" },
    { canonicalHostname: "owner.example.com" },
    { callbackUrl: "https://api.me3.app/api/managed-install/provisioning/callback" },
    { targetReleaseSha: "a".repeat(39) },
    { attemptId: "11111111-1111-1111-8111-111111111111" },
  ];

  for (const change of invalid) {
    assert.throws(
      () => normalizeManagedUpgradeContract({ ...base, ...change }),
      /managed upgrade contract is invalid/,
    );
  }
});
