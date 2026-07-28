type BlogD1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
    };
  };
};

export type AgentSiteBlogEnv = {
  DB: BlogD1Like;
};

type DbAgentSiteRow = {
  id: string;
  username: string;
  custom_domain: string | null;
  published_at: string | null;
  updated_at: string;
};

type DbAgentSiteFileRow = {
  content: unknown;
};

type AgentBlogPostMeta = {
  slug?: string;
  title?: string;
  file?: string;
  excerpt?: string;
  draft?: boolean;
  publishedAt?: string;
};

type AgentSiteProfile = {
  handle?: string;
  name?: string;
  posts?: AgentBlogPostMeta[];
};

type AgentBlogSite = {
  id: string;
  username: string;
  customDomain: string | null;
  publishedAt: string | null;
  profile: AgentSiteProfile;
};

type AgentBlogPost = {
  slug: string;
  title: string;
  file: string;
  excerpt: string | null;
  draft: boolean;
  publishedAt: string | null;
  bodyMarkdown: string | null;
};

export type AgentSiteBlogPost = AgentBlogPost & {
  bodyTruncated: boolean;
};

export type AgentSiteBlogReadResult =
  | {
      ok: true;
      mode: "list" | "post";
      site: {
        username: string;
        customDomain: string | null;
        publishedAt: string | null;
      };
      posts: AgentSiteBlogPost[];
      hasMore: boolean;
    }
  | {
      ok: false;
      error: string;
      candidates?: string[];
    };

const BLOG_POST_BODY_LIMIT = 24_000;
const BLOG_POST_PREVIEW_LIMIT = 280;

export async function readAgentSiteBlogPosts(
  env: AgentSiteBlogEnv,
  userId: string,
  input: {
    site?: string;
    post?: string;
    limit?: number;
  } = {},
): Promise<AgentSiteBlogReadResult> {
  const sites = await loadAgentBlogSites(env, userId);
  const site = resolveAgentBlogSite(sites, input.site);
  if ("error" in site) return site;

  const posts = await loadAgentBlogPosts(env, site);
  const postQuery = normalizeNullableText(input.post);
  if (postQuery) {
    const post = resolveAgentBlogPost(posts, postQuery);
    if ("error" in post) return post;
    return {
      ok: true,
      mode: "post",
      site: serializeAgentBlogSite(site),
      posts: [serializeAgentBlogPost(post, BLOG_POST_BODY_LIMIT)],
      hasMore: false,
    };
  }

  const limit = normalizeBlogPostLimit(input.limit);
  return {
    ok: true,
    mode: "list",
    site: serializeAgentBlogSite(site),
    posts: posts
      .slice(0, limit)
      .map((post) => serializeAgentBlogPost(post, BLOG_POST_PREVIEW_LIMIT)),
    hasMore: posts.length > limit,
  };
}

export function formatAgentSiteBlogReadReply(
  result: AgentSiteBlogReadResult,
): string {
  if (!result.ok) return result.error;
  if (!result.posts.length) {
    return `@${result.site.username} does not have any blog posts yet.`;
  }
  if (result.mode === "post") {
    const post = result.posts[0];
    return [
      `Blog post on @${result.site.username}: ${post.title}`,
      `- Slug: ${post.slug}`,
      `- Status: ${post.draft ? "draft" : "published"}`,
      `- Published: ${post.publishedAt || "Not set."}`,
      `- Excerpt: ${post.excerpt || "Not set."}`,
      "",
      "Body:",
      post.bodyMarkdown || "No markdown body file was found for this post.",
      post.bodyTruncated ? "[Post body truncated for this read.]" : null,
    ].filter((line): line is string => line !== null).join("\n");
  }

  const lines = [`Blog posts for @${result.site.username}:`];
  result.posts.forEach((post, index) => {
    lines.push(
      "",
      `${index + 1}. ${post.title}`,
      `   Slug: ${post.slug}`,
      `   Status: ${post.draft ? "draft" : "published"}${post.publishedAt ? `, ${post.publishedAt}` : ""}`,
    );
    if (post.excerpt) lines.push(`   Excerpt: ${post.excerpt}`);
    if (post.bodyMarkdown) lines.push(`   Body: ${post.bodyMarkdown}`);
  });
  if (result.hasMore) {
    lines.push("", "More posts exist; raise the limit or name a post to read it.");
  }
  return lines.join("\n");
}

function resolveAgentBlogSite(
  sites: AgentBlogSite[],
  queryInput: string | undefined,
): AgentBlogSite | Extract<AgentSiteBlogReadResult, { ok: false }> {
  if (!sites.length) {
    return { ok: false, error: "I could not find a profile site with readable site files." };
  }
  const query = normalizeNullableText(queryInput);
  if (!query && sites.length === 1) return sites[0];
  if (!query) {
    const candidates = sites.map(formatAgentBlogSiteChoice);
    return {
      ok: false,
      error: `I found multiple profile sites: ${candidates.join(", ")}. Which site should I use?`,
      candidates,
    };
  }
  const result = resolveAgentEntity(sites, query, {
    labels: (site) => [
      site.username,
      site.customDomain,
      site.profile.handle,
      site.profile.name,
    ],
    format: formatAgentBlogSiteChoice,
  });
  if (result.kind === "resolved") return result.item;
  if (result.kind === "ambiguous") {
    const candidates = result.candidates.map(formatAgentBlogSiteChoice);
    return {
      ok: false,
      error: `I found multiple profile sites matching "${query}": ${candidates.join(", ")}. Which site should I use?`,
      candidates,
    };
  }
  return { ok: false, error: `I could not find a profile site matching "${query}".` };
}

function resolveAgentBlogPost(
  posts: AgentBlogPost[],
  query: string,
): AgentBlogPost | Extract<AgentSiteBlogReadResult, { ok: false }> {
  const result = resolveAgentEntity(posts, query, {
    labels: (post) => [post.title, post.slug, post.file, post.excerpt],
    format: (post) => post.title,
  });
  if (result.kind === "resolved") return result.item;
  if (result.kind === "ambiguous") {
    const candidates = result.candidates.map((post) => `${post.title} (${post.slug})`);
    return {
      ok: false,
      error: `I found multiple blog posts matching "${query}": ${candidates.join(", ")}. Which post should I read?`,
      candidates,
    };
  }
  return { ok: false, error: `I could not find a blog post matching "${query}".` };
}

async function loadAgentBlogSites(
  env: AgentSiteBlogEnv,
  userId: string,
): Promise<AgentBlogSite[]> {
  const rows = await env.DB.prepare(
    `SELECT id, username, custom_domain, published_at, updated_at
     FROM sites
     WHERE user_id = ?
       AND COALESCE(site_type, 'profile') = 'profile'
     ORDER BY updated_at DESC, username ASC
     LIMIT 20`,
  )
    .bind(userId)
    .all<DbAgentSiteRow>();

  return Promise.all(
    (rows.results || []).map(async (row) => ({
      id: row.id,
      username: row.username,
      customDomain: normalizeNullableText(row.custom_domain),
      publishedAt: normalizeNullableText(row.published_at),
      profile: await loadAgentSiteProfile(env, row.id, row.username),
    })),
  );
}

async function loadAgentSiteProfile(
  env: AgentSiteBlogEnv,
  siteId: string,
  username: string,
): Promise<AgentSiteProfile> {
  const text =
    (await loadAgentSiteFileText(env, siteId, "src/me.json")) ||
    (await loadAgentSiteFileText(env, siteId, "public/me.json")) ||
    (await loadAgentSiteFileText(env, siteId, "me.json"));
  if (!text) return { handle: username, posts: [] };
  try {
    const parsed = JSON.parse(text) as AgentSiteProfile;
    if (parsed && typeof parsed === "object") {
      return {
        ...parsed,
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      };
    }
  } catch {
    // Invalid me.json produces an empty readable blog instead of invented data.
  }
  return { handle: username, posts: [] };
}

async function loadAgentBlogPosts(
  env: AgentSiteBlogEnv,
  site: AgentBlogSite,
): Promise<AgentBlogPost[]> {
  const result: AgentBlogPost[] = [];
  for (const meta of site.profile.posts || []) {
    const slug = normalizeNullableText(meta.slug) || slugFromBlogPostFile(meta.file || "");
    const title = normalizeNullableText(meta.title) || titleFromBlogSlug(slug);
    const file = normalizeAgentSiteFileName(meta.file || (slug ? `blog/${slug}.md` : ""));
    if (!slug || !title || !file) continue;
    result.push({
      slug,
      title,
      file,
      excerpt: normalizeNullableText(meta.excerpt),
      draft: meta.draft === true,
      publishedAt: normalizeNullableText(meta.publishedAt),
      bodyMarkdown: await loadAgentSiteFileText(env, site.id, `src/${file}`),
    });
  }
  return result;
}

async function loadAgentSiteFileText(
  env: AgentSiteBlogEnv,
  siteId: string,
  path: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT content
     FROM site_files
     WHERE site_id = ? AND path = ?`,
  )
    .bind(siteId, normalizeAgentSiteFileName(path))
    .first<DbAgentSiteFileRow>();
  return decodeSiteFileText(row?.content);
}

function serializeAgentBlogSite(site: AgentBlogSite) {
  return {
    username: site.username,
    customDomain: site.customDomain,
    publishedAt: site.publishedAt,
  };
}

function serializeAgentBlogPost(
  post: AgentBlogPost,
  bodyLimit: number,
): AgentSiteBlogPost {
  const body =
    typeof post.bodyMarkdown === "string" && post.bodyMarkdown.trim()
      ? post.bodyMarkdown.trim()
      : null;
  const compact = bodyLimit === BLOG_POST_PREVIEW_LIMIT;
  const normalizedBody = body && compact ? body.replace(/\s+/g, " ") : body;
  const bodyTruncated = Boolean(normalizedBody && normalizedBody.length > bodyLimit);
  return {
    ...post,
    bodyMarkdown: normalizedBody
      ? bodyTruncated
        ? `${normalizedBody.slice(0, bodyLimit).trimEnd()}...`
        : normalizedBody
      : null,
    bodyTruncated,
  };
}

function normalizeBlogPostLimit(value: number | undefined): number {
  if (value === undefined) return 20;
  if (!Number.isInteger(value) || value < 1 || value > 30) {
    throw new Error("Blog post limit must be an integer from 1 to 30.");
  }
  return value;
}

function resolveAgentEntity<T>(
  items: T[],
  query: string,
  options: {
    labels: (item: T) => Array<string | null | undefined>;
    format: (item: T) => string;
  },
):
  | { kind: "resolved"; item: T }
  | { kind: "ambiguous"; candidates: T[] }
  | { kind: "missing" } {
  const normalizedQuery = normalizeEntityText(query);
  const queryTokens = importantEntityTokens(normalizedQuery);
  if (!normalizedQuery || queryTokens.size === 0) return { kind: "missing" };

  const scored = items
    .map((item) => ({
      item,
      score: Math.max(
        0,
        ...options.labels(item).map((label) =>
          scoreEntityLabel(normalizedQuery, queryTokens, label),
        ),
      ),
    }))
    .filter((match) => match.score >= 55)
    .sort(
      (left, right) =>
        right.score - left.score ||
        options.format(left.item).localeCompare(options.format(right.item)),
    );
  const best = scored[0];
  if (!best) return { kind: "missing" };
  if (best.score >= 95) return { kind: "resolved", item: best.item };
  const close = scored.filter((match) => best.score - match.score < 12);
  if (close.length > 1) {
    return { kind: "ambiguous", candidates: close.slice(0, 5).map((match) => match.item) };
  }
  return best.score >= 70 ? { kind: "resolved", item: best.item } : { kind: "missing" };
}

function scoreEntityLabel(
  normalizedQuery: string,
  queryTokens: ReadonlySet<string>,
  label: string | null | undefined,
): number {
  const normalizedLabel = normalizeEntityText(label || "");
  const labelTokens = importantEntityTokens(normalizedLabel);
  if (!normalizedLabel || labelTokens.size === 0) return 0;
  if (normalizedQuery === normalizedLabel) return 100;
  if (normalizedQuery.includes(normalizedLabel)) return 92;
  const overlap = [...labelTokens].filter((token) => queryTokens.has(token)).length;
  if (!overlap) return 0;
  const coverage = overlap / labelTokens.size;
  if (coverage === 1) return labelTokens.size === 1 ? 82 : 88;
  return 45 + coverage * 35;
}

function importantEntityTokens(value: string): ReadonlySet<string> {
  const stop = new Set([
    "a", "about", "and", "article", "blog", "draft", "for", "from", "in",
    "me", "my", "of", "post", "posts", "profile", "public", "read", "site",
    "the", "to",
  ]);
  return new Set(
    normalizeEntityText(value)
      .split(" ")
      .filter((token) => token.length > 1 && !stop.has(token)),
  );
}

function normalizeEntityText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatAgentBlogSiteChoice(site: AgentBlogSite): string {
  return site.customDomain ? `@${site.username} (${site.customDomain})` : `@${site.username}`;
}

function slugFromBlogPostFile(file: string): string {
  return normalizeAgentSiteFileName(file).split("/").pop()?.replace(/\.[^.]+$/g, "") || "";
}

function titleFromBlogSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Untitled Post";
}

function normalizeAgentSiteFileName(name: string): string {
  return name
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || null;
}

function decodeSiteFileText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value);
  return null;
}
