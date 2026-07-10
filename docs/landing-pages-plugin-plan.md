---
title: Landing Pages plugin working plan
status: brainstorm
updated: 2026-07-10
tracking: me3-0lx, me3-0lx.10
---

# Landing Pages plugin working plan

This is lightweight context for the next Landing Pages product-planning session. Detailed implementation scope and execution history remain in beads.

## Current position

- Landing Pages stays a first-party ME3 plugin in this MIT repository.
- It is included with managed ME3 and available to self-hosted owners; separate plugin pricing is deferred.
- Managed-only AI usage, quotas, hosting defaults, and billing stay in ME3 Cloud. Self-hosted owners can use their own AI and infrastructure.
- Landing-page content, drafts, assets, and publish state belong to the owner's ME3 installation.
- The plugin remains hidden and activation-blocked until the builder and initial recipe set are launch-ready.

The package, v2 document model, first event/waitlist recipes, add-page flow, renderer, route guards, and starter builder already exist. The main gaps are builder control, recipe breadth and quality, template licensing, hosted adoption, and release readiness.

## Recommended launch defaults

- Start with three strong use cases: service/offer, event/workshop, and waitlist/launch.
- Prefer a guided section editor over a general-purpose drag-and-drop page builder.
- Include section text editing, reorder/add/remove, targeted regeneration, image/CTA controls, SEO/social preview, responsive preview, and publish/unpublish.
- Use only ME3-owned or clearly redistributable recipes and assets.
- Run the beta without a separate plugin fee or permanent usage promise; measure creation, publish, repeat-use, AI cost, and support burden before revisiting managed quotas or premium template packs.
- Preserve drafts and published content if managed access changes; do not delete owner data because a plan ends.

## Defer until evidence requires it

- A broad template marketplace or third-party template ingestion.
- Arbitrary layout primitives, custom code blocks, or a full visual design tool.
- Premium recipe packs, one-off plugin licensing, or self-hosted entitlements.
- Final managed page limits and AI allowances until Pro pricing is revisited.
- Lead-magnet, booking/application, product/sales, analytics, A/B testing, and advanced form automation beyond the launch set.

## Next planning session

The next session should choose the launch user journey and quality bar, review the existing builder and recipes, decide the first three recipe requirements, resolve template sources/licensing, and turn the result into ordered implementation beads. Existing implementation work is tracked under `me3-0lx`; the planning continuation is `me3-0lx.10`.
