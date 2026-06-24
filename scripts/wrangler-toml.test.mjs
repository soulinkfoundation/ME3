import assert from "node:assert/strict";
import test from "node:test";

import {
  getPreferredSiteAssetsBucketName,
  removeSiteAssetsBinding,
  upsertSiteAssetsBinding,
} from "./wrangler-toml.mjs";

const duplicateSiteAssetsConfig = `name = "kierans-me3"
main = "apps/worker/src/index.ts"

# Keep this visible to Cloudflare's Deploy form so accounts without R2 see the activation warning.
[[r2_buckets]]
binding = "SITE_ASSETS"
bucket_name = "my-me3-site-assets"

[[d1_databases]]
binding = "DB"
database_name = "kierans-me3-db"

# Core file storage for site media and future plugin-owned files.
[[r2_buckets]]
binding = "SITE_ASSETS"
bucket_name = "kierans-me3-site-assets"

[assets]
directory = "apps/web/dist"
`;

test("upsertSiteAssetsBinding keeps one SITE_ASSETS binding and preserves the install bucket", () => {
  const bucketName = getPreferredSiteAssetsBucketName(
    duplicateSiteAssetsConfig,
    "kierans-me3-site-assets",
  );
  const next = upsertSiteAssetsBinding(duplicateSiteAssetsConfig, bucketName);

  assert.equal(bucketName, "kierans-me3-site-assets");
  assert.equal((next.match(/\[\[r2_buckets\]\]/g) || []).length, 1);
  assert.match(next, /bucket_name = "kierans-me3-site-assets"/);
  assert.doesNotMatch(next, /bucket_name = "my-me3-site-assets"/);
});

test("removeSiteAssetsBinding removes every SITE_ASSETS duplicate", () => {
  const next = removeSiteAssetsBinding(duplicateSiteAssetsConfig);

  assert.equal((next.match(/\[\[r2_buckets\]\]/g) || []).length, 0);
  assert.doesNotMatch(next, /SITE_ASSETS/);
});
