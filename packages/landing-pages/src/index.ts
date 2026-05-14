export const LANDING_PAGES_PLUGIN_ID = "me3.landing-pages";

export const LANDING_PAGE_TEMPLATE_IDS = ["event", "service", "waitlist"] as const;

export type LandingPageTemplateId = (typeof LANDING_PAGE_TEMPLATE_IDS)[number];

export const LANDING_PAGES_RUNTIME = {
  id: LANDING_PAGES_PLUGIN_ID,
  packageName: "@me3-core/plugin-landing-pages",
  bundled: true,
  runtimeStatus: "landing_pages_runtime",
  documentVersions: [1],
  templateIds: LANDING_PAGE_TEMPLATE_IDS,
  routes: [
    "/api/sites/:username/landing-page",
    "/api/agent/landing-pages/generate",
  ],
  notes: [
    "Core bundles landing-page schema, template metadata, draft generation, and HTML rendering through a first-party plugin package.",
    "Worker routes keep owner auth, site lookup, persistence, and publish responsibilities.",
    "Hosted ME3 should keep hosted-only Pro gates, domains, and quota behavior outside this package boundary.",
  ],
} as const;

export type SiteType = "profile" | "landing_page";

export type LandingPageSection =
  | {
      type: "text";
      heading: string;
      body: string;
    }
  | {
      type: "list";
      heading: string;
      items: string[];
    }
  | {
      type: "steps";
      heading: string;
      items: string[];
    }
  | {
      type: "pricing";
      heading: string;
      tiers: Array<{
        name: string;
        price: string;
        note?: string;
      }>;
    }
  | {
      type: "faq";
      heading: string;
      items: Array<{
        question: string;
        answer: string;
      }>;
    }
  | {
      type: "signup";
      heading: string;
      body: string;
      buttonLabel: string;
      placeholder?: string;
    }
  | {
      type: "countdown";
      heading: string;
      label: string;
      launchDate: string;
    }
  | {
      type: "profile";
      heading: string;
      body: string;
      profileName?: string;
      profileRole?: string;
      profileImage?: string | null;
      profileLink?: string | null;
    }
  | {
      type: "image";
      heading: string;
      image: string;
      caption?: string;
    }
  | {
      type: "links";
      heading: string;
      items: Array<{
        label: string;
        href: string;
      }>;
    };

export interface LandingPageDocument {
  version: 1;
  template: LandingPageTemplateId;
  title: string;
  brief: string;
  meta: {
    description: string;
    ogImage?: string | null;
  };
  hero: {
    eyebrow?: string;
    headline: string;
    subheadline: string;
    image?: string | null;
    cta: {
      label: string;
      href: string;
    };
  };
  sections: LandingPageSection[];
  footer: {
    cta?: {
      label: string;
      href: string;
    };
    note?: string;
    profileLink?: string | null;
  };
  style: {
    vibe: "warm" | "natural" | "retro" | "tech" | "minimal" | "me3";
    accentColor: string;
  };
  updatedAt?: string;
}

export interface LandingPageTemplateDefinition {
  id: LandingPageTemplateId;
  name: string;
  shortName: string;
  description: string;
  audience: string;
  defaultCta: string;
}

export interface LandingPageProfileInput {
  name: string | null;
  bio: string | null;
  avatar: string | null;
  profileUrl: string | null;
}

export interface LandingPageBuildInput {
  username: string;
  brief: string;
  template: LandingPageTemplateId;
  heroImage?: string | null;
  sectionImage?: string | null;
  feedback?: string | null;
  profile: LandingPageProfileInput;
}

export const LANDING_PAGE_TEMPLATES: LandingPageTemplateDefinition[] = [
  {
    id: "event",
    name: "Event / Workshop / Retreat",
    shortName: "Event",
    description:
      "For time-bound events with a clear date, location, logistics, and booking CTA.",
    audience: "Retreats, workshops, group events",
    defaultCta: "Reserve Your Spot",
  },
  {
    id: "service",
    name: "Service / Offer",
    shortName: "Service",
    description:
      "For focused offer pages that explain a problem, solution, process, and pricing.",
    audience: "Coaching, packages, consulting offers",
    defaultCta: "Book a Call",
  },
  {
    id: "waitlist",
    name: "Waitlist / Coming Soon",
    shortName: "Waitlist",
    description:
      "For launch pages that build anticipation and collect email signups before release.",
    audience: "Courses, launches, products, podcasts",
    defaultCta: "Join the Waitlist",
  },
];

const LANDING_PAGE_TEMPLATE_ID_SET = new Set<string>(LANDING_PAGE_TEMPLATE_IDS);

export function isLandingPageTemplateId(
  value: unknown,
): value is LandingPageTemplateId {
  return (
    typeof value === "string" && LANDING_PAGE_TEMPLATE_ID_SET.has(value)
  );
}

export function normalizeLandingTemplate(
  value: unknown,
): LandingPageTemplateId | null {
  return isLandingPageTemplateId(value) ? value : null;
}

export function getLandingPageTemplate(
  templateId: LandingPageTemplateId,
): LandingPageTemplateDefinition {
  return (
    LANDING_PAGE_TEMPLATES.find((template) => template.id === templateId) ||
    LANDING_PAGE_TEMPLATES[1]
  );
}

export function normalizeLandingPageDocument(
  value: unknown,
): LandingPageDocument | null {
  if (!value || typeof value !== "object") return null;
  const page = value as Partial<LandingPageDocument>;
  if (
    page.version !== 1 ||
    !normalizeLandingTemplate(page.template) ||
    typeof page.title !== "string" ||
    typeof page.brief !== "string" ||
    !page.hero ||
    !Array.isArray(page.sections)
  ) {
    return null;
  }
  return page as LandingPageDocument;
}

export function buildLandingPageDocument(
  input: LandingPageBuildInput,
): LandingPageDocument {
  const template = getLandingPageTemplate(input.template);
  const combined = [input.brief, input.feedback || ""].filter(Boolean).join("\n\n");
  const title = extractLandingTitle(combined, input.template);
  const description =
    firstSentence(combined) || "A focused landing page built with ME3 Core.";
  const ctaLabel = extractCta(input.feedback) || template.defaultCta;
  const sections: LandingPageSection[] = [
    {
      type: "text",
      heading:
        input.template === "event"
          ? "Why This Matters"
          : input.template === "waitlist"
            ? "What's Coming"
            : "The Offer",
      body: description,
    },
    {
      type: "list",
      heading: input.template === "service" ? "What's Included" : "Highlights",
      items: deriveLandingItems(combined),
    },
    ...(input.sectionImage
      ? [
          {
            type: "image",
            heading: "Preview",
            image: input.sectionImage,
            caption: description,
          } satisfies LandingPageSection,
        ]
      : []),
    {
      type: input.template === "waitlist" ? "signup" : "profile",
      ...(input.template === "waitlist"
        ? {
            heading: "Join the List",
            body: "Leave your email and you'll hear first when there is news.",
            buttonLabel: ctaLabel,
            placeholder: "you@example.com",
          }
        : {
            heading: "About",
            body:
              input.profile.bio ||
              `${input.profile.name || input.username} is the host behind this page.`,
            profileName: input.profile.name || input.username,
            profileImage: input.profile.avatar,
            profileLink: input.profile.profileUrl,
          }),
    } as LandingPageSection,
  ];

  return {
    version: 1,
    template: input.template,
    title,
    brief: input.brief.trim(),
    meta: { description, ogImage: input.heroImage || null },
    hero: {
      eyebrow: template.shortName,
      headline: title,
      subheadline: description,
      image: input.heroImage || null,
      cta: {
        label: ctaLabel,
        href: input.template === "waitlist" ? "#signup" : "#contact",
      },
    },
    sections,
    footer: {
      cta: {
        label: ctaLabel,
        href: input.template === "waitlist" ? "#signup" : "#contact",
      },
      note: "Built with ME3 Core.",
      profileLink: input.profile.profileUrl,
    },
    style: {
      vibe:
        input.template === "event"
          ? "warm"
          : input.template === "waitlist"
            ? "tech"
            : "minimal",
      accentColor: input.template === "waitlist" ? "#2d4cff" : "#0f766e",
    },
    updatedAt: new Date().toISOString(),
  };
}

export function renderLandingPageHtml(
  page: LandingPageDocument,
  username: string,
): string {
  const accent = page.style.accentColor || "#0f766e";
  const sections = page.sections
    .map((section) => renderLandingSection(section))
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.meta.description)}"><style>:root{--accent:${escapeHtml(accent)};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#151c19;background:#fbfcfb}body{margin:0}.shell{width:min(1080px,calc(100vw - 32px));margin:0 auto}.top{border-bottom:1px solid rgba(21,28,25,.12);padding:16px 0}.hero{padding:56px 0;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.8fr);gap:24px;align-items:center}.hero-copy,.media,.card{border:1px solid rgba(21,28,25,.12);border-radius:22px;background:#fff;padding:28px;box-shadow:0 18px 48px rgba(16,24,20,.06)}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:1;margin:0 0 18px}.eyebrow{color:var(--accent);font-weight:800;text-transform:uppercase;font-size:12px;letter-spacing:.12em}p,li{color:#52615b;line-height:1.65}.button,button{display:inline-flex;border:0;border-radius:999px;background:var(--accent);color:white;padding:12px 18px;text-decoration:none;font-weight:800}.section{padding:28px 0}.media{min-height:280px;display:grid;place-items:center;overflow:hidden}.media img{width:100%;height:100%;object-fit:cover}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}input{padding:12px 14px;border:1px solid rgba(21,28,25,.18);border-radius:12px}@media(max-width:760px){.hero{grid-template-columns:1fr}}</style></head><body><header class="top"><div class="shell"><strong>${escapeHtml(username)}</strong></div></header><main><section class="shell hero"><div class="hero-copy"><p class="eyebrow">${escapeHtml(page.hero.eyebrow || "")}</p><h1>${escapeHtml(page.hero.headline)}</h1><p>${escapeHtml(page.hero.subheadline)}</p><a class="button" href="${escapeHtml(page.hero.cta.href)}">${escapeHtml(page.hero.cta.label)}</a></div><div class="media">${page.hero.image ? `<img src="${escapeHtml(page.hero.image)}" alt="">` : `<span class="eyebrow">ME3 Core</span>`}</div></section>${sections}</main></body></html>`;
}

function extractLandingTitle(text: string, template: LandingPageTemplateId): string {
  const firstLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 8);
  if (firstLine) return firstLine.slice(0, 90);
  if (template === "event") return "A focused event page";
  if (template === "waitlist") return "A clear waitlist page";
  return "A focused offer page";
}

function firstSentence(text: string): string {
  return (
    text
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+/)[0]
      ?.slice(0, 180) || ""
  );
}

function deriveLandingItems(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0 && line.length < 96)
    .slice(1, 4);
  return lines.length > 0
    ? lines
    : [
        "A clear promise",
        "A simple next step",
        "A page connected to your ME3 profile",
      ];
}

function extractCta(feedback: string | null | undefined): string | null {
  const match = feedback?.match(/cta\s+(?:to|as)\s+["']?([^"'\n.]+)/i);
  return match?.[1]?.trim() || null;
}

function renderLandingSection(section: LandingPageSection): string {
  if (section.type === "text") {
    return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></div></section>`;
  }
  if (section.type === "list" || section.type === "steps") {
    return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></section>`;
  }
  if (section.type === "image") {
    return `<section class="shell section"><div class="media"><img src="${escapeHtml(section.image)}" alt="${escapeHtml(section.heading)}"></div></section>`;
  }
  if (section.type === "signup") {
    return `<section id="signup" class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p><form><input type="email" placeholder="${escapeHtml(section.placeholder || "Email")}"> <button type="button">${escapeHtml(section.buttonLabel)}</button></form></div></section>`;
  }
  if (section.type === "profile") {
    return `<section id="contact" class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p>${section.profileLink ? `<a href="${escapeHtml(section.profileLink)}">Visit profile</a>` : ""}</div></section>`;
  }
  if (section.type === "pricing") {
    return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><div class="grid">${section.tiers.map((tier) => `<article><strong>${escapeHtml(tier.name)}</strong><p>${escapeHtml(tier.price)}</p></article>`).join("")}</div></div></section>`;
  }
  if (section.type === "faq") {
    return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><div class="grid">${section.items.map((item) => `<article><strong>${escapeHtml(item.question)}</strong><p>${escapeHtml(item.answer)}</p></article>`).join("")}</div></div></section>`;
  }
  return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2></div></section>`;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
