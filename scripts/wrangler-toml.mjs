const SITE_ASSETS_BINDING = "SITE_ASSETS";
const SCAFFOLD_BUCKET_NAME = "my-me3-site-assets";
const CORE_R2_COMMENT = "# Core file storage for site media and future plugin-owned files.";
const DEPLOY_FORM_R2_COMMENT =
  "# Keep this visible to Cloudflare's Deploy form so accounts without R2 see the activation warning.";
const SITE_ASSETS_COMMENTS = [CORE_R2_COMMENT, DEPLOY_FORM_R2_COMMENT];

export function getTomlArrayBlock(value, blockName, bindingValue, bindingKey = "binding") {
  return getTomlArrayBlocks(value, blockName, bindingValue, bindingKey)[0] || "";
}

export function getTomlArrayBlocks(value, blockName, bindingValue, bindingKey = "binding") {
  const blockPattern = new RegExp(
    `(?:^|\\n)\\[\\[${escapeRegExp(blockName)}\\]\\][\\s\\S]*?(?=\\n\\[|$)`,
    "g",
  );
  return (value.match(blockPattern) || []).filter(
    (block) => getTomlString(block, bindingKey) === bindingValue,
  );
}

export function getTomlString(block, key) {
  if (!block) return "";
  return block.match(new RegExp(`${escapeRegExp(key)}\\s*=\\s*"([^"]+)"`))?.[1] || "";
}

export function setTomlString(block, key, value) {
  const pattern = new RegExp(`${escapeRegExp(key)}\\s*=\\s*"[^"]*"`);
  if (pattern.test(block)) return block.replace(pattern, `${key} = "${value}"`);
  return `${block.trimEnd()}\n${key} = "${value}"\n`;
}

export function getPreferredSiteAssetsBucketName(value, fallbackBucketName = "") {
  const bucketNames = getTomlArrayBlocks(value, "r2_buckets", SITE_ASSETS_BINDING)
    .map((block) => getTomlString(block, "bucket_name"))
    .filter(Boolean);

  return (
    bucketNames.find((name) => name !== SCAFFOLD_BUCKET_NAME) ||
    bucketNames.find((name) => name === fallbackBucketName) ||
    bucketNames[0] ||
    ""
  );
}

export function upsertSiteAssetsBinding(value, bucketName, options = {}) {
  const blocks = getTomlArrayBlocks(value, "r2_buckets", SITE_ASSETS_BINDING);
  if (blocks.length) {
    let next = value;
    for (let index = blocks.length - 1; index >= 1; index -= 1) {
      next = removeTomlBlockWithKnownSiteAssetsComment(next, blocks[index]);
    }
    return removeOrphanedSiteAssetsComments(
      next.replace(blocks[0], () => setTomlString(blocks[0], "bucket_name", bucketName)),
    );
  }

  return insertTomlBlock(
    value,
    [
      "",
      options.comment || CORE_R2_COMMENT,
      "[[r2_buckets]]",
      `binding = "${SITE_ASSETS_BINDING}"`,
      `bucket_name = "${bucketName}"`,
      "",
    ].join("\n"),
    options.insertBeforeHeaders || ["[triggers]", "[assets]"],
  );
}

export function removeSiteAssetsBinding(value) {
  let next = value;
  const blocks = getTomlArrayBlocks(value, "r2_buckets", SITE_ASSETS_BINDING);
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    next = removeTomlBlockWithKnownSiteAssetsComment(next, blocks[index]);
  }
  return removeOrphanedSiteAssetsComments(next);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeTomlBlockWithKnownSiteAssetsComment(value, block) {
  const blockStart = value.indexOf(block);
  if (blockStart === -1) return value;

  let removeStart = blockStart;
  for (const comment of SITE_ASSETS_COMMENTS) {
    const prefix = `\n${comment}`;
    if (blockStart >= prefix.length && value.slice(blockStart - prefix.length, blockStart) === prefix) {
      removeStart = blockStart - prefix.length;
      break;
    }
  }

  return `${value.slice(0, removeStart)}${value.slice(blockStart + block.length)}`;
}

function removeOrphanedSiteAssetsComments(value) {
  let next = value;
  for (const comment of SITE_ASSETS_COMMENTS) {
    next = next.replace(
      new RegExp(`\\n${escapeRegExp(comment)}\\n(?!\\[\\[r2_buckets\\]\\])`, "g"),
      "\n",
    );
  }
  return next;
}

function insertTomlBlock(value, block, beforeHeaders) {
  for (const header of beforeHeaders) {
    const index = value.indexOf(`\n${header}`);
    if (index !== -1) return `${value.slice(0, index)}${block}${value.slice(index)}`;
  }
  return `${value.trimEnd()}${block}\n`;
}
