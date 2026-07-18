#!/usr/bin/env node

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ITERATIONS = 100_000;

export function prepareManagedPortableCapture(database, recoveryPassword) {
  if (!database || !existsSync(database)) throw new Error("managed D1 capture is missing");
  if (typeof recoveryPassword !== "string" || recoveryPassword.length < 32) {
    throw new Error("managed recovery password is unavailable");
  }
  const owner = sqliteJson(
    database,
    "SELECT id, email FROM owner_profile WHERE id = 'owner';",
  );
  if (
    owner.length !== 1 ||
    owner[0].id !== "owner" ||
    typeof owner[0].email !== "string" ||
    !owner[0].email.trim().includes("@")
  ) {
    throw new Error("managed owner identity is not portable");
  }
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(recoveryPassword, salt, ITERATIONS, 32, "sha256");
  const encoded = `pbkdf2_sha256$${ITERATIONS}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
  runSqlite(
    database,
    `UPDATE owner_profile SET password_hash = ${sqlQuote(encoded)}, updated_at = CURRENT_TIMESTAMP WHERE id = 'owner';`,
  );
  if (!managedPortablePasswordMatches(database, recoveryPassword)) {
    throw new Error("managed recovery password verification failed");
  }
  return { ok: true, ownerId: "owner", recovery: "managed-export-passphrase" };
}

export function managedPortablePasswordMatches(database, recoveryPassword) {
  const rows = sqliteJson(
    database,
    "SELECT password_hash AS passwordHash FROM owner_profile WHERE id = 'owner';",
  );
  const [algorithm, iterationsText, saltText, hashText, extra] = String(
    rows[0]?.passwordHash || "",
  ).split("$");
  const iterations = Number(iterationsText);
  if (
    extra !== undefined ||
    algorithm !== "pbkdf2_sha256" ||
    iterations !== ITERATIONS ||
    !saltText ||
    !hashText
  ) {
    return false;
  }
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (!salt.length || expected.length !== 32) return false;
  const actual = pbkdf2Sync(recoveryPassword, salt, iterations, 32, "sha256");
  return timingSafeEqual(actual, expected);
}

function sqliteJson(database, sql) {
  const output = runSqlite(database, sql, true).trim();
  return output ? JSON.parse(output) : [];
}

function runSqlite(database, sql, json = false) {
  const result = spawnSync("sqlite3", [...(json ? ["-json"] : []), database], {
    input: `.bail on\n${sql}\n`,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("managed portable capture preparation failed");
  return result.stdout;
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const database = process.argv[2];
  console.log(
    JSON.stringify(
      prepareManagedPortableCapture(database, process.env.ME3_PORTABLE_PASSPHRASE),
    ),
  );
}
