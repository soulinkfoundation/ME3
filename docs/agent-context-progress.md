# Native Agent Context Progress

Date: 2026-05-16

## Verdict

We are building native ME3 agent context first and leaving Honcho aside for now.

The near-term goal is simple: before chat or a job asks a model to do something, ME3 builds a small, source-labeled context packet from data it already owns. That packet must be testable, inspectable, and portable to `me3-app` later.

## Working Rules

- Keep source systems as the source of truth: profile, `me.json`, contacts, email, projects, tasks, calendar, assistant chat, and Mission Control memory.
- Durable private memory must be owner-visible and owner-approved.
- Context packets must carry source manifests so we can explain what was used.
- Shared contracts and fixture tests should stay portable; Worker/D1 adapters can remain Core-specific.
- Update this document after each `me3-ctx` bead lands.

## Completed Beads

| Bead | Status | What landed |
| --- | --- | --- |
| `me3-ctx.1` | Done | Portable context packet contract, source manifest shape, prompt builder, deterministic resolver, budget trimming, and privacy boundaries in `packages/knowledge/src/agent-context.ts`. |
| `me3-ctx.2` | Done | Deterministic resolver tests for owner/profile, contact, thread, project, memory, recent chat, missing sources, and prompt budget behavior. |
| `me3-ctx.3` | Done | Core sandbox chat now loads native context from Core data, injects source-labeled context into model prompts, and falls back cleanly if context lookup fails. |
| `me3-ctx.4` | Done | Assistant Jobs package can build job-scoped context packets and serializable run manifests for Mission Control run records. |
| `me3-ctx.5` | Done | Mission Control memory now supports manual active writes, agent suggestions that stay `needs_review`, explicit approval, archive/forget, UI review actions, and focused tests for source metadata and archive exclusion. |
| `me3-ctx.6` | Done | Shared context manifests now include source IDs, kinds, reasons, statuses, failures, warnings, and prompt trimming decisions; chat responses expose packet ID, manifest, and a concise dev/debug summary; Assistant Jobs uses the same manifest builder. |
| `me3-ctx.7` | Done | `me3-app` migration guidance is documented in `docs/agent-context-roadmap.md`, including source mapping, portability boundaries, and tests to carry across. |

## Current Bead

`me3-ctx.8`: Integrate native context with concrete Assistant Jobs runner.

Status:

Blocked until the Worker has a concrete Assistant Jobs backend runner.

Package-level context helpers are ready. The remaining work is to call them during real manual/scheduled job execution and persist `contextPacketId` / `contextManifest` on `mission_agent_runs.result_json`.

## Remaining Beads

| Bead | Status | Why it remains |
| --- | --- | --- |
| `me3-ctx.8` | Open | Waiting for a concrete Worker Assistant Jobs runner; package-level helpers exist, but there is not yet a real runtime to wire into. |

## Test Record

Completed before this progress log:

- `pnpm --filter @me3-core/worker test`
- `pnpm --filter @me3-core/plugin-agent-chat build`
- `pnpm --filter @me3-core/assistant-jobs test`
- `pnpm --filter @me3-core/assistant-jobs build`
- `pnpm build`

Completed for `me3-ctx.5`:

- `pnpm --filter @me3-core/worker test -- mission-control-memory`
- `pnpm --filter @me3-core/worker build`
- `pnpm --filter @me3/web build`
- `pnpm --filter @me3-core/worker test`

Completed for `me3-ctx.6`:

- `pnpm --filter @me3/knowledge test`
- `pnpm --filter @me3-core/plugin-agent-chat build`
- `pnpm --filter @me3-core/assistant-jobs test`
- `pnpm --filter @me3-core/assistant-jobs build`
- `pnpm --filter @me3-core/worker test -- agent-chat-context`
- `pnpm --filter @me3-core/worker test`
- `pnpm --filter @me3/web exec vitest run agentChat`
- `pnpm --filter @me3/web build`

Session landing gate:

- `pnpm build`

## Portability Notes

The safest migration path to `me3-app` is to move the shared contract and tests first, then rebuild adapters against `me3-app` data sources.

Do carry across:

- `packages/knowledge/src/agent-context.ts`
- `packages/knowledge/src/agent-context.test.ts`
- Assistant Jobs context helper tests where Assistant Jobs move with the feature
- The behavior assertions from Core chat adapter tests

Do not carry across blindly:

- Core Worker routes and Cloudflare config
- D1 schema assumptions where `me3-app` already has a richer model
- Secrets, hosted Cloudflare routes, billing config, or production-only environment files
