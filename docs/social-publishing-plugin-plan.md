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

The content workflow, account setup, encrypted provider settings, OAuth callbacks, content bank, scheduling, queue dispatch, retries, audit, and provider adapters already have substantial implementation and test coverage. Launch readiness still needs a deliberate provider order, production OAuth verification, failure/reconnect behavior, and a focused end-to-end experience.

## Recommended launch defaults

- Launch LinkedIn first, then Instagram once the managed bridge and provider review are proven.
- Keep X bring-your-own initially; defer a managed X option until API cost and support expectations are clear.
- Keep the workflow small: compose or adapt a draft, preview per network, choose connected accounts and time, approve, queue, publish, and inspect the result.
- Fail closed when approval, account readiness, token state, or provider setup is missing.
- Surface retryable failures and reconnect requirements without losing the draft or publication history.
- Run the beta without a separate plugin fee; measure connected accounts, successful publications, repeat use, provider failures, queue cost, and support burden before revisiting limits.

## Defer until evidence requires it

- A broad network matrix, YouTube workflows, or feature parity across every provider.
- Advanced analytics, social listening, inbox engagement, campaign management, or automatic cross-post optimisation.
- Paid add-ons, one-off plugin licensing, self-hosted entitlements, or provider-specific metering beyond unavoidable costs.
- Teams, approval chains, agencies, and many-account organisation models.
- Final managed quotas until Pro pricing and real publishing costs are reviewed.

## Next planning session

The next session should choose the launch workflow and provider order, test the managed LinkedIn/Instagram bridge assumptions, decide the X boundary, define reconnect/retry/support expectations, and turn the result into ordered implementation beads. Existing implementation work is tracked under `me3-1dr`; the planning continuation is `me3-1dr.4`.
