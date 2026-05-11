import type { WizardPost } from "../stores/wizard";

export type SocialPreviewPlatform =
  | "x"
  | "linkedin"
  | "instagram"
  | "instagram_business"
  | "youtube";

export type SocialPreviewContent = {
  body: string;
  ctaLabel: string;
  url: string;
  characterCount: number;
};

type SocialPreviewPost = Pick<
  WizardPost,
  "title" | "slug" | "excerpt" | "content" | "caption"
> & {
  type?: "article" | "video" | "social";
};

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function firstSentence(value: string): string {
  const sentence = value.match(/.+?[.!?](\s|$)/)?.[0]?.trim();
  return sentence || value;
}

function buildPostSummary(post: WizardPost): string {
  const excerpt = post.excerpt?.trim();
  if (excerpt) return excerpt;

  const cleaned = stripMarkup(post.content || "");
  if (!cleaned) return "";
  return truncate(firstSentence(cleaned), 220);
}

export function buildSocialPreviewContent(
  platform: SocialPreviewPlatform,
  post: SocialPreviewPost,
  siteHandle: string,
  blogPath: string = "blog",
): SocialPreviewContent {
  const postType = post.type || "article";
  const title = postType === "social" ? "" : post.title.trim();
  const summary =
    postType === "social"
      ? (post.caption || "").trim()
      : buildPostSummary(post as WizardPost);
  const url =
    postType === "social"
      ? `https://${siteHandle}.example.com`
      : `https://${siteHandle}.example.com/${blogPath}/${post.slug}`;

  if (platform === "x") {
    const xBody = truncate(
      [title, summary, url].filter(Boolean).join("\n\n"),
      280,
    );
    return {
      body: xBody,
      ctaLabel: "Read more",
      url,
      characterCount: xBody.length,
    };
  }

  if (platform === "instagram" || platform === "instagram_business") {
    const igBody = truncate(
      [title, summary, `Link in bio: ${siteHandle}.example.com`]
        .filter(Boolean)
        .join("\n\n"),
      360,
    );
    return {
      body: igBody,
      ctaLabel: "View profile",
      url: `https://${siteHandle}.example.com`,
      characterCount: igBody.length,
    };
  }

  if (platform === "youtube") {
    const youtubeBody = truncate(
      [
        title,
        summary,
        `Catch the full post on ${siteHandle}.example.com`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      700,
    );
    return {
      body: youtubeBody,
      ctaLabel: "Open channel",
      url: `https://${siteHandle}.example.com/${blogPath}/${post.slug}`,
      characterCount: youtubeBody.length,
    };
  }

  const linkedInBody = truncate(
    [
      title,
      summary,
      `Read the full post on ${siteHandle}.example.com`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    600,
  );

  return {
    body: linkedInBody,
    ctaLabel: "Read article",
    url,
    characterCount: linkedInBody.length,
  };
}
