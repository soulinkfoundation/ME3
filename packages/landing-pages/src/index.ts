export const LANDING_PAGES_PLUGIN_ID = "me3.landing-pages";

export const LANDING_PAGE_TEMPLATE_IDS = ["event", "service", "waitlist"] as const;
export const LANDING_PAGE_RECIPE_IDS = ["event-invite", "launch-waitlist"] as const;

export type LandingPageTemplateId = (typeof LANDING_PAGE_TEMPLATE_IDS)[number];
export type LandingPageRecipeId = (typeof LANDING_PAGE_RECIPE_IDS)[number];
export type LandingPageIntent = "event" | "waitlist" | "service";
export type LandingPageThemeId = "editorial-event" | "signal-waitlist";

export const LANDING_PAGES_RUNTIME = {
  id: LANDING_PAGES_PLUGIN_ID,
  packageName: "@me3-core/plugin-landing-pages",
  bundled: true,
  runtimeStatus: "landing_pages_runtime",
  documentVersions: [1, 2],
  templateIds: LANDING_PAGE_TEMPLATE_IDS,
  recipeIds: LANDING_PAGE_RECIPE_IDS,
  routes: [
    "/api/sites/:username/landing-page",
    "/api/agent/landing-pages/generate",
  ],
  notes: [
    "Core bundles landing-page schema, recipe metadata, draft generation, and HTML rendering through a first-party plugin package.",
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

export interface LandingPageDocumentV1 {
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

export type LandingPageCta = {
  label: string;
  href: string;
  style?: "primary" | "secondary";
};

export type LandingPageV2Section =
  | {
      id: string;
      type: "story";
      heading: string;
      body: string;
    }
  | {
      id: string;
      type: "feature-list";
      heading: string;
      body?: string;
      items: Array<{ title: string; body: string }>;
    }
  | {
      id: string;
      type: "details";
      heading: string;
      items: Array<{ label: string; value: string; note?: string }>;
    }
  | {
      id: string;
      type: "steps";
      heading: string;
      items: Array<{ title: string; body: string }>;
    }
  | {
      id: string;
      type: "signup";
      heading: string;
      body: string;
      buttonLabel: string;
      placeholder?: string;
    }
  | {
      id: string;
      type: "profile";
      heading: string;
      body: string;
      profileName?: string;
      profileRole?: string;
      profileImage?: string | null;
      profileLink?: string | null;
    }
  | {
      id: string;
      type: "faq";
      heading: string;
      items: Array<{ question: string; answer: string }>;
    }
  | {
      id: string;
      type: "final-cta";
      heading: string;
      body: string;
      cta: LandingPageCta;
    };

export interface LandingPageDocumentV2 {
  version: 2;
  intent: {
    type: LandingPageIntent;
    audience: string;
    goal: string;
    offerName: string;
  };
  recipe: {
    id: LandingPageRecipeId;
    template: LandingPageTemplateId;
    name: string;
  };
  brief: string;
  seo: {
    title: string;
    description: string;
    socialImage?: string | null;
  };
  hero: {
    headline: string;
    subheadline: string;
    image?: string | null;
    cta: LandingPageCta;
    secondaryCta?: LandingPageCta;
    metadata?: Array<{ label: string; value: string }>;
  };
  content: {
    sections: LandingPageV2Section[];
  };
  design: {
    theme: LandingPageThemeId;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
  };
  assets: {
    heroImage?: string | null;
    sectionImage?: string | null;
  };
  publish: {
    status: "draft" | "published";
  };
  updatedAt?: string;
}

export type LandingPageDocument = LandingPageDocumentV1 | LandingPageDocumentV2;

export interface LandingPageTemplateDefinition {
  id: LandingPageTemplateId;
  name: string;
  shortName: string;
  description: string;
  audience: string;
  defaultCta: string;
}

export interface LandingPageRecipeDefinition {
  id: LandingPageRecipeId;
  template: LandingPageTemplateId;
  name: string;
  shortName: string;
  intent: LandingPageIntent;
  description: string;
  bestFor: string;
  defaultCta: string;
  theme: LandingPageThemeId;
  requiredFields: string[];
  sectionOrder: LandingPageV2Section["type"][];
  qualityChecks: string[];
  sourceNotes: string[];
}

export interface LandingPageCreationPurpose {
  id: LandingPageRecipeId;
  template: LandingPageTemplateId;
  label: string;
  description: string;
  examplePrompt: string;
  defaultSlugSuffix: string;
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

export const LANDING_PAGE_RECIPES: LandingPageRecipeDefinition[] = [
  {
    id: "event-invite",
    template: "event",
    name: "Event Invitation",
    shortName: "Event",
    intent: "event",
    description:
      "A warm invitation page for workshops, retreats, ceremonies, launches, and intimate gatherings.",
    bestFor: "Events with a date, setting, story, logistics, and a clear RSVP or booking action.",
    defaultCta: "Reserve Your Spot",
    theme: "editorial-event",
    requiredFields: ["event name", "audience", "date or timing", "location", "primary CTA"],
    sectionOrder: ["story", "details", "feature-list", "steps", "profile", "faq", "final-cta"],
    qualityChecks: [
      "The date, time, location, and CTA are visible without hunting.",
      "The invitation explains who should attend and why now.",
      "The final CTA repeats the exact action from the hero.",
    ],
    sourceNotes: [
      "Inspired by the local wedding screenshot's spacious invitation rhythm and the MIT template bundle's section density.",
      "No third-party template code or image assets are copied into the package.",
    ],
  },
  {
    id: "launch-waitlist",
    template: "waitlist",
    name: "Launch Waitlist",
    shortName: "Waitlist",
    intent: "waitlist",
    description:
      "A focused launch page that explains what is coming, who it helps, and why joining early matters.",
    bestFor: "Courses, products, communities, apps, newsletters, and pre-launch offers.",
    defaultCta: "Join the Waitlist",
    theme: "signal-waitlist",
    requiredFields: ["launch name", "audience", "promise", "why now", "email CTA"],
    sectionOrder: ["story", "feature-list", "steps", "signup", "profile", "faq", "final-cta"],
    qualityChecks: [
      "The promise is specific enough to remember after one read.",
      "The page gives early subscribers a clear reason to join now.",
      "The signup section appears before the page feels complete.",
    ],
    sourceNotes: [
      "Inspired by dark, high-contrast SaaS reference patterns in the local MIT template bundle and Giga style notes.",
      "No third-party template code or image assets are copied into the package.",
    ],
  },
];

export const LANDING_PAGE_CREATION_PURPOSES: LandingPageCreationPurpose[] = [
  {
    id: "event-invite",
    template: "event",
    label: "Event or workshop",
    description: "Invite people to a dated experience with details, agenda, and RSVP.",
    examplePrompt:
      "A Saturday breathwork workshop in Dublin for founders who want to reset before a product launch. Include timing, venue, who it is for, and why the room will be small.",
    defaultSlugSuffix: "event",
  },
  {
    id: "launch-waitlist",
    template: "waitlist",
    label: "Waitlist or launch",
    description: "Collect early interest for a product, course, community, or newsletter.",
    examplePrompt:
      "A waitlist for a private AI workflow studio for coaches. It helps them turn client notes into follow-up emails, resources, and booking prompts.",
    defaultSlugSuffix: "waitlist",
  },
];

const LANDING_PAGE_TEMPLATE_ID_SET = new Set<string>(LANDING_PAGE_TEMPLATE_IDS);
const LANDING_PAGE_RECIPE_ID_SET = new Set<string>(LANDING_PAGE_RECIPE_IDS);

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

export function isLandingPageRecipeId(
  value: unknown,
): value is LandingPageRecipeId {
  return typeof value === "string" && LANDING_PAGE_RECIPE_ID_SET.has(value);
}

export function normalizeLandingRecipe(
  value: unknown,
): LandingPageRecipeId | null {
  return isLandingPageRecipeId(value) ? value : null;
}

export function getLandingPageTemplate(
  templateId: LandingPageTemplateId,
): LandingPageTemplateDefinition {
  return (
    LANDING_PAGE_TEMPLATES.find((template) => template.id === templateId) ||
    LANDING_PAGE_TEMPLATES[1]
  );
}

export function getLandingPageRecipe(
  recipeId: LandingPageRecipeId,
): LandingPageRecipeDefinition {
  return (
    LANDING_PAGE_RECIPES.find((recipe) => recipe.id === recipeId) ||
    LANDING_PAGE_RECIPES[0]
  );
}

export function getLandingPageRecipesForTemplate(
  templateId: LandingPageTemplateId,
): LandingPageRecipeDefinition[] {
  return LANDING_PAGE_RECIPES.filter((recipe) => recipe.template === templateId);
}

export function getDefaultLandingPageRecipe(
  templateId: LandingPageTemplateId,
): LandingPageRecipeDefinition | null {
  return getLandingPageRecipesForTemplate(templateId)[0] || null;
}

export function normalizeLandingPageDocument(
  value: unknown,
): LandingPageDocument | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<LandingPageDocumentV1> | Partial<LandingPageDocumentV2>;

  if (raw.version === 2) {
    if (
      !raw.intent ||
      !raw.recipe ||
      !normalizeLandingTemplate(raw.recipe.template) ||
      !normalizeLandingRecipe(raw.recipe.id) ||
      typeof raw.brief !== "string" ||
      !raw.seo ||
      !raw.hero ||
      !raw.content ||
      !Array.isArray(raw.content.sections) ||
      !raw.design ||
      !raw.assets ||
      !raw.publish
    ) {
      return null;
    }
    return raw as LandingPageDocumentV2;
  }

  const page = value as Partial<LandingPageDocumentV1>;
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
  return page as LandingPageDocumentV1;
}

export function getLandingPageTemplateId(
  page: LandingPageDocument,
): LandingPageTemplateId {
  return page.version === 2 ? page.recipe.template : page.template;
}

export function getLandingPageBrief(page: LandingPageDocument): string {
  return page.brief;
}

export function getLandingPageTitle(page: LandingPageDocument): string {
  return page.version === 2 ? page.seo.title : page.title;
}

export function getLandingPageDescription(page: LandingPageDocument): string {
  return page.version === 2 ? page.seo.description : page.meta.description;
}

export function getLandingPageHero(
  page: LandingPageDocument,
): LandingPageDocumentV1["hero"] {
  return page.hero;
}

export function getLandingPageSections(
  page: LandingPageDocument,
): LandingPageSection[] {
  if (page.version === 1) return page.sections;
  return page.content.sections.flatMap((section): LandingPageSection[] => {
    if (section.type === "story") {
      return [{ type: "text", heading: section.heading, body: section.body }];
    }
    if (section.type === "feature-list") {
      return [
        {
          type: "list",
          heading: section.heading,
          items: section.items.map((item) => `${item.title}: ${item.body}`),
        },
      ];
    }
    if (section.type === "details") {
      return [
        {
          type: "list",
          heading: section.heading,
          items: section.items.map((item) =>
            [item.label, item.value, item.note].filter(Boolean).join(": "),
          ),
        },
      ];
    }
    if (section.type === "steps") {
      return [
        {
          type: "steps",
          heading: section.heading,
          items: section.items.map((item) => `${item.title}: ${item.body}`),
        },
      ];
    }
    if (section.type === "signup") {
      return [
        {
          type: "signup",
          heading: section.heading,
          body: section.body,
          buttonLabel: section.buttonLabel,
          placeholder: section.placeholder,
        },
      ];
    }
    if (section.type === "profile") {
      return [
        {
          type: "profile",
          heading: section.heading,
          body: section.body,
          profileName: section.profileName,
          profileRole: section.profileRole,
          profileImage: section.profileImage,
          profileLink: section.profileLink,
        },
      ];
    }
    if (section.type === "faq") {
      return [
        {
          type: "faq",
          heading: section.heading,
          items: section.items,
        },
      ];
    }
    return [{ type: "text", heading: section.heading, body: section.body }];
  });
}

export function getLandingPageSectionImage(
  page: LandingPageDocument | null,
): string | null {
  if (!page) return null;
  if (page.version === 2) return page.assets.sectionImage || null;
  const imageSection = page.sections.find(
    (section): section is Extract<LandingPageSection, { type: "image" }> =>
      section.type === "image",
  );
  return imageSection?.image || null;
}

export function buildLandingPageDocument(
  input: LandingPageBuildInput,
): LandingPageDocument {
  const recipe = getDefaultLandingPageRecipe(input.template);
  if (recipe) return buildLandingPageDocumentV2(input, recipe);

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

function buildLandingPageDocumentV2(
  input: LandingPageBuildInput,
  recipe: LandingPageRecipeDefinition,
): LandingPageDocumentV2 {
  const combined = [input.brief, input.feedback || ""].filter(Boolean).join("\n\n");
  const title = extractLandingTitle(combined, recipe.template);
  const description =
    firstSentence(combined) ||
    (recipe.intent === "event"
      ? "A thoughtful event invitation built with ME3 Core."
      : "A focused launch waitlist built with ME3 Core.");
  const ctaLabel = extractCta(input.feedback) || recipe.defaultCta;
  const items = deriveLandingItems(combined);
  const profileName = input.profile.name || input.username;
  const now = new Date().toISOString();

  if (recipe.id === "launch-waitlist") {
    return {
      version: 2,
      intent: {
        type: "waitlist",
        audience: "Early supporters",
        goal: "Collect qualified early interest before launch.",
        offerName: title,
      },
      recipe: {
        id: recipe.id,
        template: recipe.template,
        name: recipe.name,
      },
      brief: input.brief.trim(),
      seo: {
        title,
        description,
        socialImage: input.heroImage || null,
      },
      hero: {
        headline: title,
        subheadline: description,
        image: input.heroImage || null,
        cta: { label: ctaLabel, href: "#signup", style: "primary" },
        secondaryCta: { label: "See what is coming", href: "#inside", style: "secondary" },
        metadata: [
          { label: "Status", value: "Opening soon" },
          { label: "Best for", value: recipe.bestFor },
        ],
      },
      content: {
        sections: [
          {
            id: "inside",
            type: "story",
            heading: "The promise",
            body: description,
          },
          {
            id: "why-join",
            type: "feature-list",
            heading: "Why join early",
            body: "Give people a concrete reason to raise their hand before the public launch.",
            items: items.map((item, index) => ({
              title: waitlistFeatureTitle(index),
              body: item,
            })),
          },
          {
            id: "timeline",
            type: "steps",
            heading: "How the launch unfolds",
            items: [
              {
                title: "Join the private list",
                body: "Leave an email so the first invitation lands in the right place.",
              },
              {
                title: "Get the preview",
                body: "Receive the behind-the-scenes update, early offer, or founding-member details.",
              },
              {
                title: "Choose when it opens",
                body: "Decide whether the first release is right for you before it goes wider.",
              },
            ],
          },
          {
            id: "signup",
            type: "signup",
            heading: "Get the first invitation",
            body: "Join the waitlist and hear when the first spots open.",
            buttonLabel: ctaLabel,
            placeholder: "you@example.com",
          },
          {
            id: "maker",
            type: "profile",
            heading: "From the person building it",
            body:
              input.profile.bio ||
              `${profileName} is shaping this launch through ME3 Core.`,
            profileName,
            profileImage: input.profile.avatar,
            profileLink: input.profile.profileUrl,
          },
          {
            id: "questions",
            type: "faq",
            heading: "Good to know",
            items: [
              {
                question: "What happens after I join?",
                answer: "You will get the earliest update when the first release or invitation is ready.",
              },
              {
                question: "Is joining a commitment?",
                answer: "No. It only means you want first look access before the public launch.",
              },
            ],
          },
          {
            id: "final",
            type: "final-cta",
            heading: "Be first in line",
            body: "The clearest next step is small: leave your email and watch for the first invitation.",
            cta: { label: ctaLabel, href: "#signup", style: "primary" },
          },
        ],
      },
      design: {
        theme: recipe.theme,
        accentColor: "#49de80",
        backgroundColor: "#101312",
        textColor: "#f7fbf7",
      },
      assets: {
        heroImage: input.heroImage || null,
        sectionImage: input.sectionImage || null,
      },
      publish: { status: "draft" },
      updatedAt: now,
    };
  }

  return {
    version: 2,
    intent: {
      type: "event",
      audience: "Invited guests",
      goal: "Help the right people understand the event and RSVP.",
      offerName: title,
    },
    recipe: {
      id: recipe.id,
      template: recipe.template,
      name: recipe.name,
    },
    brief: input.brief.trim(),
    seo: {
      title,
      description,
      socialImage: input.heroImage || null,
    },
    hero: {
      headline: title,
      subheadline: description,
      image: input.heroImage || null,
      cta: { label: ctaLabel, href: "#details", style: "primary" },
      secondaryCta: { label: "Read the invitation", href: "#story", style: "secondary" },
      metadata: [
        { label: "Format", value: "In person or online" },
        { label: "Action", value: ctaLabel },
      ],
    },
    content: {
      sections: [
        {
          id: "story",
          type: "story",
          heading: "Why this gathering matters",
          body: description,
        },
        {
          id: "details",
          type: "details",
          heading: "Event details",
          items: [
            { label: "When", value: extractEventDetail(combined, "when") },
            { label: "Where", value: extractEventDetail(combined, "where") },
            { label: "For", value: "People this invitation was made for" },
          ],
        },
        {
          id: "highlights",
          type: "feature-list",
          heading: "What guests can expect",
          items: items.map((item, index) => ({
            title: eventFeatureTitle(index),
            body: item,
          })),
        },
        {
          id: "agenda",
          type: "steps",
          heading: "A simple rhythm",
          items: [
            { title: "Arrive", body: "Settle in and get oriented to the room." },
            { title: "Experience", body: "Move through the main session, workshop, or ceremony." },
            { title: "Leave with clarity", body: "Take the next step while the momentum is still fresh." },
          ],
        },
        {
          id: "host",
          type: "profile",
          heading: "Hosted by",
          body:
            input.profile.bio ||
            `${profileName} is hosting this event through ME3 Core.`,
          profileName,
          profileImage: input.profile.avatar,
          profileLink: input.profile.profileUrl,
        },
        {
          id: "questions",
          type: "faq",
          heading: "Before you RSVP",
          items: [
            {
              question: "Who is this for?",
              answer: "It is for the people named in the invitation and anyone who recognizes the promise in the page.",
            },
            {
              question: "What should I do next?",
              answer: `Use the ${ctaLabel} button and follow the details from the host.`,
            },
          ],
        },
        {
          id: "final",
          type: "final-cta",
          heading: "Save your place",
          body: "If this feels like the right room, take the next step now.",
          cta: { label: ctaLabel, href: "#details", style: "primary" },
        },
      ],
    },
    design: {
      theme: recipe.theme,
      accentColor: "#f2664a",
      backgroundColor: "#f8f1eb",
      textColor: "#233d35",
    },
    assets: {
      heroImage: input.heroImage || null,
      sectionImage: input.sectionImage || null,
    },
    publish: { status: "draft" },
    updatedAt: now,
  };
}

export function renderLandingPageHtml(
  page: LandingPageDocument,
  username: string,
): string {
  if (page.version === 2) return renderLandingPageHtmlV2(page, username);
  return renderLandingPageHtmlV1(page, username);
}

function renderLandingPageHtmlV1(
  page: LandingPageDocumentV1,
  username: string,
): string {
  const accent = page.style.accentColor || "#0f766e";
  const sections = page.sections
    .map((section) => renderLandingSection(section))
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.meta.description)}"><style>:root{--accent:${escapeHtml(accent)};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#151c19;background:#fbfcfb}body{margin:0}.shell{width:min(1080px,calc(100vw - 32px));margin:0 auto}.top{border-bottom:1px solid rgba(21,28,25,.12);padding:16px 0}.hero{padding:56px 0;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.8fr);gap:24px;align-items:center}.hero-copy,.media,.card{border:1px solid rgba(21,28,25,.12);border-radius:22px;background:#fff;padding:28px;box-shadow:0 18px 48px rgba(16,24,20,.06)}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:1;margin:0 0 18px}.eyebrow{color:var(--accent);font-weight:800;text-transform:uppercase;font-size:12px;letter-spacing:.12em}p,li{color:#52615b;line-height:1.65}.button,button{display:inline-flex;border:0;border-radius:999px;background:var(--accent);color:white;padding:12px 18px;text-decoration:none;font-weight:800}.section{padding:28px 0}.media{min-height:280px;display:grid;place-items:center;overflow:hidden}.media img{width:100%;height:100%;object-fit:cover}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}input{padding:12px 14px;border:1px solid rgba(21,28,25,.18);border-radius:12px}@media(max-width:760px){.hero{grid-template-columns:1fr}}</style></head><body><header class="top"><div class="shell"><strong>${escapeHtml(username)}</strong></div></header><main><section class="shell hero"><div class="hero-copy"><p class="eyebrow">${escapeHtml(page.hero.eyebrow || "")}</p><h1>${escapeHtml(page.hero.headline)}</h1><p>${escapeHtml(page.hero.subheadline)}</p><a class="button" href="${escapeHtml(page.hero.cta.href)}">${escapeHtml(page.hero.cta.label)}</a></div><div class="media">${page.hero.image ? `<img src="${escapeHtml(page.hero.image)}" alt="">` : `<span class="eyebrow">ME3 Core</span>`}</div></section>${sections}</main></body></html>`;
}

function renderLandingPageHtmlV2(
  page: LandingPageDocumentV2,
  username: string,
): string {
  const theme = getThemeTokens(page);
  const heroImage = page.hero.image || page.assets.sectionImage;
  const heroVisual = heroImage
    ? `<img src="${escapeHtml(heroImage)}" alt="" loading="eager" decoding="async">`
    : renderGeneratedVisual(page);
  const metadata = (page.hero.metadata || [])
    .map(
      (item) =>
        `<div class="meta-item"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`,
    )
    .join("");
  const sections = page.content.sections
    .map((section) => renderLandingSectionV2(section))
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.seo.title)}</title><meta name="description" content="${escapeHtml(page.seo.description)}"><style>${renderLandingPageCssV2(theme)}</style></head><body data-theme="${escapeHtml(page.design.theme)}"><header class="site-top"><a href="#main" class="skip-link">Skip to content</a><div class="shell site-top-inner"><strong>${escapeHtml(username)}</strong><a class="top-action" href="${escapeHtml(page.hero.cta.href)}">${escapeHtml(page.hero.cta.label)}</a></div></header><main id="main"><section class="hero"><div class="shell hero-grid"><div class="hero-copy">${metadata ? `<div class="meta-grid">${metadata}</div>` : ""}<h1>${escapeHtml(page.hero.headline)}</h1><p>${escapeHtml(page.hero.subheadline)}</p><div class="hero-actions"><a class="button primary" href="${escapeHtml(page.hero.cta.href)}">${escapeHtml(page.hero.cta.label)}</a>${page.hero.secondaryCta ? `<a class="button secondary" href="${escapeHtml(page.hero.secondaryCta.href)}">${escapeHtml(page.hero.secondaryCta.label)}</a>` : ""}</div></div><div class="hero-visual">${heroVisual}</div></div></section>${sections}</main></body></html>`;
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

function extractEventDetail(text: string, kind: "when" | "where"): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  const pattern =
    kind === "when"
      ? /\b(date|when|time|starts?|opens?)\b\s*:?\s*(.+)/i
      : /\b(where|venue|location|place|online)\b\s*:?\s*(.+)/i;
  const match = lines.map((line) => line.match(pattern)).find(Boolean);
  if (match?.[2]) return match[2].trim().slice(0, 96);
  return kind === "when" ? "Add the event date and time" : "Add the event location";
}

function eventFeatureTitle(index: number): string {
  return ["Reason to attend", "What is included", "What changes after"][index] || "Highlight";
}

function waitlistFeatureTitle(index: number): string {
  return ["Early access", "Built for you", "Launch advantage"][index] || "Benefit";
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

type LandingPageThemeTokens = {
  bg: string;
  bgMuted: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
  accentContrast: string;
  border: string;
};

function getThemeTokens(page: LandingPageDocumentV2): LandingPageThemeTokens {
  if (page.design.theme === "signal-waitlist") {
    return {
      bg: page.design.backgroundColor || "#101312",
      bgMuted: "#171c1a",
      surface: "#f7fbf7",
      text: page.design.textColor || "#f7fbf7",
      textMuted: "#b7c4bd",
      accent: page.design.accentColor || "#49de80",
      accentContrast: "#0e1512",
      border: "rgba(247,251,247,.18)",
    };
  }

  return {
    bg: page.design.backgroundColor || "#f8f1eb",
    bgMuted: "#e7f1df",
    surface: "#fffaf4",
    text: page.design.textColor || "#233d35",
    textMuted: "#66746c",
    accent: page.design.accentColor || "#f2664a",
    accentContrast: "#fffaf4",
    border: "rgba(35,61,53,.18)",
  };
}

function renderLandingPageCssV2(theme: LandingPageThemeTokens): string {
  return `:root{color-scheme:light;--bg:${theme.bg};--bg-muted:${theme.bgMuted};--surface:${theme.surface};--text:${theme.text};--text-muted:${theme.textMuted};--accent:${theme.accent};--accent-contrast:${theme.accentContrast};--border:${theme.border};font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text)}a{color:inherit}.skip-link{position:absolute;left:16px;top:-48px;background:var(--accent);color:var(--accent-contrast);padding:10px 14px;border-radius:999px;z-index:10}.skip-link:focus{top:16px}.shell{width:min(1120px,calc(100vw - 32px));margin:0 auto}.site-top{border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 86%,transparent);position:sticky;top:0;z-index:2;backdrop-filter:blur(18px)}.site-top-inner{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px}.site-top strong{font-size:15px}.top-action{display:inline-flex;align-items:center;min-height:38px;padding:0 14px;border:1px solid var(--border);border-radius:999px;text-decoration:none;font-weight:700}.hero{padding:56px 0 40px}.hero-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.86fr);gap:32px;align-items:center}.hero-copy h1{font-size:clamp(3rem,8vw,6.6rem);line-height:.96;margin:22px 0 18px;letter-spacing:0;max-width:10ch}.hero-copy p{font-size:clamp(1.05rem,2vw,1.32rem);line-height:1.55;color:var(--text-muted);max-width:680px}.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;max-width:560px}.meta-item{border-top:1px solid var(--border);padding-top:10px}.meta-item span{display:block;color:var(--text-muted);font-size:13px}.meta-item strong{display:block;margin-top:3px;font-size:15px}.hero-actions,.section-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:800;border:1px solid var(--border)}.button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-contrast)}.button.secondary{background:transparent;color:var(--text)}.hero-visual{min-height:420px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface);display:grid;place-items:center}.hero-visual img{width:100%;height:100%;object-fit:cover;display:block}.generated-visual{width:100%;height:100%;min-height:420px;display:grid;grid-template-rows:1fr auto;background:linear-gradient(180deg,var(--surface),var(--bg-muted))}.generated-visual-lines{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;padding:28px}.generated-visual-lines span{display:block;border-radius:999px;background:var(--accent);opacity:.22}.generated-visual-lines span:nth-child(2n){opacity:.4}.generated-visual-caption{padding:24px 28px;border-top:1px solid var(--border);font-size:clamp(1.2rem,3vw,2.2rem);line-height:1.08}.section{padding:42px 0}.section-band{background:var(--bg-muted);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}.section-grid{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1fr);gap:36px;align-items:start}.section h2{font-size:clamp(2rem,4vw,4rem);line-height:1;margin:0;letter-spacing:0}.section p,.section li{color:var(--text-muted);line-height:1.65}.section-body{font-size:1.16rem;margin:0}.feature-grid,.faq-grid,.details-grid,.steps-grid{display:grid;gap:14px}.feature-grid{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}.faq-grid,.details-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.feature-card,.faq-card,.detail-card,.step-card{border:1px solid var(--border);border-radius:8px;padding:18px;background:color-mix(in srgb,var(--surface) 70%,transparent)}.feature-card strong,.faq-card strong,.detail-card strong,.step-card strong{display:block;font-size:1.02rem}.detail-card span{display:block;color:var(--text-muted);font-size:13px;margin-bottom:6px}.step-card{display:grid;grid-template-columns:auto 1fr;gap:14px}.step-number{width:34px;height:34px;border-radius:999px;display:grid;place-items:center;background:var(--accent);color:var(--accent-contrast);font-weight:800}.signup-form{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.signup-form input{min-height:48px;min-width:min(100%,280px);flex:1;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:#111;padding:0 16px;font:inherit}.final-cta{text-align:center}.final-cta h2{margin-inline:auto;max-width:760px}.final-cta p{max-width:640px;margin:18px auto 0}@media(max-width:820px){.hero-grid,.section-grid{grid-template-columns:1fr}.hero-copy h1{max-width:11ch}.hero-visual{min-height:300px}.generated-visual{min-height:300px}.site-top{position:static}}`;
}

function renderGeneratedVisual(page: LandingPageDocumentV2): string {
  const words = page.recipe.id === "event-invite" ? "Save the date" : "First access";
  return `<div class="generated-visual" aria-hidden="true"><div class="generated-visual-lines">${Array.from({ length: 21 })
    .map((_, index) => `<span style="min-height:${48 + (index % 5) * 28}px"></span>`)
    .join("")}</div><div class="generated-visual-caption">${escapeHtml(words)}</div></div>`;
}

function renderLandingSectionV2(section: LandingPageV2Section): string {
  if (section.type === "story") {
    return `<section id="${escapeHtml(section.id)}" class="section"><div class="shell section-grid"><h2>${escapeHtml(section.heading)}</h2><p class="section-body">${escapeHtml(section.body)}</p></div></section>`;
  }
  if (section.type === "feature-list") {
    return `<section id="${escapeHtml(section.id)}" class="section section-band"><div class="shell"><div class="section-grid"><div><h2>${escapeHtml(section.heading)}</h2>${section.body ? `<p>${escapeHtml(section.body)}</p>` : ""}</div><div class="feature-grid">${section.items.map((item) => `<article class="feature-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></article>`).join("")}</div></div></div></section>`;
  }
  if (section.type === "details") {
    return `<section id="${escapeHtml(section.id)}" class="section"><div class="shell"><div class="section-grid"><h2>${escapeHtml(section.heading)}</h2><div class="details-grid">${section.items.map((item) => `<article class="detail-card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}</article>`).join("")}</div></div></div></section>`;
  }
  if (section.type === "steps") {
    return `<section id="${escapeHtml(section.id)}" class="section"><div class="shell"><div class="section-grid"><h2>${escapeHtml(section.heading)}</h2><div class="steps-grid">${section.items.map((item, index) => `<article class="step-card"><span class="step-number">${index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div></article>`).join("")}</div></div></div></section>`;
  }
  if (section.type === "signup") {
    return `<section id="${escapeHtml(section.id)}" class="section section-band"><div class="shell section-grid"><div><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></div><form class="signup-form"><input type="email" placeholder="${escapeHtml(section.placeholder || "you@example.com")}"><button class="button primary" type="button">${escapeHtml(section.buttonLabel)}</button></form></div></section>`;
  }
  if (section.type === "profile") {
    return `<section id="${escapeHtml(section.id)}" class="section"><div class="shell section-grid"><h2>${escapeHtml(section.heading)}</h2><div><p class="section-body">${escapeHtml(section.body)}</p>${section.profileLink ? `<div class="section-actions"><a class="button secondary" href="${escapeHtml(section.profileLink)}">Visit profile</a></div>` : ""}</div></div></section>`;
  }
  if (section.type === "faq") {
    return `<section id="${escapeHtml(section.id)}" class="section"><div class="shell"><div class="section-grid"><h2>${escapeHtml(section.heading)}</h2><div class="faq-grid">${section.items.map((item) => `<article class="faq-card"><strong>${escapeHtml(item.question)}</strong><p>${escapeHtml(item.answer)}</p></article>`).join("")}</div></div></div></section>`;
  }
  return `<section id="${escapeHtml(section.id)}" class="section final-cta section-band"><div class="shell"><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p><div class="section-actions" style="justify-content:center"><a class="button primary" href="${escapeHtml(section.cta.href)}">${escapeHtml(section.cta.label)}</a></div></div></section>`;
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
