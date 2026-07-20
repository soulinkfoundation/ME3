import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configureManagedUpgradeOrigin } from "./configure-managed-upgrade-origin.mjs";

const workerName = "me3-mi-1234567890abcdef";

test("sets the exact frozen origin independently of provisioning controls", () => {
  const directory = mkdtempSync(join(tmpdir(), "me3-upgrade-origin-"));
  const configPath = join(directory, "wrangler.toml");
  writeFileSync(
    configPath,
    `name = "${workerName}"\n[vars]\nME3_DEPLOYMENT_MODE = "managed"\n`,
  );
  try {
    configureManagedUpgradeOrigin({
      configPath,
      workerName,
      publicOrigin: "https://owner.me3.app",
      canonicalHostname: "owner.me3.app",
    });
    const config = readFileSync(configPath, "utf8");
    assert.match(config, /^CORE_WEB_ORIGIN = "https:\/\/owner\.me3\.app"$/m);
    assert.match(config, /^CORE_API_ORIGIN = "https:\/\/owner\.me3\.app"$/m);
    assert.throws(
      () =>
        configureManagedUpgradeOrigin({
          configPath,
          workerName,
          publicOrigin: "https://other.me3.app",
          canonicalHostname: "owner.me3.app",
        }),
      /origin contract is invalid/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
