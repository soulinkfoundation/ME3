---
title: Landing Pages plugin working plan
status: product-design
updated: 2026-07-10
tracking: me3-0lx, me3-0lx.10
---

# Landing Pages plugin working plan

This is lightweight context for Landing Pages product planning. Detailed implementation scope, acceptance criteria, and execution history live in beads.

## Working conclusion

- **Sites is the product surface.** Landing Pages is the first guided page-creation workflow and recipe pack inside Sites, not a separate publishing system. The underlying model should support multi-page sites later without another rewrite.
- **The agent should generate structured page documents, not arbitrary site code.** ME3-owned renderers and interactive blocks provide responsive layout, accessibility, security, preview parity, and backend integration. The agent creates drafts and applies typed section/action patches; the owner explicitly publishes.
- **A site is a publication container and a page is content.** Domain, hosting, theme, and publication settings belong to a site; slug, sections, SEO, draft/published revisions, and conversion bindings belong to pages. The current `site_type = landing_page` shape should be treated as a migration source rather than the final model.
- **Conversion actions are first-class bindings.** A page can bind a CTA or block to an external link, an ME3 subscriber destination, an existing booking offer, or an existing product/payment offer. Page documents reference stable action/resource IDs instead of embedding provider credentials or handwritten API code.
- **The ME3 runtime owns owner data and provider-neutral commerce state.** Drafts, pages, assets, leads, bookings, offers, orders, attribution, and published revisions remain in the owner's ME3 installation. Self-hosted installs can use the existing direct Stripe configuration. Managed installs need a ME3 Cloud Stripe Connect/provider bridge while keeping the installation as the system of record.

## Assessment of the existing implementation

Useful foundations to retain:

- The first-party `@me3-core/plugin-landing-pages` package boundary and plugin gating.
- Versioned document normalization, deterministic rendering, exact-HTML preview, media storage, and publish/unpublish concepts.
- The existing site wizard's subscriber, booking, product, confirmation-email, and direct Stripe capabilities.
- The event and waitlist recipes as fixtures and design references.

Foundations to replace or reshape:

- One landing page currently consumes an entire `sites` record, which blocks a clean multi-page future and leaves non-custom-domain public routing ambiguous.
- The v2 document is mostly copy and layout; it cannot bind functional signup, booking, or checkout actions.
- Signup forms in the landing renderer are decorative, and landing-page records do not carry the profile-site commerce configuration expected by the booking APIs.
- The builder regenerates a whole page from a brief instead of supporting direct editing and structured agent patches.
- Current generation is deterministic text extraction rather than a real agent-assisted intake and editing workflow.

The code is therefore a valuable spike and migration source, but not a UI or data model to finish in place unchanged.

## Launch journey

1. The owner asks ME3 for a page or chooses **New page** in Sites.
2. ME3 identifies the page goal, audience, offer, proof/assets, and primary conversion action. Existing bookings, products, subscriber destinations, and payment readiness are offered as choices.
3. ME3 creates a structured draft from a curated recipe.
4. The owner edits text and sections directly or asks the agent for targeted changes. Agent changes are typed patches, not full-page code rewrites.
5. Preview uses the exact renderer and action configuration that will go live. Publish checks required content, valid action bindings, provider readiness, mobile layout, SEO, and accessibility basics.
6. The owner explicitly publishes, can unpublish without losing the draft, and can inspect leads, bookings, orders, and attribution from ME3.

## Smallest useful launch scope

- Three strong recipes: service/offer, event/workshop, and waitlist/launch.
- A guided section editor: inline copy, add/remove/reorder, targeted regeneration, image controls, action settings, SEO/social preview, responsive preview, and publish/unpublish.
- Four action types: external link, email signup, existing booking offer (free or paid when payments are ready), and existing one-time product/payment offer.
- Stable path-based public URLs for every install; managed subdomains and custom domains are deployment adapters rather than page identity.
- Draft and published revisions, with at least the previous published revision available for rollback.
- Attribution for page, action, and campaign on conversions.
- Export of page documents and assets. Static HTML export may require a configured ME3 action endpoint for interactive blocks.

## Managed and self-hosted boundary

- Self-hosted: owner-configured AI/provider credentials and the current encrypted direct Stripe key path can power generation and commerce.
- Managed: ME3 Cloud supplies managed AI and a Stripe Connect/provider bridge, with quotas, operational policy, and billing outside this plugin.
- Both modes use the same page document, action contracts, renderer, and owner-installation data model.
- A page may still publish with non-payment actions when commerce is unavailable; payment actions fail closed and show setup requirements before publish.

## Defer until evidence requires it

- Arbitrary HTML/CSS/JavaScript generation, a code sandbox, or a general-purpose drag-and-drop canvas.
- A broad template marketplace, third-party template ingestion, premium recipe packs, or plugin-specific pricing.
- A/B testing, advanced funnels, marketing automation, deep analytics, and many-site team workflows.
- Final managed quotas or permanent usage promises before managed cost and support data exist.

## Planning continuation

Use `me3-0lx.10` for the product decision record. Foundation, conversion-action, managed-commerce, builder, recipe, hosted-adoption, and launch-gate work should remain ordered child beads of `me3-0lx`. `me3-1dr.4` remains the unrelated Social Publishing launch-planning bead.
