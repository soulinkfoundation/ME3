import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  after,
  before,
  test,
} from "node:test";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import {
  PortableError,
  buildManifestForTest,
  comparePortableArchives,
  exportPortableV1,
  resolveCoreInfo,
  restorePortableV1,
  validateArchive,
} from "./portable-v1.mjs";
import {
  PROOF_DEVICE_TOKEN_HASH,
  PROOF_INSTALL_ID,
  PROOF_PASSPHRASE,
  PROOF_PLATFORM_SECRET,
  PROOF_SESSION_SECRET,
  createMigratedDatabase,
  seedProofInstallation,
} from "./portable-proof.mjs";

let root;
let source;
let sourceR2;
let cleanTarget;
let archive;

before(async () => {
  root = mkdtempSync(join(tmpdir(), "me3-portable-tests-"));
  source = createMigratedDatabase(join(root, "source"));
  cleanTarget = createMigratedDatabase(join(root, "clean-target"));
  sourceR2 = join(root, "source-r2");
  archive = join(root, "snapshot.me3-portable");
  seedProofInstallation(source, sourceR2);
  await exportPortableV1({
    database: source,
    r2Directory: sourceR2,
    output: archive,
    passphrase: PROOF_PASSPHRASE,
    createdAt: "2026-07-15T12:00:00.000Z",
  });
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

test("exports sanitized owner data and restores the exact identity, D1 rows, and R2 objects", async () => {
  const target = freshTarget("round-trip");
  const targetR2 = join(root, "round-trip-r2");
  const importSql = join(root, "round-trip-import.sql");
  const validated = validateArchive(archive, PROOF_PASSPHRASE);
  assert.deepEqual(Object.keys(validated.secrets.installSecrets).sort(), [
    "ME3_CORE_INSTALL_ID",
    "TOKEN_ENCRYPTION_KEY",
  ]);
  const result = restorePortableV1({
    archive,
    targetDatabase: target,
    targetR2Directory: targetR2,
    importSqlOutput: importSql,
    passphrase: PROOF_PASSPHRASE,
  });

  assert.equal(result.logicalInstallId, PROOF_INSTALL_ID);
  assert.equal(result.databaseRows, validated.manifest.database.portableRowCount);
  assert.equal(result.r2Objects, validated.manifest.objects.count);
  assert.equal(result.sessionsRotated, true);
  assert.equal(result.requiresClientRepair, true);
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM assistant_messages;"), "1");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM mission_tasks;"), "1");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM journal_entries;"), "1");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM mobile_pairings;"), "0");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM mobile_refresh_tokens;"), "0");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM auth_rate_limits;"), "0");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM me3_install_claim_states;"), "0");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM agent_turn_results;"), "0");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM social_accounts;"), "0");
  assert.equal(queryScalar(target, "SELECT COUNT(*) FROM ai_gateway_settings;"), "0");
  assert.equal(
    queryScalar(target, "SELECT COUNT(*) FROM email_provider_settings WHERE provider_id = 'cloudflare-email';"),
    "0",
  );
  assert.equal(
    queryScalar(target, "SELECT encrypted_client_secret IS NULL AND enabled = 0 FROM social_provider_settings;"),
    "1",
  );
  assert.equal(
    queryScalar(target, "SELECT custom_domain_cf_id IS NULL AND custom_domain_status = 'pending' FROM sites;"),
    "1",
  );
  assert.equal(
    queryScalar(target, "SELECT cf_destination_id IS NULL AND cf_rule_id IS NULL AND status = 'pending_setup' FROM mailbox_aliases;"),
    "1",
  );
  assert.equal(
    queryScalar(target, "SELECT value FROM install_secrets WHERE name = 'ME3_CORE_INSTALL_ID';"),
    PROOF_INSTALL_ID,
  );
  assert.notEqual(
    queryScalar(target, "SELECT value FROM install_secrets WHERE name = 'JWT_SECRET';"),
    PROOF_SESSION_SECRET,
  );
  assert.equal(
    queryScalar(target, "SELECT COUNT(*) FROM install_secrets WHERE name IN ('ME3_CLOUD_OWNER_ID', 'ME3_CLOUD_CORE_TOKEN');"),
    "0",
  );
  assert.equal(readFileSync(join(targetR2, "assistant", "owner", "proof.txt"), "utf8"), "assistant proof\n");
  assert.equal(listFiles(targetR2).length, 5);
  assert.equal(statSync(importSql).mode & 0o777, 0o600);
  assert.equal(readFileSync(importSql, "utf8").includes(PROOF_PLATFORM_SECRET), false);
  assert.equal(readFileSync(importSql, "utf8").includes(PROOF_SESSION_SECRET), false);

  const restoredArchive = join(root, "restored-snapshot.me3-portable");
  await exportPortableV1({
    database: target,
    r2Directory: targetR2,
    output: restoredArchive,
    passphrase: PROOF_PASSPHRASE,
    createdAt: "2026-07-15T12:30:00.000Z",
  });
  assert.equal(
    comparePortableArchives({
      sourceArchive: archive,
      restoredArchive,
      passphrase: PROOF_PASSPHRASE,
    }).ok,
    true,
  );
});

test("archive omits platform, session, device, and managed-only credentials", () => {
  const textFiles = listFiles(archive)
    .filter((path) => !path.includes(`${join("objects", "blobs")}`))
    .map((path) =>
      path.endsWith("d1-sanitized.sql.gz")
        ? gunzipSync(readFileSync(path)).toString("utf8")
        : readFileSync(path, "utf8"),
    )
    .join("\n");
  assert.equal(textFiles.includes(PROOF_PLATFORM_SECRET), false);
  assert.equal(textFiles.includes(PROOF_SESSION_SECRET), false);
  assert.equal(textFiles.includes(PROOF_DEVICE_TOKEN_HASH), false);
  assert.equal(textFiles.includes("cloudflare-account-must-not-export"), false);
  assert.equal(textFiles.includes("managed-gateway-must-not-export"), false);
  assert.equal(textFiles.includes("cloudflare-domain-id-must-reset"), false);
  assert.equal(textFiles.includes("cf-destination-must-reset"), false);
  assert.equal(textFiles.includes("cf-rule-must-reset"), false);
});

test("wrong passphrases, tampering, version mismatches, and non-clean targets fail before mutation", () => {
  const wrongKeyTarget = freshTarget("wrong-key");
  const wrongKeyBefore = fileHash(wrongKeyTarget);
  assertPortableCode(
    () =>
      restorePortableV1({
        archive,
        targetDatabase: wrongKeyTarget,
        targetR2Directory: join(root, "wrong-key-r2"),
        passphrase: "this-passphrase-is-wrong",
      }),
    "WRONG_PASSPHRASE",
  );
  assert.equal(fileHash(wrongKeyTarget), wrongKeyBefore);
  assert.equal(existsSync(join(root, "wrong-key-r2")), false);

  const tamperedArchive = join(root, "tampered.me3-portable");
  cpSync(archive, tamperedArchive, { recursive: true });
  const blob = listFiles(join(tamperedArchive, "objects", "blobs"))[0];
  writeFileSync(blob, "tampered");
  const tamperedTarget = freshTarget("tampered");
  const tamperedBefore = fileHash(tamperedTarget);
  assertPortableCode(
    () =>
      restorePortableV1({
        archive: tamperedArchive,
        targetDatabase: tamperedTarget,
        targetR2Directory: join(root, "tampered-r2"),
        passphrase: PROOF_PASSPHRASE,
      }),
    "ARCHIVE_TAMPERED",
  );
  assert.equal(fileHash(tamperedTarget), tamperedBefore);

  const reboundArchive = join(root, "rebound-tampered.me3-portable");
  cpSync(archive, reboundArchive, { recursive: true });
  const configPath = join(reboundArchive, "config", "install.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.requiresClientRepair = false;
  writeFileSync(configPath, `${JSON.stringify(config)}\n`);
  const manifestPath = join(reboundArchive, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.files.installConfigSha256 = fileHash(configPath);
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  rewriteArchiveChecksums(reboundArchive);
  assertPortableCode(
    () => validateArchive(reboundArchive, PROOF_PASSPHRASE),
    "ARCHIVE_TAMPERED",
  );

  const versionTarget = freshTarget("version");
  const versionBefore = fileHash(versionTarget);
  const currentCore = resolveCoreInfo();
  assertPortableCode(
    () =>
      restorePortableV1({
        archive,
        targetDatabase: versionTarget,
        targetR2Directory: join(root, "version-r2"),
        passphrase: PROOF_PASSPHRASE,
        core: { ...currentCore, version: "999.0.0" },
      }),
    "CORE_VERSION_MISMATCH",
  );
  assert.equal(fileHash(versionTarget), versionBefore);

  const occupiedTarget = freshTarget("occupied");
  runSqlite(occupiedTarget, "INSERT INTO owner_profile (id, name) VALUES ('owner', 'Already claimed');");
  const occupiedBefore = fileHash(occupiedTarget);
  assertPortableCode(
    () =>
      restorePortableV1({
        archive,
        targetDatabase: occupiedTarget,
        targetR2Directory: join(root, "occupied-r2"),
        passphrase: PROOF_PASSPHRASE,
      }),
    "TARGET_NOT_CLEAN",
  );
  assert.equal(fileHash(occupiedTarget), occupiedBefore);
});

test("unknown tables, credential fields, and install secret names fail closed", async () => {
  const unknownTable = cloneSource("unknown-table");
  runSqlite(unknownTable, "CREATE TABLE managed_billing_records (id TEXT PRIMARY KEY);");
  await assert.rejects(
    exportPortableV1({
      database: unknownTable,
      r2Directory: sourceR2,
      output: join(root, "unknown-table-archive"),
      passphrase: PROOF_PASSPHRASE,
    }),
    (error) => error instanceof PortableError && error.code === "SCHEMA_UNCLASSIFIED",
  );

  const unknownField = cloneSource("unknown-field");
  runSqlite(unknownField, "ALTER TABLE owner_profile ADD COLUMN deployment_token TEXT;");
  await assert.rejects(
    exportPortableV1({
      database: unknownField,
      r2Directory: sourceR2,
      output: join(root, "unknown-field-archive"),
      passphrase: PROOF_PASSPHRASE,
    }),
    (error) => error instanceof PortableError && error.code === "SECRET_FIELD_UNCLASSIFIED",
  );

  const unknownSecret = cloneSource("unknown-secret");
  runSqlite(
    unknownSecret,
    "INSERT INTO install_secrets (name, value) VALUES ('UNCLASSIFIED_SECRET', 'must-fail');",
  );
  await assert.rejects(
    exportPortableV1({
      database: unknownSecret,
      r2Directory: sourceR2,
      output: join(root, "unknown-secret-archive"),
      passphrase: PROOF_PASSPHRASE,
    }),
    (error) => error instanceof PortableError && error.code === "SECRET_UNCLASSIFIED",
  );

  const invalidSource = cloneSource("invalid-source");
  runSqlite(
    invalidSource,
    "PRAGMA foreign_keys=OFF; UPDATE assistant_messages SET owner_id = 'missing-owner';",
  );
  await assert.rejects(
    exportPortableV1({
      database: invalidSource,
      r2Directory: sourceR2,
      output: join(root, "invalid-source-archive"),
      passphrase: PROOF_PASSPHRASE,
    }),
    (error) => error instanceof PortableError && error.code === "SOURCE_INVALID",
  );
});

test("manifest serialization and semantic content are deterministic", async () => {
  const first = buildManifestForTest({ z: 1, a: { y: 2, b: 3 }, rows: [{ z: 4, a: 5 }] });
  const second = buildManifestForTest({ rows: [{ a: 5, z: 4 }], a: { b: 3, y: 2 }, z: 1 });
  assert.equal(first, second);

  const secondArchive = join(root, "deterministic.me3-portable");
  await exportPortableV1({
    database: source,
    r2Directory: sourceR2,
    output: secondArchive,
    passphrase: PROOF_PASSPHRASE,
    createdAt: "2026-07-15T12:00:00.000Z",
  });
  const firstManifest = JSON.parse(readFileSync(join(archive, "manifest.json"), "utf8"));
  const secondManifest = JSON.parse(readFileSync(join(secondArchive, "manifest.json"), "utf8"));
  delete firstManifest.secrets.envelopeSha256;
  delete secondManifest.secrets.envelopeSha256;
  assert.equal(buildManifestForTest(firstManifest), buildManifestForTest(secondManifest));
});

function freshTarget(name) {
  const path = join(root, `${name}.sqlite`);
  copyFileSync(cleanTarget, path);
  return path;
}

function cloneSource(name) {
  const path = join(root, `${name}.sqlite`);
  copyFileSync(source, path);
  return path;
}

function queryScalar(database, sql) {
  return runSqlite(database, sql).trim();
}

function runSqlite(database, sql) {
  const result = spawnSync("sqlite3", [database], {
    input: `.bail on\n${sql}\n`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function listFiles(rootPath) {
  if (!existsSync(rootPath)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(rootPath);
  return files.sort();
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function rewriteArchiveChecksums(archivePath) {
  const lines = listFiles(archivePath)
    .filter((path) => !path.endsWith("checksums.sha256"))
    .map((path) => `${fileHash(path)}  ${relative(archivePath, path).split(sep).join("/")}`)
    .sort();
  writeFileSync(join(archivePath, "checksums.sha256"), `${lines.join("\n")}\n`);
}

function assertPortableCode(fn, code) {
  assert.throws(fn, (error) => error instanceof PortableError && error.code === code);
}
