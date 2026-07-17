type BlogD1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
};

export type AgentSiteBlogEnv = {
  DB: BlogD1Like;
};

type DbAgentSiteRow = {
  id: string;
  username: string;
  site_type: string | null;
  custom_domain: string | null;
  custom_domain_status?: string | null;
  published_at: string | null;
  updated_at: string;
};

type DbAgentSiteFileRow = {
  site_id: string;
  path: string;
  content: unknown;
  content_type: string;
  updated_at: string;
};

type AgentBlogSite = {
  id: string;
  username: string;
  customDomain: string | null;
  publishedAt: string | null;
  updatedAt: string;
  profile: AgentSiteProfile;
};

type AgentSiteProfile = Record<string, unknown> & {
  handle?: string;
  name?: string;
  blogTitle?: string;
  blogEnabled?: boolean;
  posts?: AgentBlogPostMeta[];
};

type AgentBlogPostMeta = Record<string, unknown> & {
  slug?: string;
  title?: string;
  file?: string;
  excerpt?: string;
  draft?: boolean;
  publishedAt?: string;
};

type AgentBlogPost = {
  slug: string;
  title: string;
  file: string;
  excerpt: string | null;
  draft: boolean;
  publishedAt: string | null;
  bodyMarkdown: string | null;
  meta: AgentBlogPostMeta;
};

const AGENT_BLOG_POST_BODY_LIMIT = 24_000;
const AGENT_BLOG_POST_LIST_BODY_LIMIT = 280;

export type AgentSiteBlogToolResponse = {
  ok: true;
  auditId: null;
  turnId: string;
  specialist: string;
  replyText: string;
  model: null;
  source: "tool";
  fallbackReason: string | null;
  debugError: null;
  emailAction: null;
  reminderAction: null;
  actionCards: null;
  contentAction: null;
  contactsChanged: false;
};

export async function maybeHandleSiteBlogPostToolTurn(
  env: AgentSiteBlogEnv,
  input: {
    userId: string;
    turnId: string;
    messageText: string;
    capabilityId: string;
  },
): Promise<AgentSiteBlogToolResponse | null> {
  if (input.capabilityId === "core.sites.blog_post.list") {
    const blogPlan = await parseSiteBlogPostListChatRequest(env, input.userId, input.messageText);
    if ("error" in blogPlan) {
      return siteBlogToolResponse(input.turnId, "core.sites.blog_post.list", blogPlan.error, "Site blog posts could not be listed");
    }
    return siteBlogToolResponse(
      input.turnId,
      "core.sites.blog_post.list",
      formatSiteBlogPostListReply(blogPlan.site, blogPlan.posts),
    );
  }

  if (input.capabilityId === "core.sites.blog_post.read") {
    const blogPlan = await parseSiteBlogPostReadChatRequest(env, input.userId, input.messageText);
    if ("error" in blogPlan) {
      return siteBlogToolResponse(input.turnId, "core.sites.blog_post.read", blogPlan.error, "Site blog post could not be read");
    }
    return siteBlogToolResponse(
      input.turnId,
      "core.sites.blog_post.read",
      formatSiteBlogPostReadReply(blogPlan.site, blogPlan.post),
    );
  }

  if (input.capabilityId === "core.sites.blog_post.create") {
    const blogPlan = await parseSiteBlogPostCreateChatRequest(env, input.userId, input.messageText);
    if ("error" in blogPlan) {
      return siteBlogToolResponse(input.turnId, "core.sites.blog_post.create", blogPlan.error, "Site blog post details required");
    }
    const result = await createAgentSiteBlogPost(env, blogPlan.site, blogPlan.input);
    if ("error" in result) {
      return siteBlogToolResponse(input.turnId, "core.sites.blog_post.create", result.error, "Site blog post could not be created");
    }
    return siteBlogToolResponse(
      input.turnId,
      "core.sites.blog_post.create",
      `Done. I ${result.post.draft ? "created a draft" : "published"} blog post "${result.post.title}" on @${result.site.username}.`,
    );
  }

  if (input.capabilityId === "core.sites.blog_post.update") {
    const blogPlan = await parseSiteBlogPostUpdateChatRequest(env, input.userId, input.messageText);
    if ("error" in blogPlan) {
      return siteBlogToolResponse(input.turnId, "core.sites.blog_post.update", blogPlan.error, "Site blog post update details required");
    }
    const result = await updateAgentSiteBlogPost(env, blogPlan.site, blogPlan.post, blogPlan.input);
    if ("error" in result) {
      return siteBlogToolResponse(input.turnId, "core.sites.blog_post.update", result.error, "Site blog post could not be updated");
    }
    return siteBlogToolResponse(
      input.turnId,
      "core.sites.blog_post.update",
      `Done. I updated "${result.post.title}" on @${result.site.username}.`,
    );
  }

  if (input.capabilityId === "core.sites.blog_post.archive") {
    const blogPlan = await parseSiteBlogPostArchiveChatRequest(env, input.userId, input.messageText);
    if ("error" in blogPlan) {
      return siteBlogToolResponse(input.turnId, "core.sites.blog_post.archive", blogPlan.error, "Site blog post archive details required");
    }
    const result = await archiveAgentSiteBlogPost(env, blogPlan.site, blogPlan.post);
    if ("error" in result) {
      return siteBlogToolResponse(input.turnId, "core.sites.blog_post.archive", result.error, "Site blog post could not be archived");
    }
    return siteBlogToolResponse(
      input.turnId,
      "core.sites.blog_post.archive",
      `Done. I archived "${blogPlan.post.title}" on @${result.site.username}. The markdown moved to \`${result.archivedPath}\`.`,
    );
  }

  return null;
}

function siteBlogToolResponse(
  turnId: string,
  specialist: string,
  replyText: string,
  fallbackReason: string | null = null,
): AgentSiteBlogToolResponse {
  return {
    ok: true,
    auditId: null,
    turnId,
    specialist,
    replyText,
    model: null,
    source: "tool",
    fallbackReason,
    debugError: null,
    emailAction: null,
    reminderAction: null,
    actionCards: null,
    contentAction: null,
    contactsChanged: false,
  };
}

export async function parseSiteBlogPostListChatRequest(
  env: AgentSiteBlogEnv,
  userId: string,
  messageText: string,
): Promise<{ site: AgentBlogSite; posts: AgentBlogPost[] } | { error: string }> {
  const site = await resolveAgentBlogSiteForRequest(env, userId, messageText);
  if ("error" in site) return site;
  return { site, posts: await loadAgentBlogPosts(env, site) };
}

export async function parseSiteBlogPostReadChatRequest(
  env: AgentSiteBlogEnv,
  userId: string,
  messageText: string,
): Promise<{ site: AgentBlogSite; post: AgentBlogPost } | { error: string }> {
  const site = await resolveAgentBlogSiteForRequest(env, userId, messageText);
  if ("error" in site) return site;
  const target = extractSiteBlogPostReadReference(messageText);
  if (!target) return { error: "Please include the blog post title, slug, or file to read." };
  const post = resolveAgentBlogPost(await loadAgentBlogPosts(env, site), target);
  if ("error" in post) return post;
  return { site, post };
}

export async function parseSiteBlogPostCreateChatRequest(
  env: AgentSiteBlogEnv,
  userId: string,
  messageText: string,
): Promise<
  | {
      site: AgentBlogSite;
      input: {
        title: string;
        slug: string;
        excerpt: string | null;
        bodyMarkdown: string;
        draft: boolean;
        publishedAt: string | null;
      };
    }
  | { error: string }
> {
  const site = await resolveAgentBlogSiteForRequest(env, userId, messageText);
  if ("error" in site) return site;
  const parsed = parseSiteBlogPostCreateText(messageText);
  if (!parsed.title) return { error: "Please include a blog post title or topic." };
  const slug = parsed.slug || uniqueAgentBlogPostSlug(await loadAgentBlogPosts(env, site), parsed.title);
  const bodyMarkdown = parsed.bodyMarkdown || defaultAgentBlogPostBody(parsed.title, parsed.topic);
  return {
    site,
    input: {
      title: parsed.title,
      slug,
      excerpt: parsed.excerpt,
      bodyMarkdown,
      draft: parsed.draft,
      publishedAt: parsed.draft ? null : parsed.publishedAt || currentDateKey(),
    },
  };
}

export async function parseSiteBlogPostUpdateChatRequest(
  env: AgentSiteBlogEnv,
  userId: string,
  messageText: string,
): Promise<
  | {
      site: AgentBlogSite;
      post: AgentBlogPost;
      input: {
        title?: string;
        slug?: string;
        excerpt?: string | null;
        bodyMarkdown?: string;
        draft?: boolean;
        publishedAt?: string | null;
      };
    }
  | { error: string }
> {
  const site = await resolveAgentBlogSiteForRequest(env, userId, messageText);
  if ("error" in site) return site;
  const parsed = parseSiteBlogPostUpdateText(messageText);
  if (!parsed.target) return { error: "Please include the blog post title, slug, or file to update." };
  const post = resolveAgentBlogPost(await loadAgentBlogPosts(env, site), parsed.target);
  if ("error" in post) return post;
  const { target: _target, ...input } = parsed;
  if (!Object.keys(input).some((key) => input[key as keyof typeof input] !== undefined)) {
    return { error: "Please include what to change on that blog post." };
  }
  return { site, post, input };
}

export async function parseSiteBlogPostArchiveChatRequest(
  env: AgentSiteBlogEnv,
  userId: string,
  messageText: string,
): Promise<{ site: AgentBlogSite; post: AgentBlogPost } | { error: string }> {
  const site = await resolveAgentBlogSiteForRequest(env, userId, messageText);
  if ("error" in site) return site;
  const target = extractSiteBlogPostArchiveReference(messageText);
  if (!target) return { error: "Please include the blog post title, slug, or file to archive." };
  const post = resolveAgentBlogPost(await loadAgentBlogPosts(env, site), target);
  if ("error" in post) return post;
  return { site, post };
}

export async function createAgentSiteBlogPost(
  env: AgentSiteBlogEnv,
  site: AgentBlogSite,
  input: {
    title: string;
    slug: string;
    excerpt: string | null;
    bodyMarkdown: string;
    draft: boolean;
    publishedAt: string | null;
  },
): Promise<{ site: AgentBlogSite; post: AgentBlogPost } | { error: string }> {
  const file = `blog/${input.slug}.md`;
  const profile = site.profile;
  const posts = Array.isArray(profile.posts) ? [...profile.posts] : [];
  if (posts.some((post) => normalizeNullableText(post.slug) === input.slug)) {
    return { error: `A blog post with slug "${input.slug}" already exists.` };
  }
  const postMeta: AgentBlogPostMeta = {
    slug: input.slug,
    title: input.title,
    file,
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    draft: input.draft,
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
  };
  profile.posts = [postMeta, ...posts];
  profile.blogTitle ||= "Blog";
  profile.blogEnabled = true;

  try {
    await putAgentSiteFile(env, site.id, `src/${file}`, input.bodyMarkdown, "text/markdown");
    await putAgentSiteProfile(env, site.id, profile);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Blog post could not be saved." };
  }

  return {
    site,
    post: {
      slug: input.slug,
      title: input.title,
      file,
      excerpt: input.excerpt,
      draft: input.draft,
      publishedAt: input.publishedAt,
      bodyMarkdown: input.bodyMarkdown,
      meta: postMeta,
    },
  };
}

export async function updateAgentSiteBlogPost(
  env: AgentSiteBlogEnv,
  site: AgentBlogSite,
  post: AgentBlogPost,
  input: {
    title?: string;
    slug?: string;
    excerpt?: string | null;
    bodyMarkdown?: string;
    draft?: boolean;
    publishedAt?: string | null;
  },
): Promise<{ site: AgentBlogSite; post: AgentBlogPost } | { error: string }> {
  const profile = site.profile;
  const posts = Array.isArray(profile.posts) ? [...profile.posts] : [];
  const index = posts.findIndex(
    (candidate) =>
      normalizeNullableText(candidate.slug) === post.slug ||
      normalizeAgentSiteFileName(candidate.file || "") === post.file,
  );
  if (index < 0) return { error: `I could not find "${post.title}" in @${site.username}'s blog metadata.` };

  const nextSlug = input.slug || post.slug;
  const nextFile = `blog/${nextSlug}.md`;
  const nextBody = input.bodyMarkdown ?? post.bodyMarkdown ?? defaultAgentBlogPostBody(input.title || post.title, null);
  const nextDraft = input.draft ?? post.draft;
  // ponytail: source publish state only; regenerate public HTML here if chat publish must go live immediately.
  const nextPublishedAt =
    nextDraft
      ? null
      : input.publishedAt === undefined
        ? post.publishedAt || currentDateKey()
        : input.publishedAt || currentDateKey();
  const nextMeta: AgentBlogPostMeta = {
    ...posts[index],
    slug: nextSlug,
    title: input.title || post.title,
    file: nextFile,
    draft: nextDraft,
  };
  if (input.excerpt !== undefined) {
    if (input.excerpt) nextMeta.excerpt = input.excerpt;
    else delete nextMeta.excerpt;
  }
  if (nextPublishedAt) nextMeta.publishedAt = nextPublishedAt;
  else delete nextMeta.publishedAt;

  posts[index] = nextMeta;
  profile.posts = posts;
  profile.blogTitle ||= "Blog";

  try {
    await putAgentSiteFile(env, site.id, `src/${nextFile}`, nextBody, "text/markdown");
    if (nextFile !== post.file) {
      await deleteAgentSiteFile(env, site.id, `src/${post.file}`);
    }
    await putAgentSiteProfile(env, site.id, profile);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Blog post could not be updated." };
  }

  return {
    site,
    post: {
      slug: nextSlug,
      title: input.title || post.title,
      file: nextFile,
      excerpt: input.excerpt === undefined ? post.excerpt : input.excerpt,
      draft: nextDraft,
      publishedAt: nextPublishedAt,
      bodyMarkdown: nextBody,
      meta: nextMeta,
    },
  };
}

export async function archiveAgentSiteBlogPost(
  env: AgentSiteBlogEnv,
  site: AgentBlogSite,
  post: AgentBlogPost,
): Promise<{ site: AgentBlogSite; archivedPath: string } | { error: string }> {
  const profile = site.profile;
  const posts = Array.isArray(profile.posts) ? [...profile.posts] : [];
  profile.posts = posts.filter(
    (candidate) =>
      normalizeNullableText(candidate.slug) !== post.slug &&
      normalizeAgentSiteFileName(candidate.file || "") !== post.file,
  );
  const archivedPath = `archived/${post.file}`;

  try {
    if (post.bodyMarkdown !== null) {
      await putAgentSiteFile(env, site.id, `src/${archivedPath}`, post.bodyMarkdown, "text/markdown");
    }
    await deleteAgentSiteFile(env, site.id, `src/${post.file}`);
    await putAgentSiteProfile(env, site.id, profile);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Blog post could not be archived." };
  }

  return { site, archivedPath };
}

export function formatSiteBlogPostListReply(site: AgentBlogSite, posts: AgentBlogPost[]): string {
  if (!posts.length) return `@${site.username} does not have any blog posts yet.`;
  const lines = [`Blog posts for @${site.username}:`];
  posts.slice(0, 30).forEach((post, index) => {
    const status = post.draft ? "draft" : "published";
    const published = post.publishedAt ? `, ${post.publishedAt}` : "";
    lines.push(
      "",
      `${index + 1}. ${post.title}`,
      `   Slug: ${post.slug}`,
      `   Status: ${status}${published}`,
    );
    if (post.excerpt) lines.push(`   Excerpt: ${post.excerpt}`);
    const preview = formatAgentBlogBody(post.bodyMarkdown, AGENT_BLOG_POST_LIST_BODY_LIMIT, true);
    if (preview) lines.push(`   Body: ${preview}`);
  });
  if (posts.length > 30) lines.push("", `...and ${posts.length - 30} more.`);
  return lines.join("\n");
}

export function formatSiteBlogPostReadReply(site: AgentBlogSite, post: AgentBlogPost): string {
  const body = formatAgentBlogBody(post.bodyMarkdown, AGENT_BLOG_POST_BODY_LIMIT, false) ||
    "No markdown body file was found for this post.";
  return [
    `Blog post on @${site.username}: ${post.title}`,
    `- Slug: ${post.slug}`,
    `- File: ${post.file}`,
    `- Status: ${post.draft ? "draft" : "published"}`,
    `- Published: ${post.publishedAt || "Not set."}`,
    `- Excerpt: ${post.excerpt || "Not set."}`,
    "",
    "Body:",
    body,
  ].join("\n");
}

async function resolveAgentBlogSiteForRequest(
  env: AgentSiteBlogEnv,
  userId: string,
  messageText: string,
): Promise<AgentBlogSite | { error: string }> {
  const sites = await loadAgentBlogSites(env, userId);
  if (!sites.length) return { error: "I could not find a profile site with editable site files." };
  if (sites.length === 1) return sites[0];

  const explicitQuery = extractAgentBlogSiteReference(messageText);
  const query = explicitQuery || messageText;
  const result = resolveAgentEntity(sites, query, {
    labels: (site) => [
      { value: site.username, weight: 1 },
      { value: site.customDomain, weight: 1 },
      { value: site.profile.handle, weight: 1 },
      { value: site.profile.name, weight: 0.9 },
    ],
    format: (site) => `@${site.username}`,
  });
  if (result.kind === "resolved") return result.item;
  if (result.kind === "ambiguous") {
    return {
      error: `I found multiple profile sites that might match: ${result.candidates
        .map(formatAgentBlogSiteChoice)
        .join(", ")}. Which site should I use?`,
    };
  }
  if (explicitQuery) {
    return { error: `I could not find a profile site matching "${explicitQuery}".` };
  }
  return {
    error: `I found multiple profile sites: ${sites.map(formatAgentBlogSiteChoice).join(", ")}. Which site should I use?`,
  };
}

async function loadAgentBlogSites(
  env: AgentSiteBlogEnv,
  userId: string,
): Promise<AgentBlogSite[]> {
  const rows = await env.DB.prepare(
    `SELECT id, username, site_type, custom_domain, custom_domain_status, published_at, updated_at
     FROM sites
     WHERE user_id = ? AND COALESCE(site_type, 'profile') = 'profile'
     ORDER BY updated_at DESC, username ASC
     LIMIT 20`,
  )
    .bind(userId)
    .all<DbAgentSiteRow>();

  const sites: AgentBlogSite[] = [];
  for (const row of rows.results || []) {
    sites.push({
      id: row.id,
      username: row.username,
      customDomain: normalizeNullableText(row.custom_domain),
      publishedAt: normalizeNullableText(row.published_at),
      updatedAt: row.updated_at,
      profile: await loadAgentSiteProfile(env, row.id, row.username),
    });
  }
  return sites;
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
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      const profile = parsed as AgentSiteProfile;
      if (!Array.isArray(profile.posts)) profile.posts = [];
      return profile;
    }
  } catch {
    // Fall back below.
  }
  return { handle: username, posts: [] };
}

async function loadAgentBlogPosts(
  env: AgentSiteBlogEnv,
  site: AgentBlogSite,
): Promise<AgentBlogPost[]> {
  const posts = Array.isArray(site.profile.posts) ? site.profile.posts : [];
  const result: AgentBlogPost[] = [];
  for (const meta of posts) {
    const slug = normalizeNullableText(meta.slug) || slugFromAgentBlogPostFile(meta.file || "");
    const title = normalizeNullableText(meta.title) || titleFromAgentBlogSlug(slug);
    const file = normalizeAgentSiteFileName(meta.file || (slug ? `blog/${slug}.md` : ""));
    if (!slug || !title || !file) continue;
    const bodyMarkdown = await loadAgentSiteFileText(env, site.id, `src/${file}`);
    result.push({
      slug,
      title,
      file,
      excerpt: normalizeNullableText(meta.excerpt),
      draft: meta.draft === true,
      publishedAt: normalizeNullableText(meta.publishedAt),
      bodyMarkdown,
      meta,
    });
  }
  return result;
}

function resolveAgentBlogPost(
  posts: AgentBlogPost[],
  query: string,
): AgentBlogPost | { error: string } {
  const result = resolveAgentEntity(posts, query, {
    labels: (post) => [
      { value: post.title, weight: 1 },
      { value: post.slug, weight: 1 },
      { value: post.file, weight: 1 },
      { value: post.excerpt, weight: 0.7 },
    ],
    format: (post) => post.title,
  });
  if (result.kind === "resolved") return result.item;
  if (result.kind === "ambiguous") {
    return {
      error: `I found multiple blog posts matching "${query}": ${result.candidates
        .map((post) => `${post.title} (${post.slug})`)
        .join(", ")}. Which post should I use?`,
    };
  }
  return { error: `I could not find a blog post matching "${query}".` };
}

function resolveAgentEntity<T>(
  items: T[],
  query: string,
  options: {
    labels: (item: T) => Array<{ value: string | null | undefined; weight?: number }>;
    format: (item: T) => string;
  },
):
  | { kind: "resolved"; item: T }
  | { kind: "ambiguous"; candidates: T[] }
  | { kind: "missing" } {
  const normalizedQuery = normalizeAgentEntityText(query);
  const queryTokens = importantAgentEntityTokens(normalizedQuery);
  if (!normalizedQuery || queryTokens.size === 0) return { kind: "missing" };

  const scored = items
    .map((item) => {
      const bestScore = Math.max(
        0,
        ...options.labels(item).map((label) =>
          scoreAgentEntityLabel(normalizedQuery, queryTokens, label.value, label.weight ?? 1),
        ),
      );
      return { item, score: bestScore };
    })
    .filter((match) => match.score >= 55)
    .sort(
      (left, right) =>
        right.score - left.score || options.format(left.item).localeCompare(options.format(right.item)),
    );

  const best = scored[0];
  if (!best) return { kind: "missing" };
  if (best.score >= 95) return { kind: "resolved", item: best.item };
  const close = scored.filter((match) => best.score - match.score < 12);
  if (close.length > 1) return { kind: "ambiguous", candidates: close.slice(0, 5).map((match) => match.item) };
  return best.score >= 70 ? { kind: "resolved", item: best.item } : { kind: "missing" };
}

function scoreAgentEntityLabel(
  normalizedQuery: string,
  queryTokens: ReadonlySet<string>,
  label: string | null | undefined,
  weight: number,
): number {
  const normalizedLabel = normalizeAgentEntityText(label || "");
  const labelTokens = importantAgentEntityTokens(normalizedLabel);
  if (!normalizedLabel || labelTokens.size === 0) return 0;
  if (normalizedQuery === normalizedLabel) return 100 * weight;
  if (normalizedQuery.includes(normalizedLabel)) return 92 * weight;
  const overlap = [...labelTokens].filter((token) => queryTokens.has(token)).length;
  if (overlap === 0) return 0;
  const coverage = overlap / labelTokens.size;
  if (coverage === 1) return (labelTokens.size === 1 ? 82 : 88) * weight;
  return (45 + coverage * 35) * weight;
}

function formatAgentBlogBody(
  bodyMarkdown: string | null,
  limit: number,
  compact: boolean,
): string | null {
  const normalized = normalizeNullableText(bodyMarkdown);
  if (!normalized) return null;
  const text = compact ? normalized.replace(/\s+/g, " ") : normalized;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}... [truncated to ${limit} characters]`;
}

async function putAgentSiteProfile(
  env: AgentSiteBlogEnv,
  siteId: string,
  profile: AgentSiteProfile,
): Promise<void> {
  await putAgentSiteFile(env, siteId, "src/me.json", JSON.stringify(profile, null, 2), "application/json");
}

async function loadAgentSiteFileText(
  env: AgentSiteBlogEnv,
  siteId: string,
  path: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT site_id, path, content, content_type, updated_at
     FROM site_files
     WHERE site_id = ? AND path = ?`,
  )
    .bind(siteId, normalizeAgentSiteFileName(path))
    .first<DbAgentSiteFileRow>();
  return decodeSiteFileText(row?.content);
}

async function putAgentSiteFile(
  env: AgentSiteBlogEnv,
  siteId: string,
  path: string,
  text: string,
  contentType: string,
): Promise<void> {
  const normalizedPath = normalizeAgentSiteFileName(path);
  const bytes = new TextEncoder().encode(text);
  await env.DB.prepare(
    `INSERT INTO site_files (site_id, path, content, content_type, size, sha256, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(site_id, path) DO UPDATE SET
       content = excluded.content,
       content_type = excluded.content_type,
       size = excluded.size,
       sha256 = excluded.sha256,
       updated_at = datetime('now')`,
  )
    .bind(siteId, normalizedPath, bytes.buffer, contentType, bytes.byteLength, await sha256AgentText(text))
    .run();
}

async function deleteAgentSiteFile(
  env: AgentSiteBlogEnv,
  siteId: string,
  path: string,
): Promise<void> {
  await env.DB.prepare("DELETE FROM site_files WHERE site_id = ? AND path = ?")
    .bind(siteId, normalizeAgentSiteFileName(path))
    .run();
}

async function sha256AgentText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseSiteBlogPostCreateText(messageText: string): {
  title: string | null;
  topic: string | null;
  slug: string | null;
  excerpt: string | null;
  bodyMarkdown: string | null;
  draft: boolean;
  publishedAt: string | null;
} {
  const bodyMarkdown = extractAgentBlogField(messageText, ["body markdown", "body", "markdown"]);
  const excerpt = extractAgentBlogField(messageText, ["excerpt", "summary"]);
  const slug = normalizeAgentBlogSlug(extractAgentBlogField(messageText, ["slug"]));
  const explicitTitle = extractAgentBlogPhrase(
    messageText,
    ["titled as ", "called ", "titled ", "named ", "title to ", "title as ", "title:"],
    [" with ", " and ", " as ", " but "],
  );
  const topic = extractAgentBlogPhrase(
    messageText,
    ["blog post about ", "blog post on ", "article about ", "article on ", "post about ", "post on "],
    [" with ", " and ", " but ", " keep ", " as ", " for "],
  );
  const title = explicitTitle || (topic ? titleFromAgentBlogTopic(topic) : null);
  const draft = !/\b(?:publish|published|make\s+(?:it\s+)?live)\b/i.test(messageText) ||
    /\b(?:draft|keep\s+(?:it\s+)?as\s+(?:a\s+)?draft|unpublished)\b/i.test(messageText);
  return {
    title,
    topic,
    slug,
    excerpt,
    bodyMarkdown,
    draft,
    publishedAt: extractAgentBlogPublishedAt(messageText),
  };
}

function parseSiteBlogPostUpdateText(messageText: string): {
  target: string | null;
  title?: string;
  slug?: string;
  excerpt?: string | null;
  bodyMarkdown?: string;
  draft?: boolean;
  publishedAt?: string | null;
} {
  const rename = parseAgentBlogRename(messageText);
  if (rename) {
    return {
      target: cleanAgentBlogPostReference(rename.target),
      title: normalizeAgentBlogCommandValue(rename.title) || undefined,
    };
  }

  const fieldUpdate = parseAgentBlogFieldUpdate(messageText);
  if (fieldUpdate) {
    return blogUpdateForField(
      cleanAgentBlogPostReference(fieldUpdate.target),
      fieldUpdate.field,
      fieldUpdate.value,
    );
  }

  const postFieldUpdate = parseAgentBlogPostFieldUpdate(messageText);
  if (postFieldUpdate) {
    return blogUpdateForField(
      cleanAgentBlogPostReference(postFieldUpdate.target),
      postFieldUpdate.field,
      postFieldUpdate.value,
    );
  }

  if (/\b(?:publish|unpublish)\b/i.test(messageText)) {
    const target = extractSiteBlogPostReadReference(messageText);
    const publish = /\bpublish\b/i.test(messageText) && !/\bunpublish\b/i.test(messageText);
    return {
      target,
      draft: !publish,
      publishedAt: publish ? extractAgentBlogPublishedAt(messageText) || currentDateKey() : null,
    };
  }

  return { target: extractSiteBlogPostReadReference(messageText) };
}

function blogUpdateForField(
  target: string | null,
  field: string,
  rawValue: string,
): {
  target: string | null;
  title?: string;
  slug?: string;
  excerpt?: string | null;
  bodyMarkdown?: string;
  publishedAt?: string | null;
} {
  const value = normalizeNullableText(rawValue);
  const normalizedField = field.toLowerCase();
  if (normalizedField === "title") return { target, title: value || undefined };
  if (normalizedField === "slug") return { target, slug: normalizeAgentBlogSlug(value) || undefined };
  if (normalizedField === "excerpt" || normalizedField === "summary") return { target, excerpt: value };
  if (normalizedField === "published date" || normalizedField === "publishedat") {
    return { target, publishedAt: normalizeNullableText(value) };
  }
  return { target, bodyMarkdown: value || undefined };
}

function extractSiteBlogPostReadReference(messageText: string): string | null {
  const direct = extractAgentBlogPhrase(messageText, [
    "blog post about ",
    "blog post called ",
    "blog post titled ",
    "blog post named ",
    "blog post for ",
    "article about ",
    "article called ",
    "article titled ",
    "article named ",
    "article for ",
    "post about ",
    "post called ",
    "post titled ",
    "post named ",
    "post for ",
    "draft about ",
    "draft called ",
    "draft titled ",
    "draft named ",
    "draft for ",
  ]);
  if (direct) return cleanAgentBlogPostReference(direct);
  const requested = extractAgentBlogRequestedPostReference(messageText);
  if (requested) return cleanAgentBlogPostReference(requested);
  return cleanAgentBlogPostReference(
    removeAgentBlogPostKind(
      removeAgentBlogPrefix(removeAgentBlogPrefix(withoutAgentBlogPoliteness(messageText), "the "), "full "),
    ),
  );
}

function extractSiteBlogPostArchiveReference(messageText: string): string | null {
  let reference = withoutAgentBlogPoliteness(messageText);
  const action = consumeAgentBlogPrefix(reference, ["delete ", "archive ", "remove "]);
  if (action) reference = action.remaining;
  reference = removeAgentBlogPrefix(reference, "the ");
  reference = removeAgentBlogPostKind(reference);
  return cleanAgentBlogPostReference(reference);
}

function extractAgentBlogField(messageText: string, fields: readonly string[]): string | null {
  const match = findAgentBlogPhrase(messageText, fields);
  if (!match) return null;
  let value = messageText.slice(match.start + match.phrase.length).trimStart();
  const connector = consumeAgentBlogPrefix(value, ["to ", "as ", "is ", ":"]);
  if (connector) value = connector.remaining;
  return normalizeAgentBlogCommandValue(value);
}

function extractAgentBlogPublishedAt(messageText: string): string | null {
  return normalizeNullableText(messageText.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]);
}

function extractAgentBlogSiteReference(messageText: string): string | null {
  const value = extractAgentBlogPhrase(
    messageText,
    [
      "on the profile site ", "on my profile site ", "on profile site ",
      "for the profile site ", "for my profile site ", "for profile site ",
      "from the profile site ", "from my profile site ", "from profile site ",
      "in the profile site ", "in my profile site ", "in profile site ",
      "on the public site ", "on my public site ", "on public site ",
      "for the public site ", "for my public site ", "for public site ",
      "from the public site ", "from my public site ", "from public site ",
      "in the public site ", "in my public site ", "in public site ",
      "on the site ", "on my site ", "on site ",
      "for the site ", "for my site ", "for site ",
      "from the site ", "from my site ", "from site ",
      "in the site ", "in my site ", "in site ",
    ],
    [" blog", " post", " article", " draft"],
  ) || extractAgentBlogSiteHandle(messageText);
  if (!value || /^(?:my|the|profile|public)$/i.test(value)) return null;
  return value;
}

function cleanAgentBlogPostReference(value: unknown): string | null {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  let cleaned = stripAgentBlogTerminalPunctuation(trimAgentBlogQuotes(normalized));
  cleaned = removeAgentBlogPrefix(cleaned, "the ");
  cleaned = removeAgentBlogPrefix(cleaned, "draft ");
  cleaned = removeAgentBlogPostKindSuffix(cleaned);
  cleaned = truncateAgentBlogSiteQualifier(cleaned, "on");
  cleaned = truncateAgentBlogSiteQualifier(cleaned, "for");
  return normalizeNullableText(cleaned);
}

const AGENT_BLOG_UPDATE_FIELDS = [
  "body markdown",
  "published date",
  "publishedat",
  "excerpt",
  "summary",
  "markdown",
  "title",
  "slug",
  "body",
] as const;

function parseAgentBlogRename(messageText: string): { target: string; title: string } | null {
  let remaining = withoutAgentBlogPoliteness(messageText);
  const action = consumeAgentBlogPrefix(remaining, ["rename ", "retitle "]);
  if (!action) return null;
  remaining = removeAgentBlogPrefix(action.remaining, "the ");
  const postKind = consumeAgentBlogPrefix(remaining, ["blog post ", "article ", "post "]);
  if (!postKind) return null;
  const splitAt = findAgentBlogText(postKind.remaining, " to ");
  if (splitAt <= 0) return null;
  return {
    target: postKind.remaining.slice(0, splitAt),
    title: postKind.remaining.slice(splitAt + 4),
  };
}

function parseAgentBlogFieldUpdate(messageText: string): {
  field: string;
  target: string;
  value: string;
} | null {
  let remaining = withoutAgentBlogPoliteness(messageText);
  const action = consumeAgentBlogPrefix(remaining, ["update ", "set ", "change ", "replace "]);
  if (!action) return null;
  remaining = removeAgentBlogPrefix(action.remaining, "the ");
  const field = consumeAgentBlogPrefix(remaining, AGENT_BLOG_UPDATE_FIELDS);
  if (!field) return null;
  const relationship = consumeAgentBlogPrefix(field.remaining, ["for ", "on ", "of "]);
  if (!relationship) return null;
  remaining = removeAgentBlogPrefix(relationship.remaining, "the ");
  const postKind = consumeAgentBlogPrefix(remaining, ["blog post ", "article ", "post "]);
  const assignment = splitAgentBlogAssignment(postKind?.remaining || remaining);
  if (!assignment) return null;
  return { field: field.phrase, target: assignment.target, value: assignment.value };
}

function parseAgentBlogPostFieldUpdate(messageText: string): {
  field: string;
  target: string;
  value: string;
} | null {
  let remaining = withoutAgentBlogPoliteness(messageText);
  const action = consumeAgentBlogPrefix(remaining, ["update ", "set ", "change ", "replace "]);
  if (!action) return null;
  remaining = removeAgentBlogPrefix(action.remaining, "the ");
  const postKind = consumeAgentBlogPrefix(remaining, ["blog post ", "article ", "post "]);
  if (!postKind) return null;

  let match: { field: string; index: number } | null = null;
  for (const field of AGENT_BLOG_UPDATE_FIELDS) {
    const index = findAgentBlogText(postKind.remaining, ` ${field}`);
    if (index > 0 && (!match || index < match.index)) match = { field, index };
  }
  if (!match) return null;
  const assignment = splitAgentBlogAssignment(
    postKind.remaining.slice(match.index + match.field.length + 1),
  );
  if (!assignment) return null;
  return {
    field: match.field,
    target: postKind.remaining.slice(0, match.index),
    value: assignment.value,
  };
}

function splitAgentBlogAssignment(value: string): { target: string; value: string } | null {
  let splitAt = -1;
  let marker = "";
  for (const candidate of [" to ", " as ", " : "]) {
    const index = findAgentBlogText(value, candidate);
    if (index >= 0 && (splitAt === -1 || index < splitAt)) {
      splitAt = index;
      marker = candidate;
    }
  }
  if (splitAt <= 0) return null;
  const target = value.slice(0, splitAt).trim();
  const rawValue = value.slice(splitAt + marker.length);
  if (!target || !rawValue.trim()) return null;
  return { target, value: rawValue };
}

function extractAgentBlogRequestedPostReference(messageText: string): string | null {
  let remaining = withoutAgentBlogPoliteness(messageText);
  const action = consumeAgentBlogPrefix(remaining, [
    "read ", "open ", "show ", "pull up ", "check ", "inspect ", "publish ", "unpublish ",
  ]);
  if (!action) return null;
  remaining = removeAgentBlogPrefix(removeAgentBlogPrefix(action.remaining, "the "), "full ");
  const postKind = consumeAgentBlogPrefix(remaining, ["blog post ", "article ", "post ", "draft "]);
  return postKind?.remaining || null;
}

function extractAgentBlogPhrase(
  messageText: string,
  phrases: readonly string[],
  terminators: readonly string[] = [],
): string | null {
  const match = findAgentBlogPhrase(messageText, phrases);
  if (!match) return null;
  const candidate = messageText.slice(match.start + match.phrase.length);
  let end = candidate.length;
  for (const terminator of terminators) {
    const index = findAgentBlogText(candidate, terminator);
    if (index >= 0 && index < end) end = index;
  }
  return normalizeAgentBlogCommandValue(candidate.slice(0, end));
}

function findAgentBlogPhrase(
  value: string,
  phrases: readonly string[],
): { start: number; phrase: string } | null {
  let match: { start: number; phrase: string } | null = null;
  for (const phrase of phrases) {
    let searchFrom = 0;
    while (searchFrom < value.length) {
      const index = findAgentBlogText(value, phrase, searchFrom);
      if (index < 0) break;
      const previous = index > 0 ? value[index - 1] : "";
      if (!previous || !isAgentBlogWordCharacter(previous)) {
        if (!match || index < match.start || (index === match.start && phrase.length > match.phrase.length)) {
          match = { start: index, phrase };
        }
        break;
      }
      searchFrom = index + 1;
    }
  }
  return match;
}

function consumeAgentBlogPrefix(
  value: string,
  phrases: readonly string[],
): { phrase: string; remaining: string } | null {
  const trimmed = value.trimStart();
  let match = "";
  const lower = trimmed.toLowerCase();
  for (const phrase of phrases) {
    if (lower.startsWith(phrase.toLowerCase()) && phrase.length > match.length) match = phrase;
  }
  if (!match) return null;
  return { phrase: match, remaining: trimmed.slice(match.length).trimStart() };
}

function removeAgentBlogPrefix(value: string, phrase: string): string {
  const match = consumeAgentBlogPrefix(value, [phrase]);
  return match ? match.remaining : value.trim();
}

function removeAgentBlogPostKind(value: string): string {
  const match = consumeAgentBlogPrefix(value, ["blog post ", "article ", "post ", "draft "]);
  return match ? match.remaining : value.trim();
}

function removeAgentBlogPostKindSuffix(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  for (const suffix of [" blog post", " article", " post", " draft"]) {
    if (lower.endsWith(suffix)) return trimmed.slice(0, -suffix.length).trimEnd();
  }
  return trimmed;
}

function withoutAgentBlogPoliteness(value: string): string {
  let remaining = value.trim();
  const please = consumeAgentBlogPrefix(remaining, ["please "]);
  if (please) remaining = please.remaining;
  const request = consumeAgentBlogPrefix(remaining, ["can you ", "could you ", "would you ", "will you "]);
  return request ? request.remaining : remaining;
}

function extractAgentBlogSiteHandle(value: string): string | null {
  const lower = value.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < lower.length) {
    const siteIndex = lower.indexOf("site", searchFrom);
    if (siteIndex < 0) break;
    const before = siteIndex > 0 ? value[siteIndex - 1] : "";
    const after = value[siteIndex + 4] || "";
    if (before && isAgentBlogWordCharacter(before)) {
      searchFrom = siteIndex + 4;
      continue;
    }
    let index = siteIndex + 4;
    while (isAgentBlogWhitespace(value[index] || "")) index += 1;
    if (value[index] === "@") index += 1;
    const start = index;
    while (isAgentBlogHandleCharacter(value[index] || "")) index += 1;
    const handle = value.slice(start, index);
    if (handle.length >= 2 && isAgentBlogAlphaNumeric(handle[0]) && (!after || !isAgentBlogWordCharacter(after) || start > siteIndex + 4)) {
      return handle;
    }
    searchFrom = siteIndex + 4;
  }
  return null;
}

function truncateAgentBlogSiteQualifier(value: string, preposition: "on" | "for"): string {
  const lower = value.toLowerCase();
  for (const qualifier of [
    ` ${preposition} my profile site `,
    ` ${preposition} the profile site `,
    ` ${preposition} profile site `,
    ` ${preposition} my public site `,
    ` ${preposition} the public site `,
    ` ${preposition} public site `,
    ` ${preposition} my site `,
    ` ${preposition} the site `,
    ` ${preposition} site `,
  ]) {
    const index = lower.indexOf(qualifier);
    if (index >= 0) return value.slice(0, index).trimEnd();
  }
  return value;
}

function normalizeAgentBlogCommandValue(value: string): string | null {
  return normalizeNullableText(stripAgentBlogTerminalPunctuation(trimAgentBlogQuotes(value)));
}

function trimAgentBlogQuotes(value: string): string {
  let result = value.trim();
  if (result.startsWith('"') || result.startsWith("“")) result = result.slice(1).trimStart();
  if (result.endsWith('"') || result.endsWith("”")) result = result.slice(0, -1).trimEnd();
  return result;
}

function stripAgentBlogTerminalPunctuation(value: string): string {
  let end = value.trimEnd().length;
  while (end > 0 && ".?!".includes(value[end - 1])) end -= 1;
  return value.slice(0, end).trimEnd();
}

function findAgentBlogText(value: string, search: string, fromIndex = 0): number {
  return value.toLowerCase().indexOf(search.toLowerCase(), fromIndex);
}

function isAgentBlogAlphaNumeric(value: string): boolean {
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
}

function isAgentBlogWordCharacter(value: string): boolean {
  return isAgentBlogAlphaNumeric(value) || value === "_";
}

function isAgentBlogHandleCharacter(value: string): boolean {
  return isAgentBlogWordCharacter(value) || value === "." || value === "-";
}

function isAgentBlogWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r";
}

function uniqueAgentBlogPostSlug(posts: AgentBlogPost[], title: string): string {
  const base = normalizeAgentBlogSlug(title) || "post";
  const used = new Set(posts.map((post) => post.slug));
  if (!used.has(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function defaultAgentBlogPostBody(title: string, topic: string | null): string {
  const body = topic || title;
  return `# ${title}\n\n${body}.`;
}

function titleFromAgentBlogTopic(topic: string): string {
  return titleFromAgentBlogSlug(slugifyAgentBlogText(topic));
}

function titleFromAgentBlogSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Untitled Post";
}

function normalizeAgentBlogSlug(value: unknown): string | null {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  return slugifyAgentBlogText(normalized);
}

function slugifyAgentBlogText(value: string): string {
  let slug = "";
  let pendingSeparator = false;
  for (const character of value.toLowerCase()) {
    if (isAgentBlogAlphaNumeric(character)) {
      if (pendingSeparator && slug) slug += "-";
      slug += character;
      pendingSeparator = false;
    } else if (slug) {
      pendingSeparator = true;
    }
  }
  return slug.slice(0, 80);
}

function slugFromAgentBlogPostFile(file: string): string {
  const normalized = normalizeAgentSiteFileName(file);
  return normalized.split("/").pop()?.replace(/\.[^.]+$/g, "") || "";
}

function normalizeAgentSiteFileName(name: string): string {
  return name
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function currentDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatAgentBlogSiteChoice(site: AgentBlogSite): string {
  return site.customDomain ? `@${site.username} (${site.customDomain})` : `@${site.username}`;
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || null;
}

function normalizeAgentEntityText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function importantAgentEntityTokens(value: string): ReadonlySet<string> {
  const stop = new Set([
    "a",
    "about",
    "and",
    "any",
    "article",
    "blog",
    "can",
    "check",
    "draft",
    "for",
    "in",
    "list",
    "me",
    "my",
    "of",
    "please",
    "post",
    "posts",
    "profile",
    "public",
    "pull",
    "read",
    "show",
    "site",
    "the",
    "to",
    "up",
    "you",
  ]);
  return new Set(
    normalizeAgentEntityText(value)
      .split(" ")
      .filter((token) => token.length > 1 && !stop.has(token)),
  );
}

function decodeSiteFileText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value);
  return null;
}
