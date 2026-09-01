import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  buildLandingPageDocument,
  createBusinessSiteDocument,
  type LandingPageDocumentV3,
  type LandingPageV3Section,
} from "../packages/landing-pages/src/index";
import {
  publishBusinessSite,
  saveBusinessSiteDraft,
} from "../apps/worker/src/business-sites";
import { getSiteFile, putSiteFile } from "../apps/worker/src/sites";
import type { DbSite, Env } from "../apps/worker/src/types";

const DEMO_SITE_ID = "demo-tru-health-business-site";
const DEMO_USERNAME = "tru-health-demo";
const PUBLIC_ORIGIN = `http://localhost:8787/site/${DEMO_USERNAME}`;
const DEMO_ASSET_SOURCES = {
  hero: {
    path: "files/migrations/truhealth/hero.jpg",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/84887c91-86ca-428d-b4f9-b3041f6bf777/hans-quVdX0q5tKQ-unsplash.jpg?format=1500w",
  },
  logo: {
    path: "files/migrations/truhealth/logo.png",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/eaa23e78-b84a-44b0-a050-7968b2e972c0/TruHealth_Logo_Bone.png?format=500w",
  },
  sally: {
    path: "files/migrations/truhealth/sally.jpg",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/59551fff-cc2a-4457-8c6c-dbf7e336ef16/Sally+grade.jpg?format=750w",
  },
  neel: {
    path: "files/migrations/truhealth/neel.jpg",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/7bfa1b85-6bcb-4be1-ace8-7b963d24d143/Neele+grade+2.jpg?format=750w",
  },
  edelle: {
    path: "files/migrations/truhealth/edelle.jpg",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/71ceeb16-b9c8-41b6-9a9e-2a8e706566e7/COM1712_0172+%282018_02_10+13_40_54+UTC%29.jpg?format=750w",
  },
  claire: {
    path: "files/migrations/truhealth/claire.jpg",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/e47c530d-ac64-4cf8-8f4e-ead8a16e3c7f/Claire+NEW.jpg?format=750w",
  },
  will: {
    path: "files/migrations/truhealth/will.jpg",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/fa752459-055b-4ad3-9ba0-d5d0d8aef8b0/Will+Grade.jpg?format=750w",
  },
  nature: {
    path: "files/migrations/truhealth/nature.png",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/31f228c7-6667-4b16-ba32-73ffb57ce5a3/neha-maheen-mahfin-nZWwTZe9Ekc-unsplash+1.png?format=1000w",
  },
  gmc: {
    path: "files/migrations/truhealth/gmc.png",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/e127a344-45f1-4fb6-8b97-7e0808ae4b05/logo-footer-GMC_gray.png?format=300w",
  },
  functionalMedicine: {
    path: "files/migrations/truhealth/functional-medicine.png",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/f80e3475-c12f-447f-b518-8b7562869c7d/functional-medicine_gray.png?format=300w",
  },
  ntoi: {
    path: "files/migrations/truhealth/ntoi.png",
    url: "https://images.squarespace-cdn.com/content/v1/67324df236e5010e593024b6/f5ed27ce-4812-44c8-b5c8-267021afdfd6/ntoi_logo_gray.png?format=300w",
  },
} as const;
const databasePath = findLocalCoreDatabase();
const database = new DatabaseSync(databasePath);
const db = createSqliteD1(database);
const env = { DB: db as unknown as D1Database } as Env;

const profile = database
  .prepare(
    `SELECT id, user_id, username, published_at
     FROM sites
     WHERE site_role = 'profile'
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
  )
  .get() as
  | { id: string; user_id: string; username: string; published_at: string | null }
  | undefined;

if (!profile) {
  throw new Error("Create a local ME3 Profile before seeding the Business Site demo.");
}

database
  .prepare(
    `INSERT INTO sites
       (id, user_id, username, site_type, site_role, template_id, profile_site_id,
        created_at, updated_at)
     VALUES (?, ?, ?, 'profile', 'organization', 'business-site', ?, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       username = excluded.username,
       site_role = 'organization',
       template_id = 'business-site',
       profile_site_id = excluded.profile_site_id,
       updated_at = datetime('now')`,
  )
  .run(DEMO_SITE_ID, profile.user_id, DEMO_USERNAME, profile.id);

const site = database
  .prepare(
    `SELECT id, user_id, username, site_type, site_role, template_id, profile_site_id,
            custom_domain, custom_domain_status, custom_domain_cf_id,
            created_at, updated_at, published_at
     FROM sites WHERE id = ?`,
  )
  .get(DEMO_SITE_ID) as unknown as DbSite;

const assets = await importDemoAssets(env, site);

const actionHrefs = new Map<string, string>();
const pages = [
  page("home", "Tru Health", "Restoring the conditions for true health to flourish.", "We’re a team of doctors and practitioners specialised in gut health, autoimmune conditions and fatigue.", [
    { id: "home-story", type: "story", heading: "Founded by Dr. Sally Bramley, for those who have tried everything.", body: "A specialist online health clinic combining nutritional therapy with somatic and nervous-system support. Final production wording, claims, and service details remain subject to client review." },
    { id: "home-team", type: "team", heading: "Meet the team", body: "A multidisciplinary team supporting the whole person.", items: [
      { name: "Dr. Sally Bramley", role: "Founder", bio: "Doctor of Integrative Medicine and certified Functional Medicine practitioner.", image: assets.sally },
      { name: "Dr. Neel Reddy", role: "Longevity Medicine", bio: "A doctor focused on practical, sustainable long-term health.", image: assets.neel },
      { name: "Edelle O’Doherty", role: "Nutritional Therapy", bio: "Trauma-informed Nutritional Therapist.", image: assets.edelle },
      { name: "Claire O’Brien", role: "Nutritional Therapy", bio: "Trauma-informed Nutritional Therapist.", image: assets.claire },
      { name: "Will Shipp", role: "Somatic Health Coach", bio: "Somatic support connecting nervous-system health with daily wellbeing.", image: assets.will },
    ] },
    { id: "home-approach", type: "image-text", heading: "Care that connects the whole picture", body: "Explore an approach that brings together medical context, nutrition, lifestyle, and nervous-system support.", image: assets.nature, imageAlt: "A quiet natural landscape", imagePosition: "right" },
    { id: "home-benefits", type: "steps", heading: "A clear path into care", items: [
      { title: "Book a discovery call", body: "Begin with a general conversation about fit and the right next step." },
      { title: "Meet your practitioner", body: "Connect with the practitioner best suited to the agreed care pathway." },
      { title: "Build lasting foundations", body: "Work on the conditions that support sustainable health over time." },
    ] },
    { id: "home-trust", type: "logo-row", heading: "Professional credentials", items: [
      { name: "General Medical Council", image: assets.gmc },
      { name: "The Institute for Functional Medicine", image: assets.functionalMedicine },
      { name: "Nutritional Therapists of Ireland", image: assets.ntoi },
    ] },
    action("home-action", "Begin with a conversation", "The discovery call is a general enquiry handoff. Do not include private clinical information.", "/discovery-call/"),
  ]),
  page("how-it-works", "How it works", "A calm, understandable care journey", "This demo page uses reusable process, trust, and FAQ blocks. The exact clinical process must be reviewed and approved by Tru Health.", [
    { id: "how-steps", type: "steps", heading: "A simple journey", items: [
      { title: "Start with context", body: "Use a general discovery conversation to understand fit and the appropriate next step." },
      { title: "Agree the pathway", body: "Present only the process, boundaries, and services the client has approved." },
      { title: "Continue in the right system", body: "Keep sensitive questionnaires, records, and practitioner messages in an explicitly approved clinical system." },
    ] },
    { id: "how-faq", type: "faq", heading: "Questions before you begin", items: [
      { question: "Is this page giving medical advice?", answer: "No. This local demo shows the website structure and requires client-approved clinical and legal copy before production use." },
      { question: "Where would private health information go?", answer: "Not into ordinary website forms. Sensitive workflows remain in an approved clinical system." },
    ] },
    action("how-action", "Talk through the next step", "Use the discovery call to decide whether the service is an appropriate fit.", "/discovery-call/"),
  ]),
  page("start-your-care", "Start your care", "Choose the right starting point", "A demonstration of bounded pricing and membership blocks. Names, inclusions, eligibility, and pricing shown here are placeholders for client review.", [
    { id: "care-pricing", type: "pricing", heading: "Ways to begin", body: "The page references offers; commercial records and payment state belong to the connected commerce system.", items: [
      { name: "Discovery conversation", price: "Confirm with client", description: "A general conversation about fit and next steps.", features: ["Clear scope", "No sensitive form data", "Approved booking handoff"] },
      { name: "Care membership", price: "Confirm with client", description: "A placeholder for the approved membership proposition.", features: ["Client-approved inclusions", "Transparent boundaries", "Connected payment journey"] },
    ] },
    { id: "care-legal", type: "legal", heading: "Before choosing a service", body: "Demo only. Eligibility, clinical suitability, cancellation terms, and medical disclaimers must be supplied or approved by Tru Health before launch." },
    action("care-action", "Book a discovery call", "Take a low-friction first step without sharing private health details on this public page.", "/discovery-call/"),
  ]),
  page("testing-and-services", "Testing and services", "Explore services without duplicating the catalogue", "A collection-driven page for approved services and clinical testing categories. Product, inventory, checkout, and clinical rules remain in their owning systems.", [
    { id: "services-collection", type: "collection", heading: "Browse by need", body: "The final categories, descriptions, availability, and claims require a content and clinical review.", items: [
      { title: "Clinical consultations", body: "A reusable service reference with a clear information or booking handoff.", label: "Service reference", href: "/discovery-call/" },
      { title: "Functional testing", body: "A collection reference suitable for filters and connected commerce later.", label: "Catalogue reference", href: "/discovery-call/" },
      { title: "Workplace wellbeing", body: "A business service card that can link to a dedicated page or enquiry.", label: "Programme reference", href: "/discovery-call/" },
    ] },
    { id: "services-legal", type: "legal", heading: "Testing information", body: "Demo only. Tests are not a substitute for emergency or routine medical care. Final wording, suitability guidance, and disclaimers require client approval." },
    action("services-action", "Ask about the right route", "Use a general enquiry rather than submitting clinical details through the public site.", "/discovery-call/"),
  ]),
  page("insights", "Insights", "Useful thinking, clearly organised", "A structured article collection that can later reference canonical ME3 posts without duplicating the publishing record.", [
    { id: "insights-list", type: "collection", heading: "Featured insights", body: "Placeholder cards demonstrate the article-list treatment. Titles and summaries are not medical claims or production content.", items: [
      { title: "How to prepare for a useful health conversation", body: "A placeholder editorial summary for content review.", label: "Guide", href: "/" },
      { title: "Questions to ask before choosing a test", body: "A placeholder editorial summary for content review.", label: "Explainer", href: "/" },
      { title: "Building sustainable everyday routines", body: "A placeholder editorial summary for content review.", label: "Journal", href: "/" },
    ] },
    action("insights-action", "Receive approved updates", "The production newsletter flow will preserve consent evidence and unsubscribe handling.", "mailto:hello@example.com"),
  ]),
  page("discovery-call", "Discovery call", "Start with a simple conversation", "This is a safe demo handoff for a general enquiry. It intentionally does not collect symptoms, records, or other sensitive health information.", [
    { id: "call-details", type: "details", heading: "What to expect", items: [
      { label: "Purpose", value: "Discuss fit", note: "Not a clinical consultation." },
      { label: "Format", value: "Confirm with client", note: "Connect the approved booking provider." },
      { label: "Privacy", value: "General details only", note: "Do not submit private clinical information." },
    ] },
    action("call-action", "Use the demo contact link", "Replace this placeholder with the client-approved booking journey.", "mailto:hello@example.com"),
  ]),
  page("medical-disclaimer", "Medical disclaimer", "Important information", "A dedicated legal page demonstrates how required health and trust language can remain visible and editable.", [
    { id: "disclaimer", type: "legal", heading: "Demonstration content only", body: "This local demo does not provide medical advice, diagnosis, treatment, or emergency support. All production credentials, claims, consent language, privacy terms, and disclaimers require review and approval by Tru Health and its professional advisers." },
  ]),
];

const homepage = pages.find((item) => item.slug === "home");
if (!homepage) throw new Error("Expected a demo homepage");
homepage.document.hero.image = assets.hero;
homepage.document.hero.imageLayout = "background";
homepage.document.hero.showActions = false;
homepage.document.hero.metadata = [];
homepage.document.intent.audience = "Accessible, specialist health care";
homepage.document.assets.heroImage = assets.hero;
homepage.document.seo.socialImage = assets.hero;

for (const item of pages) {
  database
    .prepare(
      `INSERT INTO site_pages
         (id, site_id, slug, kind, title, template_id, draft_json, created_at, updated_at)
       VALUES (?, ?, ?, 'landing_page', ?, 'service', ?, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         slug = excluded.slug,
         title = excluded.title,
         template_id = excluded.template_id,
         draft_json = excluded.draft_json,
         updated_at = datetime('now')`,
    )
    .run(item.id, DEMO_SITE_ID, item.slug, item.document.seo.title, JSON.stringify(item.document));
}

const businessSite = createBusinessSiteDocument("Tru Health", {
  homepageSlug: "home",
  description: "A local ME3 Business Sites demo informed by the public Tru Health migration brief.",
  designPackId: "clinical-editorial-01",
});
businessSite.navigation.items = pages
  .filter((item) => item.slug !== "medical-disclaimer")
  .map((item) => ({ id: `nav-${item.slug}`, label: item.navigationLabel, pageSlug: item.slug, visible: true }));
businessSite.footer.note = "Local product demonstration. Content and claims require client approval before production use.";
businessSite.footer.links = [
  { id: "footer-disclaimer", label: "Medical disclaimer", href: "/medical-disclaimer/" },
  { id: "footer-privacy", label: "Privacy placeholder", href: "/medical-disclaimer/" },
];
businessSite.seo.titleSuffix = "Tru Health — ME3 Demo";
businessSite.seo.socialImage = assets.hero;
businessSite.organization = {
  description: "Local product demonstration for an expert-led health practice. Not production content.",
  logo: assets.logo,
  email: "hello@example.com",
  address: "Location to be confirmed with client",
};
businessSite.redirects = [
  { id: "redirect-membership", from: "/membership", to: "/start-your-care/" },
  { id: "redirect-faq", from: "/faq", to: "/how-it-works/" },
];
businessSite.connectedResources.collectionIds = ["soulink:featured-experiences-demo"];
businessSite.design.customization = {
  accentColor: "#a85f43",
  backgroundColor: "#f4f1ea",
  textColor: "#18342f",
};

await saveBusinessSiteDraft(env, site, businessSite);
const revision = await publishBusinessSite(env, site, PUBLIC_ORIGIN);
database.close();

process.stdout.write(
  `Seeded and published @${DEMO_USERNAME} for @${profile.username} (${revision.pages.length} pages).\n${PUBLIC_ORIGIN}/\n`,
);

function page(
  slug: string,
  title: string,
  headline: string,
  subheadline: string,
  sections: LandingPageV3Section[],
) {
  const document = buildLandingPageDocument({
    username: DEMO_USERNAME,
    brief: `${headline}. ${subheadline}`,
    template: "service",
    designPackId: "clinical-editorial-01",
    profile: { name: "Tru Health demo", bio: null, avatar: null, profileUrl: "/me" },
  });
  if (document.version !== 3) throw new Error("Expected a v3 page document");
  document.seo.title = title;
  document.seo.description = subheadline;
  document.hero.headline = headline;
  document.hero.subheadline = subheadline;
  document.hero.imageLayout = "split";
  document.hero.showActions = true;
  document.hero.metadata = [{ label: "Status", value: "Local demo" }];
  document.content.sections = sections;
  const actionSection = sections.find((section) => section.type === "action");
  const action = document.actions.find((candidate) => candidate.id === document.hero.primaryActionId);
  if (action) {
    action.kind = "link";
    action.label = actionSection?.type === "action" ? actionSection.heading : "Back to the site";
    action.href = actionSection?.type === "action" ? actionSection.body.startsWith("mailto:") ? actionSection.body : "/" : "/";
    delete action.resourceId;
  }
  const intendedHref = actionHrefs.get(actionSection?.id || "");
  if (action && intendedHref) action.href = intendedHref;
  return {
    id: `demo-tru-health-${slug}`,
    slug,
    navigationLabel: slug === "home" ? "Home" : title,
    document: document as LandingPageDocumentV3,
  };
}

function action(id: string, heading: string, body: string, href: string): LandingPageV3Section {
  actionHrefs.set(id, href);
  return { id, type: "action", heading, body, actionId: "primary-action" };
}

async function importDemoAssets(
  targetEnv: Env,
  targetSite: DbSite,
): Promise<Record<keyof typeof DEMO_ASSET_SOURCES, string>> {
  const entries = Object.entries(DEMO_ASSET_SOURCES) as Array<
    [keyof typeof DEMO_ASSET_SOURCES, (typeof DEMO_ASSET_SOURCES)[keyof typeof DEMO_ASSET_SOURCES]]
  >;
  const downloads = await Promise.all(
    entries.map(async ([key, asset]) => {
      const existing = await getSiteFile(
        targetEnv,
        targetSite.id,
        `public/${asset.path}`,
      );
      if (existing) {
        return {
          key,
          path: asset.path,
          content: null,
          contentType: existing.content_type,
        };
      }
      const response = await fetch(asset.url, {
        headers: { "User-Agent": "ME3 local Business Site migration demo" },
      });
      if (!response.ok) {
        throw new Error(`Could not import ${key} (${response.status}).`);
      }
      const content = await response.arrayBuffer();
      if (content.byteLength > 1_900_000) {
        throw new Error(`Imported ${key} is too large for local Core storage.`);
      }
      const fallbackType = asset.path.endsWith(".png") ? "image/png" : "image/jpeg";
      return {
        key,
        path: asset.path,
        content,
        contentType: response.headers.get("content-type")?.split(";")[0] || fallbackType,
      };
    }),
  );
  for (const asset of downloads) {
    if (!asset.content) continue;
    await putSiteFile(
      targetEnv,
      targetSite.id,
      `public/${asset.path}`,
      asset.content,
      asset.contentType,
    );
  }
  return Object.fromEntries(
    downloads.map((asset) => [asset.key, asset.path]),
  ) as Record<keyof typeof DEMO_ASSET_SOURCES, string>;
}

function findLocalCoreDatabase(): string {
  const directory = join(
    process.cwd(),
    "apps/worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );
  const candidates = readdirSync(directory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(directory, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const candidate of candidates) {
    const db = new DatabaseSync(candidate, { readOnly: true });
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sites'")
        .get();
      if (row) return candidate;
    } finally {
      db.close();
    }
  }
  throw new Error("Could not find the local ME3 Core D1 database.");
}

function createSqliteD1(database: DatabaseSync) {
  return {
  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      database.exec("COMMIT");
      return results;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  },
  prepare(sql: string) {
    const statement = database.prepare(sql);
    let values: unknown[] = [];
    const sqliteValues = () => values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    ) as any[];
    const wrapper = {
      bind: (...next: unknown[]) => {
        values = next;
        return wrapper;
      },
      run: async () => {
        const result = statement.run(...sqliteValues());
        return { meta: { changes: Number(result.changes) } };
      },
      first: async <T>() => (statement.get(...sqliteValues()) || null) as T | null,
      all: async <T>() => ({ results: statement.all(...sqliteValues()) as T[] }),
    };
    return wrapper;
  },
  };
}
