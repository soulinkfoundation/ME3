import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const lifecycle = readFileSync(
  resolve(root, ".github/workflows/managed-install-lifecycle.yml"),
  "utf8",
);
const provision = readFileSync(
  resolve(root, ".github/workflows/provision-managed-install.yml"),
  "utf8",
);
const runtimeControl = readFileSync(
  resolve(root, "scripts/managed-runtime-control.mjs"),
  "utf8",
);
const decommissionControl = readFileSync(
  resolve(root, "scripts/decommission-managed-install.mjs"),
  "utf8",
);

test("pins trusted controls, keeps secrets off job scope, and rejects legacy runtimes", () => {
  const jobEnv = lifecycle.slice(
    lifecycle.indexOf("    env:\n"),
    lifecycle.indexOf("\n    steps:\n"),
  );
  assert.doesNotMatch(jobEnv, /secrets\./);
  assert.match(getStep("Check out lifecycle controls"), /ref: \$\{\{ github\.sha \}\}/);
  assert.match(getStep("Check out lifecycle controls"), /persist-credentials: false/);
  assert.doesNotMatch(getStep("Check out lifecycle controls"), /ref: main/);
  assert.ok(
    lifecycle.indexOf("Check out lifecycle controls") <
      lifecycle.indexOf("Validate the complete lifecycle contract"),
  );
  assert.doesNotMatch(
    getStep("Install trusted lifecycle controls without dependency lifecycle scripts"),
    /secrets\./,
  );
  assert.match(
    getStep("Install trusted lifecycle controls without dependency lifecycle scripts"),
    /--ignore-scripts/,
  );
  assert.match(getStep("Seal trusted lifecycle controls"), /sha256sum/);
  assert.match(getStep("Check out the exact managed release"), /persist-credentials: false/);
  assert.doesNotMatch(lifecycle, /pnpm --dir source install/);
  assert.doesNotMatch(lifecycle, /node source\/scripts\//);
  const preflight = getStep("Require the exact lifecycle-capable runtime");
  assert.match(preflight, /managed-runtime-control\.mjs status/);
  assert.match(preflight, /ME3_MANAGED_LIFECYCLE_CALLBACK_SECRET: \$\{\{ secrets\./);
  assert.ok(
    lifecycle.indexOf("Require the exact lifecycle-capable runtime") <
      lifecycle.indexOf("Check out the exact managed release"),
  );
  assert.match(runtimeControl, /runtime_upgrade_required/);
});

test("materializes filtered D1 and independently identical R2 from control code", () => {
  const d1 = getStep("Capture the quiesced D1 database");
  assert.match(d1, /node control\/scripts\/capture-managed-d1\.mjs/);
  assert.doesNotMatch(d1, /source\/scripts\/capture-managed-d1/);
  const r2 = getStep("Materialize a stable R2 snapshot");
  assert.doesNotMatch(r2, /ME3_MANAGED_R2_ACCESS_KEY_ID/);
  assert.match(r2, /managed-r2-verification/);
  assert.equal((r2.match(/aws s3 sync/g) || []).length, 2);
  assert.ok(r2.indexOf("list-r2-s3.mjs") < r2.indexOf("aws s3 sync"));
  assert.match(r2, /sha256sum --check/);
  const verification = getStep("Verify the write barrier and complete capture");
  assert.match(verification, /--r2-verify-dir/);
  const portable = getStep("Create a login-capable portable archive from the captured copy");
  assert.match(portable, /node control\/scripts\/portable\.mjs export/);
  assert.doesNotMatch(portable, /node source\/scripts\/portable\.mjs/);
});

test("derives source R2 credentials from the existing Cloudflare token inside the job", () => {
  const derive = getStep("Derive job-scoped source R2 S3 credentials");
  const verify = getStep("Verify job-scoped source R2 S3 access");
  assert.match(derive, /ME3_MANAGED_CLOUDFLARE_API_TOKEN/);
  for (const step of [derive, verify]) {
    assert.match(step, /inputs\.operation == 'export'/);
    assert.match(step, /inputs\.operation == 'cleanup_failed_provision'/);
    assert.match(
      step,
      /inputs\.operation == 'decommission' && inputs\.export_waived == false/,
    );
  }
  assert.match(derive, /derive-managed-r2-s3-credentials\.mjs/);
  assert.match(derive, /sha256sum --check/);
  assert.match(verify, /aws s3api head-bucket/);
  assert.match(verify, /ME3_MANAGED_SOURCE_R2_PRESENT/);
  assert.match(verify, /ME3_MANAGED_R2_PRESENT/);
  assert.doesNotMatch(lifecycle, /secrets\.ME3_MANAGED_R2_ACCESS_KEY_ID/);
  assert.doesNotMatch(lifecycle, /secrets\.ME3_MANAGED_R2_SECRET_ACCESS_KEY/);
  assert.ok(lifecycle.indexOf(derive) < lifecycle.indexOf("Materialize a stable R2 snapshot"));
  assert.ok(lifecycle.indexOf(verify) < lifecycle.indexOf("Materialize a stable R2 snapshot"));
});

test("requires write-once retention and reversible suspension before export success", () => {
  const retain = getStep("Conditionally retain and independently verify the export");
  const reverify = getStep("Re-download and re-verify retained bytes before service termination");
  const attest = getStep("Attest export retention re-verification");
  const terminate = getStep("Suspend and drain runtime access after verified retention");
  const complete = getStep("Complete the managed export");
  assert.match(retain, /managed-retained-export\.mjs retain/);
  assert.match(reverify, /managed-retained-export\.mjs verify/);
  assert.match(attest, /ME3_MANAGED_STAGE: retention_reverified/);
  assert.match(terminate, /managed-runtime-control\.mjs suspend/);
  assert.doesNotMatch(terminate, /revoke_credentials|purge_storage/);
  assert.match(terminate, /!value\.runtime\?\.credentialsRevokedAt/);
  assert.match(complete, /ME3_MANAGED_STATUS: succeeded/);
  assert.match(complete, /ME3_MANAGED_STAGE: completed/);
  assert.ok(lifecycle.indexOf(retain) < lifecycle.indexOf(reverify));
  assert.ok(lifecycle.indexOf(reverify) < lifecycle.indexOf(attest));
  assert.ok(lifecycle.indexOf(attest) < lifecycle.indexOf(terminate));
  assert.ok(lifecycle.indexOf(terminate) < lifecycle.indexOf(complete));
  assert.doesNotMatch(lifecycle, /FULL_OBJECT|ChecksumAlgorithm|checksum-sha256/i);
  assert.match(
    getStep("Restore renewed service or quiesce an interrupted export"),
    /managed-runtime-control\.mjs resume/,
  );
  const compensation = getStep(
    "Restore renewed service or quiesce an interrupted export",
  );
  assert.match(compensation, /managed-runtime-control\.mjs quiesce/);
  assert.ok(
    compensation.indexOf("managed-runtime-control.mjs resume") <
      compensation.indexOf("managed-runtime-control.mjs quiesce"),
  );
});

test("re-verifies retained evidence and exact absence before decommission success", () => {
  const retryInspection = getStep("Inspect exact decommission retry state");
  const retained = getStep("Re-verify retained evidence before destructive controls");
  const retentionAttestation = getStep("Attest decommission retention re-verification");
  const drain = getStep("Suspend and drain the managed runtime before decommission");
  const drainAttestation = getStep("Attest the decommission runtime drain");
  const purge = getStep("Revoke and purge the drained managed runtime");
  const empty = getStep("Verify source R2 is empty after runtime purge");
  const deletion = getStep("Delete only the exact managed resource manifest");
  const success = getStep("Complete verified decommission");
  assert.match(retryInspection, /inspect-managed-decommission-state\.mjs/);
  assert.match(
    getStep("Require the exact lifecycle-capable runtime"),
    /ME3_MANAGED_RUNTIME_TERMINATED != 'true'/,
  );
  assert.match(retained, /managed-retained-export\.mjs verify/);
  assert.match(retained, /inputs\.export_waived == false/);
  assert.match(retentionAttestation, /inputs\.export_waived == false/);
  assert.match(retentionAttestation, /ME3_MANAGED_STAGE: retention_reverified/);
  assert.match(drain, /managed-runtime-control\.mjs suspend/);
  assert.match(drainAttestation, /ME3_MANAGED_STAGE: runtime_drained/);
  assert.match(purge, /revoke_credentials/);
  assert.match(purge, /purge_storage/);
  assert.match(empty, /--allow-missing/);
  assert.match(empty, /inputs\.export_waived == false/);
  assert.match(deletion, /--export-operation-id/);
  assert.match(deletion, /--export-waived "\$EXPORT_WAIVED"/);
  assert.match(deletion, /--export-md5/);
  assert.match(deletion, /--export-etag/);
  assert.match(success, /ME3_MANAGED_STAGE: verified_absent/);
  assert.ok(lifecycle.indexOf(retained) < lifecycle.indexOf(retentionAttestation));
  assert.ok(lifecycle.indexOf(retentionAttestation) < lifecycle.indexOf(drain));
  assert.ok(lifecycle.indexOf(drain) < lifecycle.indexOf(drainAttestation));
  assert.ok(lifecycle.indexOf(drainAttestation) < lifecycle.indexOf(purge));
  assert.ok(lifecycle.indexOf(purge) < lifecycle.indexOf(empty));
  assert.ok(lifecycle.indexOf(empty) < lifecycle.indexOf(deletion));
  assert.ok(lifecycle.indexOf(deletion) < lifecycle.indexOf(success));
  assert.match(decommissionControl, /await reportStage\("deleting_r2"\)/);
  assert.match(
    decommissionControl.slice(decommissionControl.indexOf('await reportStage("deleting_r2")')),
    /await deleteIfPresent\(api, `\/accounts\/\$\{input\.accountId\}\/r2\/buckets\//,
  );
});

test("requires an explicit export waiver and keeps waived decommission fail-closed", () => {
  const validation = getStep("Validate the complete lifecycle contract");
  const retainedReport = getStep("Report retained export re-verification");
  const retainedVerification = getStep(
    "Re-verify retained evidence before destructive controls",
  );
  const retainedAttestation = getStep(
    "Attest decommission retention re-verification",
  );
  const waiverAttestation = getStep("Attest explicit export waiver");
  const drain = getStep("Suspend and drain the managed runtime before decommission");
  const purge = getStep("Revoke and purge the drained managed runtime");
  const empty = getStep("Verify source R2 is empty after runtime purge");
  const deletion = getStep("Delete only the exact managed resource manifest");

  assert.match(
    lifecycle,
    /export_waived:\n\s+description:.*\n\s+required: true\n\s+type: boolean/,
  );
  assert.match(lifecycle, /EXPORT_WAIVED: \$\{\{ inputs\.export_waived \}\}/);
  assert.match(validation, /\[\[ "\$EXPORT_WAIVED" = true \|\| "\$EXPORT_WAIVED" = false \]\]/);
  assert.match(validation, /if \[\[ "\$EXPORT_WAIVED" = true \]\]; then/);
  assert.match(
    validation,
    /test -z "\$EXPORT_OPERATION_ID\$EXPORT_KEY_VERSION\$EVIDENCE_OBJECT_KEY\$EVIDENCE_SHA256\$EVIDENCE_MD5\$EVIDENCE_ETAG\$EVIDENCE_SIZE_BYTES"/,
  );
  for (const retainedStep of [retainedReport, retainedVerification, retainedAttestation]) {
    assert.match(retainedStep, /inputs\.export_waived == false/);
  }
  assert.match(waiverAttestation, /inputs\.export_waived == true/);
  assert.match(waiverAttestation, /ME3_MANAGED_STATUS: running/);
  assert.match(waiverAttestation, /ME3_MANAGED_STAGE: export_waiver_verified/);
  assert.ok(lifecycle.indexOf(waiverAttestation) < lifecycle.indexOf(drain));
  for (const destructiveStep of [drain, purge]) {
    assert.doesNotMatch(destructiveStep, /export_waived == false/);
  }
  assert.match(empty, /inputs\.export_waived == false/);
  assert.match(deletion, /if: inputs\.operation == 'decommission'/);
  assert.match(deletion, /--export-waived "\$EXPORT_WAIVED"/);
  assert.match(deletion, /if \[\[ "\$EXPORT_WAIVED" = false \]\]; then/);
  assert.match(deletion, /--r2-empty-listing "\$RUNNER_TEMP\/r2-empty\.json"/);
  assert.match(deletion, /node control\/scripts\/decommission-managed-install\.mjs "\$\{args\[@\]\}"/);
  assert.match(decommissionControl, /parseExportWaived/);
  assert.match(decommissionControl, /retained export inputs must be empty when export is waived/);
  assert.match(decommissionControl, /if \(presence\.d1\)/);
  assert.match(decommissionControl, /validateR2DeletionPrecondition/);
  assert.match(decommissionControl, /if \(exportWaived && \(listing === undefined \|\| listing === null\)\) return/);
  assert.match(decommissionControl, /persisted runtime termination proof is unavailable before R2 deletion/);
});

test("cleans a never-public failed provision through a distinct authorized operation", () => {
  const validation = getStep("Validate the complete lifecycle contract");
  const runtime = getStep("Require the exact lifecycle-capable runtime");
  const source = getStep("Check out the exact managed release");
  const cleanup = getStep("Clean only an authorized never-public failed provision");
  const success = getStep("Complete verified failed provision cleanup");
  const derive = getStep("Derive job-scoped source R2 S3 credentials");
  const verify = getStep("Verify job-scoped source R2 S3 access");

  assert.match(lifecycle, /options: \[export, decommission, cleanup_failed_provision\]/);
  assert.match(validation, /test "\$WORKER_EVER_PUBLIC" = false/);
  assert.match(validation, /test -z "\$EXPORT_OPERATION_ID\$EXPORT_KEY_VERSION/);
  assert.doesNotMatch(runtime, /cleanup_failed_provision/);
  assert.match(source, /if: inputs\.operation != 'cleanup_failed_provision'/);
  assert.match(cleanup, /cleanup-failed-managed-provision\.mjs/);
  assert.match(cleanup, /--worker-ever-public "\$WORKER_EVER_PUBLIC"/);
  assert.match(cleanup, /ME3_MANAGED_LIFECYCLE_CALLBACK_SECRET/);
  assert.doesNotMatch(cleanup, /managed-runtime-control|managed-retained-export/);
  for (const s3Step of [derive, verify]) {
    assert.match(s3Step, /inputs\.operation == 'export'/);
    assert.match(s3Step, /inputs\.operation == 'cleanup_failed_provision'/);
    assert.match(s3Step, /inputs\.operation == 'decommission'/);
  }
  assert.match(success, /ME3_MANAGED_STAGE: verified_absent/);
  assert.ok(lifecycle.indexOf(validation) < lifecycle.indexOf(cleanup));
  assert.ok(lifecycle.indexOf(cleanup) < lifecycle.indexOf(success));
});

test("serializes provisioning and lifecycle by the same installation identity", () => {
  const concurrency = /group: managed-install-\$\{\{ inputs\.installation_id \}\}/;
  assert.match(lifecycle, concurrency);
  assert.match(provision, concurrency);
  assert.match(lifecycle, /attempt_id:/);
  assert.match(lifecycle, /export_operation_id:/);
  assert.match(lifecycle, /export_md5:/);
  assert.match(lifecycle, /export_etag:/);
  assert.match(lifecycle, /export_key_version:/);
  assert.match(lifecycle, /export_waived:/);
});

test("never interpolates untrusted workflow inputs into a run script", () => {
  for (const workflow of [lifecycle, provision]) {
    const scripts = getRunScripts(workflow);
    assert.ok(scripts.length > 0);
    for (const script of scripts) assert.doesNotMatch(script, /\$\{\{\s*inputs\./);
  }
});

test("strictly parses workflows and rejects duplicate mapping keys", () => {
  const detector = String.raw`
require "psych"
def visit(node, path = "$" )
  case node
  when Psych::Nodes::Mapping
    seen = {}
    node.children.each_slice(2) do |key, value|
      label = key.respond_to?(:value) ? key.value : key.to_s
      abort("duplicate YAML key #{label.inspect} at #{path}") if seen[label]
      seen[label] = true
      visit(value, "#{path}.#{label}")
    end
  when Psych::Nodes::Sequence, Psych::Nodes::Document, Psych::Nodes::Stream
    node.children.each_with_index { |child, index| visit(child, "#{path}[#{index}]") }
  end
end
visit(Psych.parse_file(ARGV.fetch(0)))
`;
  for (const workflow of [
    resolve(root, ".github/workflows/managed-install-lifecycle.yml"),
    resolve(root, ".github/workflows/provision-managed-install.yml"),
  ]) {
    const parsed = spawnSync("ruby", ["-e", detector, workflow], {
      encoding: "utf8",
    });
    assert.equal(parsed.status, 0, `${workflow}: ${parsed.stderr || parsed.stdout}`);
  }
});

function getRunScripts(workflow) {
  const lines = workflow.split("\n");
  const scripts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    const indentation = match[1].length;
    const body = [match[2]];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      const nextIndentation = next.match(/^\s*/)[0].length;
      if (next.trim() && nextIndentation <= indentation) break;
      body.push(next);
      index += 1;
    }
    scripts.push(body.join("\n"));
  }
  return scripts;
}

function getStep(name) {
  const start = lifecycle.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `Missing workflow step: ${name}`);
  const end = lifecycle.indexOf("\n      - name: ", start + 1);
  return lifecycle.slice(start, end === -1 ? undefined : end);
}
