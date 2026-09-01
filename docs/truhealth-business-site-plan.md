# ME3 Business Sites: Tru Health pilot

Status: working product and migration plan  
Last reviewed: 2026-08-31  
Pilot client: [Tru Health](https://www.truhealth.co/)

This is a living direction document, not a fixed implementation schedule. It should be updated as the client, product boundaries, and first working slices become clearer. Execution tasks, acceptance criteria, and delivery history should move into beads when work begins.

## Purpose

Use the agreed Tru Health redesign and migration as the first serious test of ME3 Business Sites.

The pilot should demonstrate that a managed ME3 installation can:

- host a polished, fast, multi-page business website at the client's domain;
- let the owner update that website directly or with the ME3 assistant;
- connect public website activity to ME3 contacts, email, tasks, files, and business operations;
- present Soulink-owned community, courses, lessons, meetings, and events without duplicating those systems in ME3;
- publish a structured `me.json` identity that makes the business usable across the ME3 and Soulink network;
- preserve a clear path from service-business websites to agent-ready sites and shops that can eventually replace platforms such as Squarespace, WordPress, Wix, and Shopify.

The near-term goal is not generic platform parity. It is a convincing, client-approved Tru Health website and demo that proves the product model.

## Product model

ME3 should distinguish between two kinds of public presence.

### ME3 Profile

A structured digital business card and simple site for a person or business.

It is appropriate for:

- an individual creator;
- a coach or consultant without a separate business brand;
- a service professional;
- a small one-person business;
- anyone who primarily needs identity, services, contact details, booking, and network discovery.

Each profile is a structured public identity with its own handle and `me.json`. It can be used across ME3 and Soulink and remains deliberately opinionated so people and agents can understand it reliably. The first profile becomes the installation's primary owner profile automatically. It is the default public identity for new sites and installation-level discovery, not a separate login or account owner.

### Business Site

A flexible, branded website for an organisation or established business.

It is appropriate when the owner needs:

- a separate business brand;
- multiple pages and navigation;
- richer marketing layouts and editorial content;
- a blog, catalogue, products, or other business-specific content;
- integrations with ME3 and Soulink;
- more control over presentation than the structured profile should allow.

A Business Site belongs to the ME3 Profile it represents, but it does not automatically inherit that profile's branding, images, or design. The relationship supplies identity, ownership, and network context; presentation remains independently editable. Reuse may be offered deliberately.

The working model is one or more ME3 Profiles and zero or more Business Sites per installation, within plan limits. A user might have a personal profile, a professional profile, and a business profile. A small operator may stop at one profile. A branded organisation such as Tru Health can have a dedicated business profile plus a full Business Site attached to it.

Multiple profiles require a clear identity model:

- one profile is primary for installation-level defaults;
- every profile has its own stable handle and public `me.json`;
- every Business Site belongs to one owning profile;
- a new Business Site defaults to the primary owner profile;
- when additional profiles exist, the owner may choose a different owning profile during creation or reassign it later explicitly;
- a Business Site's custom domain should expose its owning profile's public identity;
- deleting or unpublishing a profile must not leave attached sites or Soulink relationships ambiguous;
- Soulink must know which profile is active when a person acts personally or on behalf of a business.

This is an intentional evolution from the current single-profile implementation and needs coordinated ME3, ME3 Cloud, protocol, and Soulink decisions before it is treated as complete.

## `/sites` creation choice

The top-level choice should answer **what the user is creating**, not **whether they want to use an agent or a wizard**.

Suggested target copy:

### Create a site

Choose what you want to create. You can manage and publish both from ME3.

**ME3 Profile**  
A simple site and digital business card for you or your business. It creates a structured identity you can use across ME3 and Soulink.

**Business Site**  
Build a flexible, branded website with ME3. Best for organisations and established businesses that need custom pages, styling, and room to grow.

Recommended behaviour:

- The plus button is always visible in the `/sites` header.
- The two option cards appear side by side in one row on wider screens and stack cleanly on compact/mobile screens.
- ME3 Profile remains enabled while the profile quota has capacity and starts a new structured profile flow.
- Business Site is disabled until at least one ME3 Profile exists.
- The disabled Business Site card remains visible and explains: **Create a ME3 Profile first.**
- New Business Sites default to the primary owner profile. If additional profiles exist, an owner-profile selector may be changed without blocking creation.
- Reaching a plan limit disables the affected card with the limit and next available action visible; it does not remove the plus button.
- Business Site starts the assistant-guided business-site flow.
- Agent and direct editing are not separate site types. Both edit the same Business Site document and published result.
- The existing manual wizard remains the focused editor for the ME3 Profile; it is not the main editor for a Business Site.

The copy should not promise shops, courses, or other capabilities before they are usable. It can expand as those capabilities ship.

### Current implementation delta

ME3 currently enforces one profile per owner, selects one default profile for `/me` and fallback `me.json`, and allows an organisation site to be created without a profile at the API level. Supporting this product model therefore requires more than a modal-only change:

- replace the single-profile database and quota rule with configurable profile capacity;
- add an explicit primary-profile designation;
- associate each Business Site with a profile;
- require that association when creating a Business Site;
- route profile-specific public pages and `me.json` deterministically;
- extend network directory and Soulink identity claims to address a specific profile;
- define safe reassignment, deletion, export, and restore behaviour.

The modal layout and disabled state can be designed immediately, but the create actions should not imply multi-profile support until these foundations are implemented.

## Tru Health today

The current Squarespace site is a polished, editorial healthcare website with a small commerce layer and several connected business journeys.

Important current surfaces include:

- [homepage](https://www.truhealth.co/) and primary brand story;
- [how the care model works](https://www.truhealth.co/how-it-works);
- [membership and pricing](https://www.truhealth.co/membership);
- practitioner/team information and credentials;
- [discovery-call booking](https://www.truhealth.co/discovery-call);
- [complementary services and a filtered clinical-testing catalogue](https://www.truhealth.co/functional-medicine-tests);
- testimonials and trust/accreditation marks;
- [FAQs](https://www.truhealth.co/faq);
- [blog and article pages](https://www.truhealth.co/blog);
- newsletter capture;
- legal pages and medical disclaimers;
- employers, retreats, masterclasses, and other campaign or programme pages;
- references to member community, workshops, courses, and resources.

The existing site also contains older or overlapping pages. The migration should be an opportunity to decide what remains canonical, what is consolidated, and what is redirected or archived.

### What is worth preserving

The redesign should preserve the strongest parts of the current visual identity:

- calm, clinical, natural tone;
- editorial serif typography paired with restrained monospaced labels;
- deep green/ink text, warm neutral backgrounds, and muted sage accents;
- natural landscape and human imagery;
- generous space and confident headlines;
- visible clinical credentials, testimonials, and trust marks;
- a clear repeated path to the discovery call.

The existing experience should not be cloned section for section. It can be simplified by reducing repeated copy and calls to action, clarifying the page hierarchy, improving mobile rhythm, and making the next step more obvious.

## Initial target experience

The first site map is intentionally provisional. It should be confirmed through a content and URL audit with Tru Health.

### Primary navigation

1. Home
2. How it works
3. Start your care
4. Testing and services
5. Insights
6. Book a discovery call

### Supporting destinations

- Team and clinical approach, either as a page or strong sections within the main journey
- FAQs
- Employers
- Retreats, masterclasses, and campaign landing pages
- Contact
- Privacy, terms, cookies, and medical disclaimer
- Cart/account only when the retained or replacement commerce path requires them

### Community and learning

Community, courses, lessons, meetings, and events should be owned by Soulink.

The Tru Health site may display selected Soulink experiences as native-looking cards or sections, but the underlying records and participation flows remain in Soulink. Examples include:

- member community access;
- weekly workshops or live meetings;
- structured courses and lessons;
- retreats and events;
- calls to join, enrol, attend, or continue learning.

ME3 should store only the reference and presentation choices needed by the website. It should not create a second course, community, or event database.

## Tru Health design pack

A new versioned design pack should be developed in parallel with the Tru Health site.

The pack should be inspired by the current site's strongest qualities without being permanently tied to Tru Health content or assets. A working description is **Clinical Editorial**:

- expressive but readable serif display typography;
- simple sans-serif body typography and optional mono utility labels;
- warm bone or paper backgrounds;
- dark botanical ink text;
- muted sage primary actions;
- natural, lightly textured imagery;
- restrained motion;
- strong testimonial, practitioner, pricing, and trust-mark treatments;
- accessible form controls and obvious primary actions;
- excellent compact/mobile layouts.

Adamina and IBM Plex Mono, or suitably licensed equivalents, are reasonable starting references. The final pack must retain good performance, accessibility, and contrast rather than reproducing every current style choice.

Design-pack responsibilities:

- provide strong defaults and section compositions;
- expose global typography, colour, spacing, button, image, and surface choices;
- allow section-level variants without arbitrary CSS;
- remain versioned so published sites do not change unexpectedly;
- support owner customisation without forking the renderer;
- remain usable by other health, wellbeing, clinic, and professional-service sites.

## Evolving the current builder

The current landing-page builder should be reused as the foundation. It already provides useful primitives:

- structured page documents;
- stable page IDs;
- versioned design packs;
- agent tools;
- drafts and published revisions;
- rendered HTML snapshots;
- image storage;
- preview, publish, unpublish, and rollback-friendly boundaries;
- organisation sites distinct from the ME3 Profile.

The change is to evolve from fixed event/service/waitlist pages into flexible Business Sites.

### Site-level structure

A Business Site needs structured records for:

- pages and URL paths;
- navigation;
- global footer;
- brand/design settings;
- default SEO and social sharing;
- reusable business information;
- redirects;
- connected ME3 and Soulink resources;
- draft and published site revisions.

### Page building blocks

The initial block library should be driven by the Tru Health build but remain broadly reusable. Likely blocks include:

- hero;
- rich editorial text;
- image and text split;
- feature or benefit list;
- process/steps;
- practitioner or team grid;
- testimonial;
- pricing or membership offer;
- trust/accreditation logo row;
- FAQ;
- article list;
- product or service collection;
- form or newsletter signup;
- call to action;
- gallery/video;
- Soulink collection or featured experience;
- legal/disclaimer content.

Blocks should have stable IDs, explicit data, accessible markup, responsive rules, and a bounded set of visual variants.

### Editing experience

The client should be able to:

- see the site map and navigation;
- open a page and click a section to edit it;
- add, remove, duplicate, and reorder sections;
- choose section variants;
- manage uploaded images and alt text;
- change global colours and typography;
- edit metadata and URL paths;
- preview desktop and mobile views;
- review previous published versions;
- publish intentionally.

The assistant should operate on the same model. Requests such as “shorten this section”, “move the testimonials above pricing”, “add Claire to the team”, or “create a retreat page in the same style” should create reviewable structured changes rather than replacement HTML.

Direct editing is the precision tool. The assistant is the acceleration and coordination layer.

## Import and migration workflow

The Tru Health pilot can establish the future “Import an existing site” workflow.

1. Crawl the agreed public URLs and create a page/content inventory.
2. Collect or import approved logos, images, video, documents, and downloadable assets.
3. Identify current forms, booking systems, commerce, analytics, email capture, and other external services.
4. Map each existing page to keep, combine, rewrite, archive, or redirect.
5. Convert approved content into structured ME3 pages and blocks.
6. Apply the new design pack and refine the content hierarchy.
7. Connect functional actions to ME3 or Soulink where ready; retain a safe external handoff where they are not.
8. Review the complete site with the client on desktop and mobile.
9. Prepare SEO metadata, redirects, domain cutover, and rollback.
10. Publish only after client approval.

The importer should accelerate the first draft, not silently publish or make unsupported medical claims. Imported source content and client-approved revisions remain the grounding for agent-written public copy.

## Functional boundaries for the pilot

### ME3 owns

- the Business Site documents, media, drafts, published revisions, and redirects;
- the site editor and assistant tools;
- custom-domain publishing;
- public contact/newsletter capture into installation-owned records;
- private assistant, email, contacts, files, tasks, and business operations;
- public profile identities and their `me.json` output;
- approved connections to external providers and Soulink.

### Soulink owns

- community and member interaction;
- courses and lessons;
- meetings and live sessions;
- events and participation;
- the distribution and relationship layer attached to those experiences.

### Commerce boundary

The Tru Health site currently includes membership and clinical-testing commerce. The first migration should not be blocked by implementing a complete Shopify-class system.

For each commercial journey, choose deliberately between:

- retaining an existing checkout temporarily;
- using a connected Stripe payment or product flow where ME3 already supports it safely;
- linking to a Soulink-owned paid experience;
- deferring full native migration until the portable commerce boundary is ready.

The public page document should reference products, prices, or experiences by stable ID. It should not own inventory, orders, enrolments, or payment state.

## Publishing, performance, and reliability

The managed ME3 installation is suitable for hosting the public website and the owner's private ME3 product when public serving is kept independent from interactive workloads.

Required model:

- Publishing creates an immutable, validated site snapshot.
- Public requests serve the published snapshot; they do not call the assistant or rebuild pages.
- HTML and safe public assets are cached at the edge.
- Images use owner-controlled storage, responsive sizes, modern formats, dimensions, and lazy loading.
- Draft rendering and private APIs remain authenticated on the permanent `handle.me3.app` origin.
- The custom business domain serves only published pages, public assets, forms, and public discovery data.
- Assistant, email, task, or Soulink activity cannot invalidate or slow the published site.
- A previous valid snapshot remains available for rollback.
- Monitoring distinguishes public-site availability from private application availability.

This architecture should allow a managed installation to host a site of Tru Health's size comfortably. The important work is product hardening, caching, image handling, observability, and domain operations—not replacing the installation architecture.

## SEO and domain migration

SEO support is a launch requirement, not a later editor embellishment.

The pilot should cover:

- server-rendered semantic HTML;
- unique titles and descriptions;
- canonical URLs;
- open graph/social images;
- sitemap and robots controls;
- structured data for the organisation, people, articles, FAQs, services, products, and events where appropriate;
- image alt text and meaningful headings;
- clean page paths;
- old-to-new permanent redirect mapping;
- a deliberate treatment for removed and duplicate pages;
- analytics and search verification selected with the client;
- Core Web Vitals and an agreed page-weight budget;
- accessible keyboard, form, contrast, and mobile behaviour.

Managed custom-domain work must support the production hostname Tru Health needs, including apex/root and `www` behaviour. Connecting the web domain must not alter mail DNS automatically. Cutover should include pre-launch DNS review, certificate readiness, redirect verification, and a rollback path.

## Health and trust constraints

Tru Health is a healthcare business, so public-site convenience must not blur the boundary around sensitive health information.

For the pilot:

- retain client-approved credentials, disclaimers, privacy, and consent language;
- do not invent, strengthen, or materially alter medical claims without client approval;
- collect only the minimum information needed for general enquiries, newsletter consent, or booking handoff;
- do not move patient records, clinical questionnaires, or practitioner messaging into ordinary site forms;
- keep sensitive clinical workflows in an explicitly approved system until ME3 has the required product, security, and compliance boundary;
- preserve consent evidence and unsubscribe handling for newsletter capture.

## Agent-ready sites and shops

The long-term opportunity is larger than a visual site builder. ME3 Business Sites should become a structured operating surface that people and agents can understand and safely change.

Principles:

- Content, sections, navigation, services, products, offers, and actions have stable IDs.
- Every agent change is a draft with visible provenance and review.
- Publishing, refunds, domain changes, and other consequential actions remain explicit owner actions.
- Structured public data and schema markup are generated from the same canonical records.
- Business events such as a lead, booking, order, enrolment, or course completion can create safe ME3 workflows.
- Sites and business data remain portable between managed and self-hosted installations.
- Exceptional layouts can use bounded custom components later, but arbitrary generated HTML is not the primary model.

### Path toward Shopify migrations

A future portable Commerce capability may own:

- products and collections;
- variants and pricing;
- inventory;
- discounts;
- tax and shipping rules;
- checkout and payment-provider adapters;
- orders, fulfilment, refunds, and customer history;
- product and order tools for the assistant;
- import/export adapters for Shopify and other providers.

ME3 Sites would present that data through structured product blocks and shop pages. The page builder should not become the order system.

Tru Health's testing catalogue provides a useful early example of product collections, filters, sale prices, cart handoff, and clinical disclaimers without requiring the pilot to solve the entire commerce roadmap.

## Flexible delivery sequence

The sequence is outcome-based and may overlap. The design pack can progress in parallel with builder foundations.

### 1. Confirm the migration brief

- Agree the canonical page and URL inventory.
- Identify the current services behind booking, newsletter, commerce, analytics, and member access.
- Confirm the primary audiences, offer, and conversion journey.
- Identify client owners, reviewers, and final approver.
- Agree what community/course material appears in the demo.

### 2. Establish the two-site product model

- Replace the agent/manual chooser with ME3 Profile/Business Site language.
- Always show the add-site control and present the two choices side by side on wider screens.
- Allow multiple structured profiles within plan limits and mark one as primary.
- Keep Business Site creation disabled until a profile exists.
- Attach every Business Site to the profile it represents while keeping branding independent.
- Make profile-specific `me.json`, default identity, and Soulink acting context unambiguous.
- Make the Business Site builder the destination for creating and returning to organisation sites.
- Keep agent and direct editing on one shared model.

### 3. Generalise the structured builder

- Add site navigation, global design, footer, SEO, redirects, and reusable page blocks.
- Support multiple pages and predictable URL paths.
- Add media management and direct section editing.
- Extend agent tools to create and modify the same structures.
- Preserve current landing pages through compatible rendering or migration.

### 4. Build the Clinical Editorial pack

- Establish reusable tokens and section variants.
- Prove the pack against representative Tru Health pages.
- Verify mobile, accessibility, and performance.
- Version the pack before real content is published.

### 5. Rebuild and improve Tru Health

- Import and restructure approved content.
- Simplify navigation and repeated messaging.
- Recreate the key conversion and trust journeys.
- Build reusable practitioner, testimonial, pricing, FAQ, article, and catalogue content.
- Review copy and medical claims with the client.

### 6. Connect the business functions

- Discovery call and general enquiry.
- Newsletter consent and ME3 contact capture.
- Membership and testing purchase handoffs.
- Selected Soulink community/course/event experiences.
- Assistant actions that demonstrate useful coordination across the site and business workspace.

### 7. Make it migration-ready

- Redirect and metadata audit.
- Domain, TLS, apex/`www`, and mail-DNS safety.
- Performance and accessibility review.
- Client editing rehearsal.
- Backup, rollback, and monitoring verification.
- Staged launch approval.

### 8. Turn the pilot into a reusable product

- Extract only the genuinely reusable blocks and migration steps.
- Document where the pilot needed bespoke treatment.
- Prioritise the next service-business migration.
- Continue the commerce and Soulink integration roadmap from real demand.

## Demo narrative

The demo should tell one connected story:

1. Tru Health has a dedicated managed ME3 installation.
2. Its dedicated Tru Health ME3 Profile provides a concise structured business identity for ME3 and Soulink.
3. Its Business Site is a polished redesign of `truhealth.co` with independent branding.
4. The owner asks ME3 to revise a page and reviews the change in the visual editor.
5. Publishing creates a fast, stable public snapshot at the custom domain.
6. A visitor books a call or joins the newsletter and the lead appears in ME3.
7. A community, course, meeting, or event is presented on the site but owned by Soulink.
8. The assistant helps coordinate the resulting content, contacts, tasks, and communications.

This demonstrates an integrated business operating system and network node, not merely another website builder.

## Pilot success signals

The pilot is successful when:

- Tru Health approves the simplified design and content hierarchy;
- the agreed canonical pages can be rebuilt without arbitrary generated HTML;
- the client can make common content, image, page, navigation, and styling changes without a developer;
- the assistant can make useful structured changes without damaging layout or unsupported claims;
- the published site is fast, accessible, indexable, and isolated from private ME3 workloads;
- critical old URLs redirect correctly;
- the discovery call, newsletter, and agreed commercial journeys work;
- at least one Soulink-owned experience appears coherently on the site;
- publishing and rollback are understandable and reliable;
- the resulting builder and design pack are reusable for another client.

## Open questions

These do not block initial builder and design exploration, but they should be answered before migration commitments are made:

1. Which current Tru Health pages and products are active, and which are legacy or due to be retired?
2. Which providers currently own discovery-call scheduling, newsletter delivery, membership payments, product checkout, analytics, and member access?
3. Should the first public demo use a temporary ME3-hosted domain, a Tru Health subdomain, or a private preview only?
4. Who at Tru Health will edit the site, and is single-owner access enough for the pilot?
5. Which Soulink experience should be shown first: community, course, weekly meeting, retreat, or event?
6. Does the first migration retain the current testing checkout, replace it with Stripe-backed ME3 products, or defer testing commerce?
7. Which existing visual assets may be reused, and which should be replaced or newly commissioned?
8. Which analytics, consent, and cookie requirements does Tru Health want to retain?
9. What is the minimum client-approved medical/legal review process for agent-assisted public copy?
10. What initial profile and Business Site limits belong in portable Core versus managed plan entitlements?
11. How should Soulink let one owner switch between personal and business profiles without creating competing account identities?

## Explicit non-goals for the first pilot

- Rebuilding Soulink-owned community, course, lesson, meeting, or event systems in ME3.
- Creating a complete Shopify replacement before Tru Health can launch.
- Migrating patient records or clinical care into ordinary website functionality.
- Giving the agent autonomous publishing authority.
- Achieving pixel-identical Squarespace reproduction.
- Generalising every bespoke need before the client site proves it is reusable.
