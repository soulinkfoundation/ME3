# Native Agent Context Roadmap

Date: 2026-05-16

Planning source of truth for the broader agent harness:
[`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md). This document remains the
detailed native context and memory design reference.

## Plain-English Goal

ME3 should make the assistant feel like it remembers useful things without adding a mysterious external brain first.

The practical path is to wire together the data ME3 already owns:

- Public `me.json` and profile data.
- Mission Control mission statement and latest Wheel of Life snapshot.
- Contacts, relationship notes, and follow-up state.
- Email and mailbox threads.
- Calendar, tasks, projects, and captures.
- Mission Control private memory.
- Recent assistant chat history.

The assistant should receive a small, relevant, testable context packet before it answers or runs a job.

## Product Principle

Each source stays the source of truth.

The context system does not replace contacts, email, tasks, `me.json`, or Mission Control memory. It gathers relevant slices from them, labels where each slice came from, and gives the model only what it needs for the current turn or job.

Durable private memories should be visible, editable, and owner-approved. ME3 should prefer explicit "remember this" / "forget this" flows before inferred black-box memory.

## Milestone 1: Context Packet Contract

Define a shared, portable contract for agent context.

Suggested home: extend `@me3/knowledge` or add a sibling package if the existing package gets too broad.

The packet should include:

- Owner/profile summary.
- Mission Control mission statement.
- Latest Wheel of Life snapshot.
- Public identity context from `me.json`-owned data.
- Relevant private memories.
- Relevant contacts.
- Relevant email/thread summaries.
- Relevant project/task/calendar context.
- Recent assistant messages.
- Source manifest showing what was included and why.
- Prompt budget controls so context cannot grow without bound.

Test gates:

- Unit tests serialize stable context packets from fixtures.
- Prompt budget tests prove long inputs are trimmed predictably.
- Privacy tests prove private memory is never marked as public identity.

## Milestone 2: Simple Context Resolvers

Start with deterministic rules before adding semantic search.

Examples:

- If a request names a contact, include that contact and recent related communication summaries.
- If a request is inside an email thread, include that thread, sender contact, and relevant relationship notes.
- If a request is inside a project or Assistant Job, include that project, open tasks, recent runs, and project-scoped memory.
- Always include a small owner/profile summary.

Test gates:

- Contact-name fixtures resolve the intended contact.
- Email-thread fixtures include only the current thread and linked contact.
- Project fixtures do not leak unrelated project context.
- Missing/ambiguous matches degrade gracefully and ask for clarification when needed.

## Milestone 3: Use Context In Chat And Jobs

Wire the packet into model calls.

Initial targets:

- Core sandbox chat.
- Assistant Jobs runner.
- Mission Control result-producing jobs.

Test gates:

- Existing chat behavior keeps working if context lookup fails.
- Model-call builders include source-labeled context in a stable order.
- Job runs record which context sources were used.
- Snapshot tests cover common prompts like "reply to this email", "what do I owe this client?", and "what should I focus on today?"

## Milestone 4: Owner-Approved Memory Controls

Add explicit controls for durable memory.

Owner flows:

- "Remember this."
- "Forget this."
- "Show what you remember about X."
- "Do not use this source for this job/project."

Agent behavior:

- The assistant can suggest a memory but should not silently create durable behavioral memory without an owner-visible trail.
- Mission Control remains the reviewable home for private memory.

Test gates:

- Memory writes create Mission Control private memory entries with source and review status.
- Forget/archive removes the memory from future context packets.
- Audit records show when a job or assistant turn used durable memory.

## Milestone 5: Visibility And Debuggability

Give the owner confidence by making context visible.

Useful UI copy:

> Used context from: profile, 2 contacts, 1 email thread, 3 private memories.

Useful internal records:

- Context packet ID.
- Source IDs and source types.
- Resolver reasons.
- Trimming decisions.
- Whether any source failed.

Test gates:

- Job run detail shows the context source manifest.
- Chat/debug response can expose the manifest in development.
- Failed source lookups do not crash the assistant.

## Milestone 6: Smarter Retrieval Later

Only after the deterministic system works, add smarter retrieval.

Possible later options:

- Local indexed search across approved sources.
- Summaries for long email threads and project histories.
- Embeddings or semantic search.
- External memory adapters, if native context eventually proves insufficient.

The rule is simple: smarter retrieval must plug into the same packet contract, source manifest, privacy rules, and tests.

## Portability To me3-app

Build this so it can be migrated or cloned into `me3-app` later.

Guidelines:

- Keep the context packet contract in a shared package, not buried in Worker route code.
- Keep resolvers as small adapters over source APIs/tables.
- Avoid Core-only Cloudflare assumptions in pure context-building logic.
- Keep hosted-only data and billing out of Core contracts.
- Add fixture-based tests that can run in both repos.

### Portable Boundaries

Pure shared logic:

- `packages/knowledge/src/agent-context.ts`
  - Packet schema.
  - Source manifest shape.
  - Prompt builder.
  - Deterministic resolver over candidate source slices.
  - Validation rules for public/private boundaries.
- `packages/assistant-jobs/src/index.ts`
  - Assistant Job capability/draft model.
  - `createAssistantJobContext` for scoped job/run context packets.
  - `createAssistantJobContextRunManifest` for serializable run records.
  - `attachAssistantJobContextToRunResult` for Mission Control run result JSON.

Core-specific adapters:

- `packages/agent-chat/src/index.ts`
  - Cloudflare D1 queries for Core contacts, mailbox messages, Mission Control memory, projects, tasks, calendar events, and recent chat messages.
  - Core sandbox chat prompt assembly.
  - AI provider routing and fallback behavior.

Do not migrate blindly:

- `apps/worker/wrangler*.toml`.
- `.dev.vars`.
- production Cloudflare account IDs, route IDs, R2/D1 names, or hosted domains.
- hosted subscription or billing config.
- provider secrets or encrypted local install secrets.

### Source Mapping For me3-app

When cloning into `me3-app`, keep the shared packet contract unchanged and replace only the source adapters.

| Context source | Core scaffold source today | me3-app adapter target |
| --- | --- | --- |
| Owner profile | `owner_profile` rows | me3-app owner/user profile model |
| Mission statement | `mission_dashboard_settings.mission_statement` | Mission Control mission statement in me3-app |
| Wheel of Life | latest `mission_wheel_snapshots` row | Mission Control Wheel of Life snapshot in me3-app |
| Public identity | `/.well-known/me.json` / public profile fields | published me.json/profile source in me3-app |
| Contacts | `contacts` table | me3-app contacts/CRM source |
| Email threads | `mailbox_aliases` + `mailbox_messages` | me3-app email provider/thread abstraction |
| Projects | `mission_projects` | me3-app project/workspace model |
| Tasks | `mission_tasks` | me3-app task/work item model |
| Calendar | `user_calendar_events` | me3-app calendar/event provider abstraction |
| Private memory | `mission_private_memory` | Mission Control/private memory store in me3-app |
| Recent assistant chat | `assistant_messages` | me3-app assistant conversation history |
| Job run context | Assistant Jobs context helpers + `mission_agent_runs.result_json` | me3-app job runner/run record model |

### Migration Checklist

1. Copy or publish `@me3/knowledge` with `agent-context.ts` and its tests.
2. Copy or publish `@me3-core/assistant-jobs` context helpers if Assistant Jobs move with the feature.
3. Keep Core D1 loader code out of the shared package. Rebuild adapters in me3-app against its own repositories/services.
4. Preserve source IDs, source kinds, visibility, resolver reasons, and trim metadata in manifests.
5. Make the me3-app runner store `contextPacketId` and `contextManifest` on run records before adding UI.
6. Keep private memory writes owner-approved and Mission Control-visible.
7. Run the shared fixture tests before wiring models.
8. Add me3-app adapter tests for:
   - named contact lookup,
   - active email thread lookup,
   - active project/job scope,
   - private memory inclusion/exclusion,
   - source failure fallback,
   - prompt budget trimming,
   - no unrelated contact/project/email bleed.

### Tests To Carry Across

- `packages/knowledge/src/agent-context.test.ts`
- `packages/assistant-jobs/src/index.test.ts` context cases
- `apps/worker/src/agent-chat-context.test.ts` as adapter guidance, not a direct copy unless me3-app uses the same Worker/D1 shape.

The first two should run with minimal changes in both repos. The chat adapter test should be rewritten around me3-app's own API/runtime surface while preserving the assertions.

## Current Decision

Work toward native ME3 context first. If native context starts to feel limited, evaluate a separate retrieval or memory adapter later behind the same contract.

## Tracking Beads

- `me3-ctx`: Build native ME3 agent context system.
- `me3-ctx.1`: Define portable agent context packet contract.
- `me3-ctx.2`: Build deterministic context resolvers for existing ME3 data.
- `me3-ctx.3`: Wire native context packets into Core chat.
- `me3-ctx.4`: Wire native context packets into Assistant Jobs and Mission Control runs.
- `me3-ctx.5`: Add owner-approved remember, forget, and memory review flows.
- `me3-ctx.6`: Expose context source manifests for trust and debugging.
- `me3-ctx.7`: Plan and prove me3-app migration path for native context system.
- `me3-ctx.8`: Integrate native context with concrete Assistant Jobs runner.
