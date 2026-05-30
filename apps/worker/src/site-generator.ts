import {
  formatPublicLocation,
  type PublicLocationData,
} from "./location-display";

type Me3LinkMap = Record<string, string | undefined>;

type Me3Button = {
  text?: string;
  url?: string;
  style?: "primary" | "secondary" | "outline" | string;
  icon?: string;
};

type Me3Page = {
  slug?: string;
  title?: string;
  file?: string;
  visible?: boolean;
};

type Me3Post = Me3Page & {
  publishedAt?: string;
  excerpt?: string;
  draft?: boolean;
  type?: string;
  media?: { url?: string; thumbnail?: string };
};

type Me3Product = Me3Page & {
  price?: number;
  currency?: string;
  excerpt?: string;
  available?: boolean;
};

type SiteSectionPaths = {
  blog: string;
  shop: string;
};

type Me3Testimonial = {
  name?: string;
  handle?: string;
  avatar?: string;
  quote?: string;
  profileUrl?: string;
};

type BookingPricingConfig = PricingConfig & {
  allowFlexiblePricing?: boolean;
  minimumAmount?: number;
};

type BookingOffer = {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  pricing?: BookingPricingConfig;
};

type BookingClass = BookingOffer & {
  timezone?: string;
  recurrence?: {
    frequency?: "weekly" | "biweekly" | string;
    weekday?: string;
    startTime?: string;
  };
  capacity?: number | null;
};

type BookingRetreat = BookingOffer & {
  durationDays?: number;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timezone?: string;
  capacity?: number | null;
};

type BookingType = {
  id?: string;
  type?: "one_to_one" | "class" | "retreat" | string;
  label?: string;
  title?: string;
  description?: string;
  offers?: BookingOffer[];
  classes?: BookingClass[];
  retreats?: BookingRetreat[];
  availability?: { timezone?: string; windows?: Record<string, string[]> };
};

export type Me3SiteProfile = {
  version?: string;
  name?: string;
  handle?: string;
  location?: string;
  locationData?: PublicLocationData;
  bio?: string;
  avatar?: string;
  banner?: string;
  links?: Me3LinkMap;
  buttons?: Me3Button[];
  pages?: Me3Page[];
  posts?: Me3Post[];
  products?: Me3Product[];
  testimonials?: Me3Testimonial[];
  blogTitle?: string;
  shopTitle?: string;
  testimonialsTitle?: string;
  testimonialDisplay?: string;
  footer?: false | { text?: string; link?: { text?: string; url?: string } };
  intents?: {
    subscribe?: { enabled?: boolean; title?: string; description?: string };
    book?: {
      enabled?: boolean;
      title?: string;
      description?: string;
      duration?: number;
      pricing?: BookingPricingConfig;
      offers?: BookingOffer[];
      classes?: BookingClass[];
      retreats?: BookingRetreat[];
      bookingTypes?: BookingType[];
      availability?: { timezone?: string; windows?: Record<string, string[]> };
      bufferTime?: number;
      url?: string;
    };
    gift?: { enabled?: boolean; title?: string; description?: string; icon?: string };
  };
};

type PricingConfig = {
  enabled?: boolean;
  suggestedAmount?: number;
  currency?: string;
  allowFree?: boolean;
};

type SiteRenderCapabilities = {
  footerCustomization: boolean;
  bookingsEnabled: boolean;
  newsletterSignup: boolean;
};

const DEFAULT_CAPABILITIES: SiteRenderCapabilities = {
  footerCustomization: true,
  bookingsEnabled: true,
  newsletterSignup: true,
};

const DEFAULT_VIBE = "warm";

const VIBE_FONT_URLS: Record<string, string> = {
  tech: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap",
};

const ICONS: Record<string, string> = {
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  infinity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8"/></svg>',
  twitter:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
  instagram:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>',
  substack:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/></svg>',
  email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>',
  website: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577v-2.04c-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22v3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
  shoppingcart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
  graduationcap:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>',
  helpcircle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
};

export async function generateSiteHtml(
  profile: Me3SiteProfile,
  files: { name: string; content: string }[],
  capabilities: Partial<SiteRenderCapabilities> = DEFAULT_CAPABILITIES,
): Promise<Record<string, string>> {
  const output: Record<string, string> = {};
  const fileMap = new Map(files.map((file) => [normalizeSitePath(file.name), file.content]));
  const sectionPaths = resolveSiteSectionPaths(profile);
  const access = { ...DEFAULT_CAPABILITIES, ...capabilities };

  output["index.html"] = generateIndexHtml(profile, access);

  for (const page of profile.pages || []) {
    if (page.visible === false || !page.slug || !page.file) continue;
    const markdown = fileMap.get(normalizeSitePath(page.file));
    if (markdown !== undefined) {
      output[`${normalizeSitePath(page.slug)}.html`] = generateContentPageHtml(profile, page.title || titleFromSlug(page.slug), markdown, page.slug, "./", access);
    }
  }

  const posts = (profile.posts || []).filter((post) => !post.draft && post.slug);
  if (posts.length > 0) {
    output[`${sectionPaths.blog}/index.html`] = generateCollectionIndex(profile, profile.blogTitle || "Blog", posts, "blog", access);
    for (const post of posts) {
      if (!post.file || !post.slug) continue;
      const markdown = fileMap.get(normalizeSitePath(post.file));
      if (markdown !== undefined) {
        output[`${sectionPaths.blog}/${normalizeSitePath(post.slug)}.html`] = generateContentPageHtml(profile, post.title || titleFromSlug(post.slug), markdown, "blog", "../", access);
      }
    }
  }

  const products = (profile.products || []).filter((product) => product.slug);
  if (products.length > 0) {
    output[`${sectionPaths.shop}/index.html`] = generateCollectionIndex(profile, profile.shopTitle || "Shop", products, "shop", access);
    for (const product of products) {
      if (!product.file || !product.slug) continue;
      const markdown = fileMap.get(normalizeSitePath(product.file));
      if (markdown !== undefined) {
        output[`${sectionPaths.shop}/${normalizeSitePath(product.slug)}.html`] = generateContentPageHtml(profile, product.title || titleFromSlug(product.slug), markdown, "shop", "../", access);
      }
    }
  }

  output["me.json"] = JSON.stringify(profile, null, 2);
  return output;
}

function generateIndexHtml(profile: Me3SiteProfile, capabilities: SiteRenderCapabilities): string {
  const vibe = getVibe(profile);
  const title = profile.name || profile.handle || "ME3 site";
  const description = profile.bio || `${title} on ME3`;
  const bannerPath = profile.banner ? filePathForHtml(profile.banner) : "";
  const avatarPath = profile.avatar ? filePathForHtml(profile.avatar) : "";
  const banner = bannerPath
    ? `<div class="banner"><img src="${escapeHtml(bannerPath)}" alt="" loading="eager" decoding="async"></div>`
    : "";
  const avatar = avatarPath
    ? `<img class="avatar" src="${escapeHtml(avatarPath)}" alt="${escapeHtml(title)}" width="120" height="120" decoding="async">`
    : "";
  const booking = capabilities.bookingsEnabled ? generateBooking(profile) : "";
  const newsletter = capabilities.newsletterSignup ? generateNewsletter(profile) : "";
  const displayLocation = formatPublicLocation(profile);

  return pageShell(profile, {
    title,
    description,
    activeSlug: "",
    basePath: "./",
    body: `${banner}
      <main class="main">
        <header class="profile-header">
          ${avatar}
          <h1 class="name">${escapeHtml(title)}</h1>
          ${displayLocation ? `<p class="location">${escapeHtml(displayLocation)}</p>` : ""}
          ${profile.bio ? `<p class="bio">${parseInlineMarkdown(profile.bio)}</p>` : ""}
        </header>
        ${generateNav(profile, "", "./")}
        ${generateButtons(profile)}
        ${generateLinks(profile)}
        ${booking}
        ${generateTestimonials(profile)}
        ${newsletter}
      </main>`,
    footer: generateFooter(profile, capabilities.footerCustomization),
    vibe,
  });
}

function generateContentPageHtml(
  profile: Me3SiteProfile,
  title: string,
  markdown: string,
  activeSlug: string,
  basePath: string,
  capabilities: SiteRenderCapabilities,
): string {
  return pageShell(profile, {
    title: `${title} | ${profile.name || "ME3"}`,
    description: markdownToText(markdown).slice(0, 160),
    activeSlug,
    basePath,
    body: `<header class="page-header"><a class="back-link" href="${basePath}">${profile.avatar ? `<img src="${escapeHtml(filePathForHtml(profile.avatar, basePath))}" alt="" class="avatar-small">` : ""}<span>${escapeHtml(profile.name || "Home")}</span></a></header>
      ${generateNav(profile, activeSlug, basePath)}
      <main class="content"><h1>${escapeHtml(title)}</h1>${markdownToHtml(markdown)}</main>`,
    footer: generateFooter(profile, capabilities.footerCustomization),
    vibe: getVibe(profile),
  });
}

function generateCollectionIndex(
  profile: Me3SiteProfile,
  title: string,
  items: Array<Me3Post | Me3Product>,
  activeSlug: string,
  capabilities: SiteRenderCapabilities,
): string {
  const cards = items
    .map((item) => {
      const slug = normalizeSitePath(item.slug || "");
      const excerpt = "excerpt" in item && item.excerpt ? `<p>${escapeHtml(item.excerpt)}</p>` : "";
      return `<a class="collection-card" href="./${escapeHtml(slug)}"><strong>${escapeHtml(item.title || titleFromSlug(slug))}</strong>${excerpt}</a>`;
    })
    .join("");

  return pageShell(profile, {
    title: `${title} | ${profile.name || "ME3"}`,
    description: `${title} by ${profile.name || "ME3"}`,
    activeSlug,
    basePath: "../",
    body: `<header class="page-header"><a class="back-link" href="../">${profile.avatar ? `<img src="${escapeHtml(filePathForHtml(profile.avatar, "../"))}" alt="" class="avatar-small">` : ""}<span>${escapeHtml(profile.name || "Home")}</span></a></header>
      ${generateNav(profile, activeSlug, "../")}
      <main class="content"><h1>${escapeHtml(title)}</h1><div class="collection-list">${cards}</div></main>`,
    footer: generateFooter(profile, capabilities.footerCustomization),
    vibe: getVibe(profile),
  });
}

function pageShell(
  profile: Me3SiteProfile,
  options: {
    title: string;
    description: string;
    activeSlug: string;
    basePath: string;
    body: string;
    footer: string;
    vibe: string;
  },
): string {
  const fontUrl = VIBE_FONT_URLS[options.vibe];
  const fontLinks = fontUrl
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${escapeHtml(fontUrl)}">`
    : "";
  const faviconPath = profile.avatar
    ? filePathForHtml(profile.avatar, options.basePath)
    : `${options.basePath}favicon.png`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
  <meta name="description" content="${escapeHtml(options.description)}">
  <link rel="icon" href="${escapeHtml(faviconPath)}">
  <link rel="apple-touch-icon" href="${escapeHtml(faviconPath)}">
  ${fontLinks}
  <style>${siteCss(options.vibe, profile.links?._accent)}${siteCssOverrides(options.vibe)}</style>
</head>
<body data-vibe="${escapeHtml(options.vibe)}">
  <div class="container">
    ${options.body}
    ${options.footer}
  </div>
</body>
</html>`;
}

function generateNav(profile: Me3SiteProfile, activeSlug: string, basePath: string): string {
  const sectionPaths = resolveSiteSectionPaths(profile);
  const pages = (profile.pages || []).filter((page) => page.visible !== false && page.slug);
  const hasPosts = (profile.posts || []).some((post) => !post.draft);
  const hasProducts = (profile.products || []).length > 0;
  if (pages.length === 0 && !hasPosts && !hasProducts) return "";

  const links = [
    `<a href="${basePath}" class="nav-link${activeSlug ? "" : " active"}">Home</a>`,
    ...pages.map((page) => `<a href="${basePath}${escapeHtml(normalizeSitePath(page.slug || ""))}" class="nav-link${page.slug === activeSlug ? " active" : ""}">${escapeHtml(page.title || titleFromSlug(page.slug || ""))}</a>`),
    hasPosts ? `<a href="${basePath}${escapeHtml(sectionPaths.blog)}/" class="nav-link${activeSlug === "blog" ? " active" : ""}">${escapeHtml(profile.blogTitle || "Blog")}</a>` : "",
    hasProducts ? `<a href="${basePath}${escapeHtml(sectionPaths.shop)}/" class="nav-link${activeSlug === "shop" ? " active" : ""}">${escapeHtml(profile.shopTitle || "Shop")}</a>` : "",
  ].join("");

  return `<nav class="nav">${links}</nav>`;
}

function generateButtons(profile: Me3SiteProfile): string {
  const buttons = profile.buttons || [];
  const gift = profile.intents?.gift;
  if (buttons.length === 0 && !gift?.enabled) return "";

  const giftButton = gift?.enabled
    ? `<a href="#gift" class="cta-button primary"><span class="btn-icon">${iconMarkup("gift")}</span>${escapeHtml(gift.title || "Send a gift")}</a>`
    : "";
  const buttonHtml = buttons
    .filter((button) => button.text && button.url)
    .map((button) => {
      const iconHtml = iconMarkup(button.icon);
      const icon = iconHtml ? `<span class="btn-icon">${iconHtml}</span>` : "";
      return `<a class="cta-button ${escapeHtml(button.style || "primary")}" href="${escapeHtml(formatHref(button.url || ""))}" target="_blank" rel="noopener">${icon}${escapeHtml(button.text || "")}</a>`;
    })
    .join("");

  return `<div class="buttons">${giftButton}${buttonHtml}</div>`;
}

function generateLinks(profile: Me3SiteProfile): string {
  const entries = Object.entries(profile.links || {}).filter(([key, value]) => value && !key.startsWith("_") && !key.endsWith("_label"));
  if (entries.length === 0) return "";

  const items = entries
    .map(([key, value]) => {
      const label = profile.links?.[`${key}_label`] || titleFromSlug(key);
      const icon = platformIconMarkup(key);
      return `<a class="link-item" href="${escapeHtml(formatLinkHref(key, value || ""))}" target="_blank" rel="noopener" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span class="link-icon" aria-hidden="true">${icon}</span><span class="link-label">${escapeHtml(label)}</span></a>`;
    })
    .join("");

  return `<div class="links">${items}</div>`;
}

function platformIconMarkup(name: string): string {
  const key = normalizeIconName(name);
  const aliases: Record<string, string> = {
    mail: "email",
    envelope: "email",
    x: "twitter",
    xcom: "twitter",
    twitterx: "twitter",
    website: "link",
    url: "link",
  };
  return ICONS[key] || ICONS[aliases[key]] || ICONS.link;
}

function iconMarkup(name?: string): string {
  const key = (name || "").trim();
  if (!key) return "";
  const normalized = normalizeIconName(key);
  const aliases: Record<string, string> = {
    envelope: "email",
    mail: "email",
    cart: "shoppingcart",
    x: "twitter",
    xcom: "twitter",
    twitterx: "twitter",
  };
  return ICONS[key] || ICONS[normalized] || ICONS[aliases[normalized]] || escapeHtml(key);
}

function normalizeIconName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function generateTestimonials(profile: Me3SiteProfile): string {
  const testimonials = (profile.testimonials || []).filter((item) => item.name && item.quote);
  if (testimonials.length === 0 || profile.testimonialDisplay === "standalone") return "";
  const cards = testimonials.map((item) => {
    const avatar = item.avatar
      ? `<img class="testimonial-avatar" src="${escapeHtml(filePathForHtml(item.avatar))}" alt="${escapeHtml(item.name || "")}" loading="lazy" decoding="async">`
      : `<div class="testimonial-avatar placeholder" aria-hidden="true"><span>${escapeHtml(initialsForName(item.name || ""))}</span></div>`;
    const profileLink = item.profileUrl
      ? `<a class="testimonial-link" href="${escapeHtml(formatHref(item.profileUrl))}" target="_blank" rel="noopener">View site</a>`
      : "";
    const handle = item.handle ? `<p class="testimonial-handle">@${escapeHtml(item.handle.replace(/^@/, ""))}</p>` : "";
    return `<article class="testimonial-card"><header class="testimonial-header">${avatar}<div class="testimonial-meta"><p class="testimonial-name">${escapeHtml(item.name || "")}</p>${handle}</div>${profileLink}</header><p class="testimonial-quote">&ldquo;${escapeHtml(item.quote || "")}&rdquo;</p></article>`;
  });

  if (testimonials.length === 1) {
    return `<section class="testimonials-section"><h3 class="section-title">${escapeHtml(profile.testimonialsTitle || "Testimonials")}</h3><div class="testimonials-single">${cards[0]}</div></section>`;
  }

  const slides = cards
    .map((card) => `<div class="testimonials-slide">${card}</div>`)
    .join("");
  const dots = testimonials
    .map((_, index) => `<button type="button" class="carousel-dot${index === 0 ? " active" : ""}" data-testimonial-dot="${index}" aria-label="Show testimonial ${index + 1}"></button>`)
    .join("");

  return `<section class="testimonials-section"><h3 class="section-title">${escapeHtml(profile.testimonialsTitle || "Testimonials")}</h3><div class="testimonials-carousel" data-testimonials-carousel><div class="testimonials-track">${slides}</div></div><div class="carousel-dots">${dots}</div></section><script src="https://unpkg.com/embla-carousel/embla-carousel.umd.js"></script><script>${testimonialCarouselScript()}</script>`;
}

function testimonialCarouselScript(): string {
  return `(function(){
  function init(){
    document.querySelectorAll('[data-testimonials-carousel]').forEach(function(root){
      var track=root.querySelector('.testimonials-track');
      var slides=Array.prototype.slice.call(root.querySelectorAll('.testimonials-slide'));
      var section=root.closest('.testimonials-section');
      var dots=section?Array.prototype.slice.call(section.querySelectorAll('[data-testimonial-dot]')):[];
      var index=0;
      var embla=window.EmblaCarousel?window.EmblaCarousel(root,{loop:true,align:'center',dragFree:false}):null;
      function updateDots(next){
        index=typeof next==='number'?next:(embla?embla.selectedScrollSnap():index);
        dots.forEach(function(dot,i){dot.classList.toggle('active',i===index);});
      }
      if(embla){
        dots.forEach(function(dot,i){dot.addEventListener('click',function(){embla.scrollTo(i);});});
        embla.on('select',updateDots);
        updateDots(embla.selectedScrollSnap());
        return;
      }
      function show(next){
        if(!slides.length||!track)return;
        index=Math.max(0,Math.min(slides.length-1,next));
        track.style.transform='translateX(-'+slides[index].offsetLeft+'px)';
        updateDots(index);
      }
      dots.forEach(function(dot,i){dot.addEventListener('click',function(){show(i);});});
      window.addEventListener('resize',function(){show(index);});
      show(0);
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();`;
}

function generateBooking(profile: Me3SiteProfile): string {
  const book = profile.intents?.book;
  if (!book?.enabled) return "";
  const bookingTypes = normalizeBookingTypes(book);
  if (bookingTypes.length === 0) return "";
  const activeType = bookingTypes[0];
  const title = normalizeBookingHeading(activeType.title || book.title);
  const description = activeType.description || book.description || "";
  const tabs =
    bookingTypes.length > 1
      ? `<div class="booking-type-tablist">${bookingTypes
          .map((type, index) => `<button type="button" class="booking-type-tab${index === 0 ? " active" : ""}" disabled>${escapeHtml(type.label || bookingTypeLabel(type.type))}</button>`)
          .join("")}</div>`
      : "";

  return `<section class="booking" id="booking"><h2>${escapeHtml(title || "Book a session")}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}${tabs}${generateBookingTypeBody(activeType, book, profile)}</section>`;
}

function normalizeBookingHeading(value?: string): string {
  const trimmed = (value || "").trim();
  if (trimmed.toLowerCase() === "book a call") return "Book a session";
  return trimmed;
}

function normalizeBookingTypes(book: NonNullable<Me3SiteProfile["intents"]>["book"]): BookingType[] {
  if (!book) return [];
  const explicitTypes = Array.isArray(book.bookingTypes) ? book.bookingTypes : [];
  const bookingTypes: BookingType[] = [];

  for (const item of explicitTypes) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "one_to_one") {
      bookingTypes.push({
        type: "one_to_one",
        label: item.label || "1:1",
        title: item.title || book.title || "1:1",
        description: item.description || book.description || "",
        offers: Array.isArray(item.offers) ? item.offers : [],
        availability: item.availability || book.availability,
      });
    } else if (item.type === "class") {
      bookingTypes.push({
        type: "class",
        label: item.label || "Classes",
        title: item.title || "Classes",
        description: item.description || "",
        classes: Array.isArray(item.classes) ? item.classes : [],
      });
    } else if (item.type === "retreat") {
      bookingTypes.push({
        type: "retreat",
        label: item.label || "Retreats",
        title: item.title || "Retreats",
        description: item.description || "",
        retreats: Array.isArray(item.retreats) ? item.retreats : [],
      });
    }
  }

  if (bookingTypes.length === 0 && (Array.isArray(book.offers) || book.availability?.windows)) {
    bookingTypes.push({
      type: "one_to_one",
      label: "1:1",
      title: book.title || "1:1",
      description: book.description || "",
      availability: book.availability,
      offers:
        Array.isArray(book.offers) && book.offers.length > 0
          ? book.offers
          : [
              {
                id: "book-session",
                title: book.title || "Book a call",
                description: book.description || "",
                duration: book.duration || 30,
                pricing: book.pricing,
              },
            ],
    });
  }

  if (bookingTypes.length === 0 && Array.isArray(book.classes) && book.classes.length > 0) {
    bookingTypes.push({
      type: "class",
      label: "Classes",
      title: "Classes",
      classes: book.classes,
    });
  }

  if (bookingTypes.length === 0 && Array.isArray(book.retreats) && book.retreats.length > 0) {
    bookingTypes.push({
      type: "retreat",
      label: "Retreats",
      title: "Retreats",
      retreats: book.retreats,
    });
  }

  return bookingTypes;
}

function generateBookingTypeBody(
  type: BookingType,
  book: NonNullable<Me3SiteProfile["intents"]>["book"],
  profile: Me3SiteProfile,
): string {
  if (type.type === "class") {
    const classes = Array.isArray(type.classes) ? type.classes : [];
    const cards = classes.map((offer, index) => {
      const recurrence = offer.recurrence;
      const capacity = typeof offer.capacity === "number" ? `${offer.capacity} seats` : "Unlimited seats";
      return `<div class="booking-card${index === 0 ? " active" : ""}"><strong>${escapeHtml(offer.title || "Class")}</strong><span>${escapeHtml(recurrence?.weekday || "Weekly")} · ${escapeHtml(recurrence?.startTime || "--:--")} · ${offer.duration || 60} min</span><small>${escapeHtml(capacity)}</small></div>`;
    }).join("");
    return `<div class="booking-session-preview">${cards}</div><p class="booking-note">Visitors will choose a class, then an upcoming session.</p>`;
  }

  if (type.type === "retreat") {
    const retreats = Array.isArray(type.retreats) ? type.retreats : [];
    const cards = retreats.map((offer, index) => {
      const dates = offer.startDate && offer.endDate ? ` · ${offer.startDate} → ${offer.endDate}` : "";
      const capacity = typeof offer.capacity === "number" ? `${offer.capacity} spaces` : "Unlimited spaces";
      return `<div class="booking-card${index === 0 ? " active" : ""}"><strong>${escapeHtml(offer.title || "Retreat")}</strong><span>${offer.durationDays || 1} days${escapeHtml(dates)}</span><small>${escapeHtml(capacity)}</small></div>`;
    }).join("");
    return `<div class="booking-session-preview">${cards}</div><p class="booking-note">Visitors book the fixed retreat dates shown on your live site.</p>`;
  }

  const offers =
    Array.isArray(type.offers) && type.offers.length > 0
      ? type.offers
      : [
          {
            title: book?.title || "Book a call",
            description: book?.description || "",
            duration: book?.duration || 30,
            pricing: book?.pricing,
          },
        ];
  const cards = offers.map((offer, index) => {
    const duration = offer.duration || book?.duration || 30;
    const price = formatPricing(offer.pricing);
    return `<div class="booking-card${index === 0 ? " active" : ""}"><strong>${escapeHtml(offer.title || `${duration}-min Session`)}</strong><span>${duration} min${price ? ` · ${escapeHtml(price)}` : ""}</span></div>`;
  }).join("");

  const paidOffers = offers.filter((offer) => offer.pricing?.enabled);
  if (paidOffers.length === 0) {
    return `<div class="booking-session-preview">${cards}</div><p class="booking-note">Add a paid price in the ME3 wizard to accept booking payments.</p>`;
  }

  return generatePaidBookingWidget({
    username: profile.handle || "owner",
    offers: paidOffers,
    availability: type.availability || book?.availability || {},
    bufferTime: book?.bufferTime || 0,
    fallbackDuration: book?.duration || 30,
    cards,
  });
}

function generatePaidBookingWidget(input: {
  username: string;
  offers: BookingOffer[];
  availability: { timezone?: string; windows?: Record<string, string[]> };
  bufferTime: number;
  fallbackDuration: number;
  cards: string;
}): string {
  const normalizedOffers = input.offers.map((offer, index) => ({
    id: offer.id || slugify(offer.title || `booking-${index + 1}`) || `booking-${index + 1}`,
    title: offer.title || `${offer.duration || input.fallbackDuration}-min Session`,
    duration: offer.duration || input.fallbackDuration,
    pricing: {
      enabled: offer.pricing?.enabled === true,
      suggestedAmount: offer.pricing?.suggestedAmount || 0,
      currency: offer.pricing?.currency || "USD",
      allowFlexiblePricing: offer.pricing?.allowFlexiblePricing !== false,
      minimumAmount: offer.pricing?.minimumAmount || 5,
    },
  }));
  const firstOffer = normalizedOffers[0];
  const config = {
    username: input.username,
    timezone: input.availability.timezone || "UTC",
    windows: input.availability.windows || {},
    bufferTime: input.bufferTime || 0,
    offers: normalizedOffers,
  };
  const amountRow = firstOffer?.pricing.allowFlexiblePricing
    ? `<label class="booking-field booking-amount-field">Amount (${escapeHtml(firstOffer.pricing.currency)})<input name="amount" type="number" min="${escapeHtml(String(firstOffer.pricing.minimumAmount))}" step="1" value="${escapeHtml(String(firstOffer.pricing.suggestedAmount))}"></label>`
    : "";

  return `<h3 class="booking-subtitle">Choose an offer</h3>
    <div class="booking-widget" data-booking-widget>
      <script type="application/json" data-booking-config>${jsonForScript(config)}</script>
      <div class="booking-session-preview">${input.cards}</div>
      <p class="booking-selection-summary" data-booking-selection>${escapeHtml(firstOffer.title)} &bull; ${firstOffer.duration} min</p>
      <div class="booking-date-picker">
        <label for="booking-date">Select a date:</label>
        <div class="booking-date-input-wrap" data-booking-date-wrap>
          <input id="booking-date" name="localDate" type="date" required>
        </div>
      </div>
      <div class="booking-slots" data-booking-slots role="group" aria-label="Available times"></div>
      <p class="booking-empty-times" data-booking-empty>No available times on this day.</p>
      <p class="booking-timezone">Slots are shown in ${escapeHtml(config.timezone)}.</p>
      <form class="booking-form">
        <input name="localTime" type="hidden" required>
        ${amountRow}
        <label class="booking-field">Name<input name="guestName" type="text" autocomplete="name" required></label>
        <label class="booking-field">Email<input name="guestEmail" type="email" autocomplete="email" required></label>
        <label class="booking-field">Notes<textarea name="notes" rows="3"></textarea></label>
        <button type="submit" class="booking-submit">Continue to payment</button>
        <p class="booking-status" role="status" aria-live="polite"></p>
      </form>
    </div>
    <script>${paidBookingWidgetScript()}</script>`;
}

function paidBookingWidgetScript(): string {
  return `(function(){
  var script=document.currentScript;
  var root=script&&script.previousElementSibling;
  if(!root||!root.matches('[data-booking-widget]')) return;
  var config=JSON.parse(root.querySelector('[data-booking-config]').textContent||'{}');
  var form=root.querySelector('.booking-form');
  var statusEl=root.querySelector('.booking-status');
  var dateInput=root.querySelector('input[name="localDate"]');
  var dateWrap=root.querySelector('[data-booking-date-wrap]');
  var timeInput=form.elements.localTime;
  var amountInput=form.elements.amount;
  var slotsEl=root.querySelector('[data-booking-slots]');
  var emptyEl=root.querySelector('[data-booking-empty]');
  var summaryEl=root.querySelector('[data-booking-selection]');
  var selectedOfferId=(config.offers[0]&&config.offers[0].id)||'';
  var selectedTime='';
  var dayNames=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  function setStatus(message,isError){statusEl.textContent=message||'';statusEl.classList.toggle('is-error',!!isError);}
  function offer(){return config.offers.find(function(item){return item.id===selectedOfferId;})||config.offers[0];}
  function updateSelection(){
    var selected=offer();
    if(summaryEl&&selected) summaryEl.textContent=selected.title+' • '+selected.duration+' min';
  }
  function setDetailsVisible(visible){
    form.classList.toggle('is-visible',!!visible);
  }
  function openDatePicker(){
    if(!dateInput)return;
    dateInput.focus();
    if(typeof dateInput.showPicker==='function'){
      try{dateInput.showPicker();}catch(_error){}
    }
  }
  function toMinutes(value){var parts=String(value||'').split(':').map(Number);if(parts.length!==2||parts.some(isNaN))return null;return parts[0]*60+parts[1];}
  function toTime(value){var h=Math.floor(value/60);var m=value%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
  function dayName(dateValue){if(!dateValue)return '';return dayNames[new Date(dateValue+'T12:00:00Z').getUTCDay()];}
  function populateSlots(){
    var selected=offer();
    slotsEl.innerHTML='';
    selectedTime='';
    timeInput.value='';
    setDetailsVisible(false);
    var dateValue=dateInput.value;
    var windows=(config.windows&&config.windows[dayName(dateValue)])||[];
    var duration=Number(selected.duration||30);
    if(!Number.isFinite(duration)||duration<=0)duration=30;
    var bufferTime=Number(config.bufferTime||0);
    if(!Number.isFinite(bufferTime)||bufferTime<0)bufferTime=0;
    var slotStep=duration+bufferTime;
    var found=false;
    windows.forEach(function(windowValue){
      var parts=String(windowValue).split('-');
      var start=toMinutes((parts[0]||'').trim());
      var end=parts.length>1?toMinutes((parts[1]||'').trim()):start;
      if(start===null||end===null)return;
      for(var t=start;t+(parts.length>1?duration:0)<=end;t+=slotStep){
        var value=toTime(t);
        var button=document.createElement('button');
        button.type='button';
        button.className='booking-slot';
        button.textContent=value;
        button.addEventListener('click',function(){
          selectedTime=value;
          timeInput.value=value;
          Array.prototype.forEach.call(slotsEl.querySelectorAll('.booking-slot'),function(item){item.classList.toggle('active',item===button);});
          setDetailsVisible(true);
        });
        slotsEl.appendChild(button);
        found=true;
        if(parts.length===1) break;
      }
    });
    slotsEl.hidden=!found;
    emptyEl.hidden=found||!dateValue;
  }
  root.querySelectorAll('.booking-card').forEach(function(button,index){
    button.setAttribute('role','button');
    button.setAttribute('tabindex','0');
    if(config.offers[index]) button.dataset.offerId=config.offers[index].id;
    button.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();button.click();}});
    button.addEventListener('click',function(){
      selectedOfferId=button.dataset.offerId||selectedOfferId;
      root.querySelectorAll('.booking-card').forEach(function(item){item.classList.toggle('active',item===button);});
      var selected=offer();
      if(amountInput&&selected.pricing){
        amountInput.value=selected.pricing.suggestedAmount||amountInput.value;
        amountInput.min=selected.pricing.minimumAmount||5;
        var label=amountInput.closest('label');
        if(label) label.firstChild.textContent='Amount ('+(selected.pricing.currency||'USD')+')';
      }
      updateSelection();
      populateSlots();
    });
  });
  dateInput.min=new Date().toISOString().slice(0,10);
  dateInput.addEventListener('change',populateSlots);
  dateInput.addEventListener('click',openDatePicker);
  if(dateWrap){
    dateWrap.addEventListener('click',function(event){
      if(event.target!==dateInput) openDatePicker();
    });
  }
  emptyEl.hidden=true;
  slotsEl.hidden=true;
  setDetailsVisible(false);
  updateSelection();
  form.addEventListener('submit',function(event){
    event.preventDefault();
    setStatus('Creating secure checkout...');
    var selected=offer();
    var payload={
      offerId:selected.id,
      localDate:dateInput.value,
      localTime:selectedTime||timeInput.value,
      guestName:form.elements.guestName.value,
      guestEmail:form.elements.guestEmail.value,
      notes:form.elements.notes.value,
      amount:amountInput?Number(amountInput.value):selected.pricing.suggestedAmount,
      returnUrl:window.location.href.split('#')[0]
    };
    fetch('/api/book/'+encodeURIComponent(config.username)+'/checkout-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(function(response){return response.json().then(function(data){if(!response.ok)throw new Error(data.error||'Failed to create checkout.');return data;});})
      .then(function(data){if(data.url){window.location.href=data.url;return;}throw new Error('Stripe checkout URL missing.');})
      .catch(function(error){setStatus(error.message||'Failed to create checkout.',true);});
  });
  var params=new URLSearchParams(window.location.search);
  if(params.get('booking')==='success'&&params.get('session_id')){
    setStatus('Confirming your booking...');
    fetch('/api/book/'+encodeURIComponent(config.username)+'/complete-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:params.get('session_id')})})
      .then(function(response){return response.json().then(function(data){if(!response.ok)throw new Error(data.error||'Payment succeeded, but booking confirmation failed.');return data;});})
      .then(function(){setStatus('Payment successful. Your booking is confirmed.');})
      .catch(function(error){setStatus(error.message,true);});
  } else if(params.get('booking')==='cancelled'){
    setStatus('Checkout cancelled. No payment was taken.',true);
  }
})();`;
}

function bookingTypeLabel(type?: string): string {
  if (type === "class") return "Classes";
  if (type === "retreat") return "Retreats";
  return "1:1";
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function generateNewsletter(profile: Me3SiteProfile): string {
  const subscribe = profile.intents?.subscribe;
  if (!subscribe?.enabled) return "";
  const description = subscribe.description
    ? `<p class="newsletter-desc">${escapeHtml(subscribe.description)}</p>`
    : "";
  return `<section class="newsletter" id="newsletter"><h2 class="newsletter-title">${escapeHtml(subscribe.title || "Newsletter")}</h2>${description}<form class="newsletter-form" action="/subscribe" method="POST"><input type="email" name="email" placeholder="Enter your email" required aria-label="Email address"><button type="submit">Subscribe</button></form><p class="newsletter-privacy">No spam. Unsubscribe anytime.</p></section>`;
}

function generateFooter(profile: Me3SiteProfile, allowCustom: boolean): string {
  if (allowCustom && profile.footer === false) return "";
  if (allowCustom && profile.footer && typeof profile.footer === "object") {
    const link = profile.footer.link?.text && profile.footer.link.url
      ? ` <a href="${escapeHtml(formatHref(profile.footer.link.url))}">${escapeHtml(profile.footer.link.text)}</a>`
      : "";
    return `<footer class="footer"><p>${escapeHtml(profile.footer.text || "")}${link}</p></footer>`;
  }
  return `<footer class="footer"><p>Powered by <a href="https://me3.app">me3</a></p></footer>`;
}

export function markdownToHtml(markdown: string): string {
  if (looksLikeHtml(markdown)) return markdown;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${parseInlineMarkdown(unescapeMarkdownPunctuation(paragraph.join(" ")))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    html.push(`<${list.type}>${list.items.map((item) => `<li>${parseInlineMarkdown(unescapeMarkdownPunctuation(item))}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${parseInlineMarkdown(unescapeMarkdownPunctuation(heading[2]))}</h${level}>`);
      continue;
    }
    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/);
    if (image) {
      flushParagraph();
      flushList();
      html.push(`<figure><img src="${escapeHtml(image[2])}" alt="${escapeHtml(unescapeMarkdownPunctuation(image[1] || ""))}" loading="lazy" decoding="async">${image[3] ? `<figcaption>${escapeHtml(unescapeMarkdownPunctuation(image[3]))}</figcaption>` : ""}</figure>`);
      continue;
    }
    const blockquote = trimmed.match(/^>\s+(.+)$/);
    if (blockquote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${parseInlineMarkdown(unescapeMarkdownPunctuation(blockquote[1]))}</blockquote>`);
      continue;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(unordered[1]);
      continue;
    }
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return html.join("\n");
}

function parseInlineMarkdown(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+|\.?\/[^)\s]+|files\/[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy" decoding="async">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function unescapeMarkdownPunctuation(value: string): string {
  return value.replace(/\\([\\`*{}[\]()#+\-.!_>])/g, "$1");
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value.trim());
}

function markdownToText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPricing(pricing?: BookingPricingConfig): string {
  if (!pricing?.enabled) return "Free";
  const amount = typeof pricing.suggestedAmount === "number" ? pricing.suggestedAmount : 0;
  if (amount <= 0 && pricing.allowFree) return "Free";
  const prefix = pricing.allowFlexiblePricing === false ? "" : "From ";
  return `${prefix}${currencySymbol(pricing.currency || "USD")}${amount}`;
}

function currencySymbol(currency: string): string {
  return ({ USD: "$", GBP: "£", EUR: "€", CAD: "C$", AUD: "A$" } as Record<string, string>)[currency] || currency;
}

function filePathForHtml(url: string, basePath = "./"): string {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  const previewAsset = url.match(
    /^\.?\/?preview\/[^/]+\/(files\/(?:avatar|banner|testimonial-\d+)\.[a-z0-9]+)$/i,
  );
  if (previewAsset) return `${basePath}${previewAsset[1]}`;
  if (url.startsWith("./")) return `${basePath}${url.slice(2)}`;
  if (url.startsWith("/")) return `${basePath}${url.slice(1)}`;
  return `${basePath}${url}`;
}

function formatHref(value: string): string {
  if (/^(https?:|mailto:|tel:|#)/i.test(value)) return value;
  if (value.includes("@") && !value.includes("/")) return `mailto:${value}`;
  return `https://${value}`;
}

function formatLinkHref(platform: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "#";
  const normalizedPlatform = normalizeIconName(platform);
  const aliases: Record<string, string> = {
    mail: "email",
    envelope: "email",
    x: "twitter",
    xcom: "twitter",
    twitterx: "twitter",
    website: "link",
    url: "link",
  };
  const linkType = aliases[normalizedPlatform] || normalizedPlatform;
  if (linkType === "email") return trimmed.startsWith("mailto:") ? trimmed : `mailto:${trimmed}`;
  if (/^(https?:|mailto:|tel:|#)/i.test(trimmed)) return trimmed;

  const cleaned = trimmed.replace(/^@/, "").replace(/\/+$/, "");
  switch (linkType) {
    case "twitter":
      return `https://x.com/${cleaned}`;
    case "instagram":
      return `https://instagram.com/${cleaned}`;
    case "linkedin":
      return `https://linkedin.com/in/${cleaned}`;
    case "github":
      return `https://github.com/${cleaned}`;
    case "substack":
      return `https://${cleaned}.substack.com/`;
    default:
      return formatHref(trimmed);
  }
}

function getVibe(profile: Me3SiteProfile): string {
  return profile.links?._vibe || DEFAULT_VIBE;
}

function resolveSiteSectionPaths(profile: Me3SiteProfile): SiteSectionPaths {
  const taken = new Set(
    (profile.pages || [])
      .map((page) => page.slug?.trim())
      .filter((slug): slug is string => Boolean(slug)),
  );
  return {
    blog: ensureUniqueSectionPath(slugifySectionPath(profile.blogTitle || "", "blog"), taken),
    shop: ensureUniqueSectionPath(slugifySectionPath(profile.shopTitle || "", "shop"), taken),
  };
}

function slugifySectionPath(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

function ensureUniqueSectionPath(basePath: string, taken: Set<string>): string {
  let candidate = basePath;
  let counter = 1;
  while (taken.has(candidate)) {
    candidate = `${basePath}-${counter++}`;
  }
  taken.add(candidate);
  return candidate;
}

function normalizeSitePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function titleFromSlug(slug: string): string {
  const leaf = slug.split("/").pop() || slug;
  return leaf
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function initialsForName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part.charAt(0).toUpperCase()).join("");
  return initials || "ME";
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function siteCssOverrides(vibe: string): string {
  return `.name{font-size:28px;line-height:1.2;margin:18px 0 6px}.location,.bio{font-size:14px;line-height:1.5}.newsletter form{display:flex;flex-wrap:wrap;gap:10px;max-width:520px;margin:18px auto 10px}.newsletter input[type=email]{min-width:200px;flex:1;background:var(--bg);border:2px solid var(--border);color:var(--text);cursor:text}.newsletter input[type=email]::placeholder{color:var(--muted)}.booking-widget{max-width:520px;margin:0 auto}.booking-date-picker{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin:0 auto 8px;width:100%;max-width:360px}.booking-date-picker label{text-align:center;font-weight:700;color:var(--text)}.booking-date-input-wrap{width:100%;overflow:hidden;border-radius:var(--radius);cursor:pointer}.booking-date-picker input[type=date]{display:block;width:100%;max-width:100%;min-width:0;margin:0;padding:14px 16px;border:2px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--text);box-sizing:border-box;cursor:pointer;color-scheme:light}.booking-date-picker input[type=date]::-webkit-calendar-picker-indicator{cursor:pointer}.booking-date-picker input[type=date]::-webkit-date-and-time-value{text-align:left;min-width:0}.testimonials-section{padding:24px 0;margin:32px 0}.testimonials-section .section-title{font-size:18px;font-weight:700;text-align:center;margin:0 0 16px}.testimonials-carousel{overflow:hidden}.testimonials-track{display:flex;gap:12px;padding:15px;transition:transform .25s ease}.testimonials-slide{flex:0 0 85%}.testimonials-single{display:flex;justify-content:center}.carousel-dots{display:flex;justify-content:center;gap:6px;margin-top:12px}.carousel-dot{width:8px;height:8px;border-radius:999px;border:0;background:var(--border);cursor:pointer;padding:0}.carousel-dot.active{background:var(--text)}.testimonial-card{border:1px solid var(--border);border-radius:18px;background:var(--bg);padding:20px;box-shadow:0 12px 24px rgba(0,0,0,.05);margin:0;color:var(--text)}.testimonial-header{display:flex;align-items:center;gap:14px;margin-bottom:12px}.testimonial-avatar{width:52px;height:52px;border-radius:999px;object-fit:cover;border:1px solid var(--border);flex:0 0 auto}.testimonial-avatar.placeholder{display:flex;align-items:center;justify-content:center;background:var(--border);color:var(--text);font-weight:700}.testimonial-meta{flex:1;min-width:0}.testimonial-name{font-weight:700;font-size:16px;margin:0}.testimonial-handle{color:var(--muted);font-size:14px;margin:0}.testimonial-link{font-weight:700;font-size:13px;text-decoration:underline;color:var(--accent)}.testimonial-quote{font-size:16px;line-height:1.6;margin:0}@media(max-width:480px){.newsletter input[type=email]{min-width:100%}.newsletter button{width:100%}.testimonials-slide{flex-basis:100%}}${vibe === "tech" ? `body[data-vibe=tech]{font-size:14px;line-height:1.5}body[data-vibe=tech] .name{font-size:24px;line-height:1.2;font-weight:700;letter-spacing:0;margin:18px 0 4px}body[data-vibe=tech] .bio,body[data-vibe=tech] .location{font-size:14px}body[data-vibe=tech] .newsletter input[type=email],body[data-vibe=tech] .booking-date-picker input[type=date]{background:#0a0a0a;border-color:#2a2a2a;color:#e0e0e0;color-scheme:dark}body[data-vibe=tech] .testimonial-card{background:#050505;border-color:#2a2a2a;border-radius:24px;box-shadow:none}body[data-vibe=tech] .testimonial-avatar.placeholder{background:#242424}body[data-vibe=tech] .testimonials-section{background:transparent}` : ""}`;
}

function siteCss(vibe: string, accentOverride?: string): string {
  const accent = accentOverride || (vibe === "tech" ? "#00ff88" : "#222222");
  return `:root{--bg:#faf8f5;--surface:#fff;--text:#24262b;--muted:#6d7078;--border:#e7e2dc;--accent:${accent};--radius:18px;--font:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);line-height:1.55}.container{width:min(640px,100%);margin:0 auto;min-height:100vh;background:var(--surface)}.banner{position:relative;height:190px;overflow:hidden;border-radius:0 0 var(--radius) var(--radius);background:#ddd}.banner img{width:100%;height:100%;object-fit:cover;display:block}.link-icon svg,.btn-icon svg{width:18px;height:18px}.main{padding:0 32px 36px}.profile-header{text-align:center;margin-top:-56px;position:relative}.banner+.main .profile-header{margin-top:-56px}.avatar{width:120px;height:120px;border-radius:999px;object-fit:cover;border:5px solid var(--surface);background:var(--surface)}.name{font-size:clamp(2rem,7vw,3rem);line-height:1.05;margin:22px 0 8px;font-weight:800;letter-spacing:0}.location,.bio{color:var(--muted);margin:8px auto;max-width:38rem}.nav{display:flex;gap:8px;justify-content:center;margin:28px 0 24px;flex-wrap:wrap}.nav-link{padding:9px 16px;text-decoration:none;color:var(--muted);font-weight:700}.nav-link.active{background:var(--text);color:var(--surface)}.buttons{display:grid;gap:12px;margin:24px 0}.cta-button{display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:14px 18px;text-decoration:none;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:var(--accent);color:#050505}.cta-button.secondary{background:var(--text);color:var(--surface)}.cta-button.outline{background:transparent;color:var(--text);border:2px solid var(--text)}.links{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:22px 0}.link-item{width:44px;height:44px;border-radius:999px;display:grid;place-items:center;color:var(--text);background:rgba(0,0,0,.06)}.link-label{display:none}.testimonials,.booking,.newsletter,.content{margin:32px 0;padding:24px;background:rgba(0,0,0,.055)}.booking,.newsletter{text-align:center}.booking h2,.newsletter h2,.testimonials h2{margin:0 0 14px;line-height:1.2}.booking>p,.newsletter>p{max-width:36rem;margin:0 auto 18px;color:var(--muted)}.booking-subtitle{font-size:1rem;margin:18px 0 12px}.booking-session-preview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}.booking-session-preview:has(.booking-card:only-child){grid-template-columns:1fr}.booking-card{border:2px solid var(--border);padding:16px;margin:0;display:grid;gap:4px;text-align:left;background:var(--surface);cursor:pointer}.booking-card.active{border-color:var(--text)}.booking-card span,.booking-card small{color:var(--muted)}.booking-widget{display:grid;gap:16px}.booking-selection-summary{margin:0;font-weight:800}.booking-form{display:none;gap:14px;margin-top:8px;text-align:left}.booking-form.is-visible{display:grid}.booking-submit{font:inherit;font-weight:800;border:0;background:var(--accent);color:#050505;padding:14px 18px;cursor:pointer}.booking-status{min-height:1.4em;color:var(--muted);margin:0}.booking-status.is-error{color:#b42318}.booking-timezone,.booking-empty-times{color:var(--muted);font-size:.9rem;margin:0}.booking label{display:grid;gap:8px;color:var(--muted);text-align:left}.booking-slots{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.booking-slot{font:inherit;border:2px solid var(--border);background:transparent;color:inherit;padding:10px 14px;cursor:pointer}.booking-slot.active{border-color:var(--accent);background:rgba(0,0,0,.05)}input,select,textarea{font:inherit;padding:14px;border:2px solid var(--border);background:transparent;color:inherit;box-sizing:border-box;width:100%}textarea{resize:vertical}.booking-note{font-style:italic;color:var(--muted);text-align:center}.testimonial-list{display:grid;gap:16px}.testimonials h2{text-align:center}.testimonial-card{display:grid;gap:20px;padding:24px;border:1px solid var(--border);border-radius:16px;background:var(--surface);color:var(--text);margin:0}.testimonial-card__person{display:flex;align-items:center;gap:14px}.testimonial-card__avatar{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;flex:0 0 auto;border-radius:999px;background:rgba(0,0,0,.08);color:var(--text);font-weight:800;object-fit:cover}.testimonial-card__meta{display:grid;gap:2px;min-width:0}.testimonial-card__name{color:var(--text)}.testimonial-card__handle{color:var(--muted);font-size:.9rem}.testimonial-link{margin-left:auto;color:var(--accent);font-weight:700}.testimonial-card__quote{font-size:1.05rem;line-height:1.55;margin:0}.newsletter form{display:flex;gap:10px;max-width:520px;margin:18px auto 10px}.newsletter input{min-width:0;flex:1}.newsletter button{font:inherit;font-weight:800;border:0;background:var(--accent);color:#050505;padding:0 22px;cursor:pointer}.footer{text-align:center;color:var(--muted);padding:24px 32px}.footer a{color:inherit}.page-header{padding:28px 32px 0}.back-link{display:inline-flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:800}.avatar-small{width:42px;height:42px;border-radius:999px;object-fit:cover}.content{padding:32px}.content h1{font-size:2.2rem;line-height:1.1}.content img{max-width:100%;height:auto}.collection-list{display:grid;gap:12px}.collection-card{display:grid;gap:8px;text-decoration:none;color:inherit;padding:18px;border:2px solid var(--border)}@media (max-width:560px){.main{padding:0 20px 28px}.newsletter form{display:grid}.booking-session-preview{grid-template-columns:1fr}}${vibe === "tech" ? `:root{--bg:#0a0a0a;--surface:#0a0a0a;--text:#e0e0e0;--muted:#8f8f8f;--border:#2a2a2a;--accent:${accent};--radius:0;--font:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.name{text-transform:lowercase;font-family:var(--font)}.name:before{content:"> ";color:var(--accent)}.banner{border-radius:0}.nav-link.active{background:var(--text);color:#111}.links{background:#242424;padding:16px}.link-item{border-radius:0;background:transparent}.booking,.newsletter,.content{background:#242424}.testimonials{background:transparent;padding-left:0;padding-right:0}.testimonial-card{background:#050505;border-color:#2a2a2a;border-radius:24px}.testimonial-card__avatar{background:#242424}.booking-card{background:#050505}.booking-slot.active{background:#050505}.cta-button{border-radius:0}` : ""}`;
}
