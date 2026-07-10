---
title: Social Publishing plugin working plan
status: brainstorm
updated: 2026-07-10
tracking: me3-1dr, me3-1dr.4
---

# Social Publishing plugin working plan

This is lightweight context for the next Social Publishing product-planning session. Detailed implementation scope and execution history remain in beads.

## Current position

- Social Publishing stays a first-party ME3 plugin in this MIT repository.
- It is included with managed ME3 and available to self-hosted owners; separate plugin pricing is deferred.
- Managed provider OAuth, credentials, quotas, and operational guarantees belong to ME3 Cloud. Self-hosted owners can use bring-your-own provider credentials.
- Drafts, connected-account references, schedules, publication history, and audit data belong to the owner's ME3 installation.
- Approval remains mandatory before external publishing.
- The plugin remains hidden from plugin management until the launch workflow and provider readiness are confirmed.

The content workflow, account setup, encrypted provider settings, OAuth callbacks, content bank, queue dispatch, audit, and provider adapter boundaries already have substantial implementation and test coverage. Scheduling and retry foundations exist but are not yet a complete owner-facing workflow. Launch readiness still needs a deliberate provider order, production OAuth verification, failure/reconnect behavior, and a focused end-to-end experience.

## Product direction

Social Publishing should help the owner turn work they are already doing into useful social content. It should not make them operate a second content-management system.

The ME3 agent is the primary creation and revision surface. The Social Publishing workspace is the control surface for reviewing platform-specific drafts, choosing accounts and timing, approving external actions, recovering from failures, and inspecting publication history.

The core promise is:

> Turn a journal note, Mission Control task, existing page, or rough idea into review-ready posts for the right accounts, then publish them safely at the right time.

## Smallest useful workflow

1. Start from an explicit source: an agent conversation, journal entry, Mission Control task, existing site post or page, pasted text, or a blank idea.
2. ME3 extracts the shareable idea and creates a content package with source provenance and a short source snapshot.
3. ME3 creates a separate draft for each selected account and platform. Variants share the idea but are written for the network instead of copying one caption everywhere.
4. The owner reviews the source, each platform preview, validation issues, and media. They can edit directly or ask ME3 for a revision such as shorter, less formal, or more specific.
5. The owner explicitly approves each publication and chooses Post now, an exact time, or the next available queue slot. Editing approved copy or media removes that approval.
6. Each account publication runs and fails independently. The workspace preserves the draft, schedule, attempts, provider result, and recovery action.

The plugin must never infer approval from draft generation, saving, queueing, or a previous approval of different copy.

## Product model

- **Publishing context:** the existing ME3 site/profile and business briefing provide voice, audience, goals, and default account context. Do not introduce a second profile system for launch.
- **Content package:** one shareable idea with source references, a source snapshot, purpose, and optional shared media.
- **Account variant:** editable copy and media choices for one platform account. Approval and scheduling live here, not on the whole package.
- **Publication attempt:** one immutable delivery attempt with provider status, external post ID/URL, error classification, timestamps, and audit events.
- **Account connection:** an installation-owned reference and encrypted user token tied to a publishing context. Managed provider application credentials remain in ME3 Cloud.

This model should support several accounts without requiring teams, agencies, approval chains, or campaign management.

## Surface responsibilities

- **ME3 agent:** find source material, suggest shareable ideas, generate variants, explain choices, and revise drafts. It may save drafts but may not approve or publish them.
- **Journal and Mission Control:** offer a lightweight Create social draft action that passes an explicit source reference into the agent workflow.
- **Social Publishing:** keep the primary modes to Drafts, Scheduled, and Published. Account setup and provider health are secondary settings, not the main workspace.
- **Notifications:** surface posts needing review, failed publications, and reconnect requirements without creating a general social inbox.

Proactive suggestions can follow after the explicit workflow is trusted. If added, they should be a small digest of moments worth sharing, not a stream of automatically generated drafts.

## Existing implementation strategy

Do not restart the whole plugin. Retain the parts that already express the correct boundaries:

- the first-party plugin package and install gate;
- encrypted account tokens and managed OAuth handoff shape;
- account inventory, publication events, queue consumer, scheduled handler, and audit trail;
- provider adapter boundary;
- useful account connection and platform preview UI pieces.

Rework the parts that encode the old product shape:

- replace the one-body/many-platform content item as the publishing source of truth with a package plus account-specific variants;
- generalise the existing `social_packages` and `social_variants` model beyond blog slugs and make source provenance first-class;
- add explicit agent capabilities for draft creation and revision from journal and Mission Control sources;
- move Social Publishing HTTP routes into a domain route module and keep provider and workflow logic in plugin-owned services;
- finish real scheduling, token refresh, disconnect/reconnect, classified retries, and account health;
- update versioned provider APIs and complete their media flows before production use.

Existing `content_bank_items` data can be migrated or adapted into packages; it should not force the new interaction model to remain a generic content bank.

## Recommended launch defaults

- Launch LinkedIn personal publishing first because text-led posts map directly to journal notes, project lessons, and completed work. Prove text publishing first and add a reliable single-image flow before general availability; defer organisation pages initially.
- Launch Instagram next through managed Instagram Login for professional accounts. Start with feed posts and a dependable media flow; defer Reels, Stories, and broad format parity.
- Keep X bring-your-own initially, including owner-funded API credits. Defer a managed X option until billing, abuse, and support expectations are clear.
- Keep the workflow small: choose source, generate account variants, review, approve, choose time, publish, and inspect or recover the result.
- Fail closed when approval, account readiness, token state, or provider setup is missing.
- Retry only clearly transient failures. Do not automatically retry an ambiguous timeout that may have published; mark it Needs check to prevent duplicate posts.
- Surface reconnect requirements, provider rejections, and partial multi-account success without losing drafts, schedules, or publication history.
- Run the beta without a separate plugin fee; measure connected accounts, successful publications, repeat use, provider failures, queue cost, and support burden before revisiting limits.

## First vertical slice

The first end-to-end slice should be deliberately narrow:

- connect one LinkedIn personal account through the managed bridge or self-hosted credentials;
- ask ME3 to turn one journal entry or Mission Control task into a LinkedIn draft;
- show the source and draft in an approval card and in Social Publishing;
- revise, explicitly approve, and either post now or schedule an exact time;
- publish once, record the external URL and audit history, and handle expired credentials or a retryable provider failure without losing work.

This proves the differentiated value of ME3 before expanding the provider and format matrix.

## Later Instagram carousel generation

After dependable Instagram feed publishing is in place, add an agent-assisted carousel format as a separate media track:

- ME3 turns the source idea into a structured slide plan with a hook, supporting beats, and a closing slide;
- a configured image-generation provider can create illustrations or backgrounds, using Workers AI first when its quality is sufficient and allowing another provider later;
- ME3 renders headings and body copy through deterministic templates instead of asking an image model to draw important text;
- the owner can edit slide copy, regenerate individual visuals, reorder slides, add alt text, preview the complete carousel, and explicitly approve the rendered asset set;
- the installation stores the slide plan, prompts, generated assets, alt text, and publication history while the provider adapter remains replaceable.

The existing variant `format` and asset manifest can carry the first carousel implementation. Do not add a provider-specific carousel schema before the media workflow needs it.

## Operational expectations

- Run provider-specific validation before approval and again immediately before publishing.
- Refresh tokens before dispatch when the provider supports it; otherwise request reconnect before the scheduled time.
- Classify failures as retryable, reconnect required, content rejected, unsupported, or outcome unknown.
- Use bounded retries with backoff for known transient failures and preserve an immutable attempt history.
- Treat each account variant independently so one provider failure does not block successful targets.
- Prevent duplicate dispatch with an internal idempotency boundary and a manual check state for ambiguous provider outcomes.
- Keep all drafts, source snapshots, schedules, user tokens, and publication history in the installation. ME3 Cloud only owns managed provider application credentials, OAuth operations, and unavoidable shared-service telemetry.

## Release criteria

- The journal/task-to-LinkedIn workflow works through the ME3 agent and the Social Publishing workspace.
- Explicit approval is enforced at the exact account variant that will be published.
- Managed and self-hosted OAuth paths pass production callback, token refresh, reconnect, and revocation tests.
- Scheduling survives restarts and timezone boundaries without duplicate or early publication.
- Success, partial success, retryable failure, reconnect required, provider rejection, and ambiguous outcome are understandable and recoverable.
- Provider adapters use supported API versions and implement every media type advertised by the UI.
- Audit history contains the source, approved variant, target account, actor, timestamps, attempts, and external result without exposing secrets.
- The focused workflow is usable on desktop and mobile in light and dark mode.

## Defer until evidence requires it

- A broad network matrix, YouTube workflows, or feature parity across every provider.
- Advanced analytics, social listening, inbox engagement, campaign management, or automatic cross-post optimisation.
- Reels, Stories, fully generated video, and broad creative-template libraries beyond the focused Instagram carousel track.
- Paid add-ons, one-off plugin licensing, self-hosted entitlements, or provider-specific metering beyond unavoidable costs.
- Teams, approval chains, agencies, and many-account organisation models.
- Final managed quotas until Pro pricing and real publishing costs are reviewed.

## Next planning session

The next session should choose the launch workflow and provider order, test the managed LinkedIn/Instagram bridge assumptions, decide the X boundary, define reconnect/retry/support expectations, and turn the result into ordered implementation beads. Existing implementation work is tracked under `me3-1dr`; the planning continuation is `me3-1dr.4`.
