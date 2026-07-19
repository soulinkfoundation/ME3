import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(
  root,
  ".github/workflows/audit-managed-cloudflare-resources.yml",
);
const workflow = readFileSync(workflowPath, "utf8");
const auditScript = readFileSync(
  resolve(root, "scripts/audit-managed-cloudflare-resources.mjs"),
  "utf8",
);

test("managed Cloudflare audit is manual, least-privilege, and requires exact manifests", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n/m);
  assert.match(
    workflow,
    /expected_manifests:\n\s+description: JSON array with installationId, Worker\/D1\/R2 names, D1\/DO IDs, and queueNames\n\s+required: true\n\s+type: string/,
  );
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflow, /^\s+(?:actions|checks|deployments|issues|packages|pull-requests):\s+write$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.ME3_MANAGED_CLOUDFLARE_API_TOKEN \}\}/,
  );
  assert.match(
    workflow,
    /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.ME3_MANAGED_CLOUDFLARE_ACCOUNT_ID \}\}/,
  );
  assert.match(
    workflow,
    /ME3_MANAGED_EXPECTED_MANIFESTS: \$\{\{ inputs\.expected_manifests \}\}/,
  );
  assert.match(workflow, /node scripts\/audit-managed-cloudflare-resources\.mjs/);
  assert.doesNotMatch(workflow, /schedule:|push:|pull_request:|repository_dispatch:/);
});

test("audit implementation can only issue Cloudflare GET requests", () => {
  assert.match(auditScript, /method: "GET"/);
  assert.doesNotMatch(auditScript, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(auditScript, /\b(?:create|update|delete|purge)ManagedCloudflare/i);
  for (const endpoint of [
    '"workers/scripts"',
    '"d1/database"',
    '"r2/buckets"',
    '"queues"',
    '"workers/durable_objects/namespaces"',
  ]) {
    assert.match(auditScript, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

test("audit workflow is valid YAML without duplicate mapping keys", () => {
  const detector = String.raw`
require "psych"
def visit(node, path = "$")
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
  const parsed = spawnSync("ruby", ["-e", detector, workflowPath], {
    encoding: "utf8",
  });
  assert.equal(parsed.status, 0, parsed.stderr || parsed.stdout);
});
