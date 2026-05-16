# Honcho Agent Memory Spike

Date: 2026-05-16

## Verdict

Honcho looks useful enough to prototype for ME3 agents, but it should be an optional memory adapter rather than a Core dependency.

The strongest fit is long-lived, owner-scoped agent memory: chat history, assistant job runs, project context, contact context, corrections, and relationship/preferences that should survive beyond the current 12-message chat window. Honcho's peer model maps well to ME3 because it treats people, agents, groups, projects, and ideas as durable entities, not just rows in a vector index.

The main caution is boundary control. Honcho can be used as a managed external service or self-hosted service; either way, Core should keep public `me.json`, owner-approved Mission Control private memory, plugin-owned state, and hosted-only infrastructure explicitly separate.

## What Honcho Provides

Sources reviewed:

- Honcho repository: https://github.com/plastic-labs/honcho
- Honcho architecture docs: https://honcho.dev/docs/v3/documentation/core-concepts/architecture
- Honcho reasoning docs: https://honcho.dev/docs/v3/documentation/core-concepts/reasoning
- Honcho context docs: https://honcho.dev/docs/v3/documentation/features/get-context
- Honcho SDK reference: https://honcho.dev/docs/v3/documentation/reference/sdk
- TypeScript SDK package metadata: https://www.npmjs.com/package/@honcho-ai/sdk
- Python SDK package metadata: https://pypi.org/project/honcho-ai/

Key primitives:

- Workspace: isolation boundary for an install, tenant, or environment.
- Peer: any durable person, agent, project, group, or entity.
- Session: a conversation or interaction context with one or more peers.
- Message: the append-only input stream for conversations, events, documents, and tool traces.
- Representation, conclusions, peer cards, and session context: the reasoned memory surfaces used at prompt time.

Operational model:

- Writes store messages immediately and enqueue background reasoning.
- A background deriver updates representations, summaries, peer cards, and derived conclusions.
- Reads can fetch prompt-ready context, semantic search, peer cards, representations, and natural-language answers.
- Managed service is available at `api.honcho.dev`; self-hosting runs a FastAPI server with Postgres, background workers, LLM provider keys, and vector storage.

## Current ME3 Fit

ME3 Core already has memory-shaped surfaces, but they are intentionally small:

- `assistant_messages` stores simple owner chat history.
- `dispatchAgentSandboxTurn` currently loads the latest 12 owner/assistant messages before each model call.
- Mission Control has owner-approved `mission_private_memory` and `mission_context_sources`.
- The user agent runtime lives in a per-owner Durable Object, which gives a natural place to coordinate turn-level state.

Honcho would be useful where the current shape becomes thin:

- Long-running assistant jobs need context across schedules, events, projects, and channels.
- Mission Control memory is manually curated, but agent memory also needs derived facts, contradictions, and temporal context.
- Cross-peer memory could model "owner knows contact", "agent knows owner", "project has context", and "job runner has learned a workflow".
- Context assembly could become less manual than concatenating recent messages plus profile fields.

## Recommended Integration Shape

Start with a narrow `MemoryProvider` boundary:

```ts
type AgentMemoryProvider = {
  appendTurn(input: AgentMemoryTurnInput): Promise<void>;
  getPromptContext(input: AgentMemoryContextInput): Promise<AgentMemoryContext>;
  upsertExplicitMemory(input: AgentMemoryExplicitInput): Promise<void>;
};
```

Then add a Honcho-backed implementation behind a feature flag:

- Use stable peer IDs such as `owner:{userId}`, `agent:core-chat`, `job:{jobId}`, `project:{projectId}`, `contact:{contactId}`.
- Use session IDs such as `chat:sandbox:{connectionId}`, `job-run:{runId}`, `project:{projectId}:review`, or `contact:{contactId}:thread`.
- Append user and assistant turns after `assistant_messages` persistence succeeds.
- Query Honcho before `buildChatMessages` finalizes system/user context.
- Keep Mission Control private memory as the owner-visible, reviewable memory source of truth.
- Only push explicit Mission Control memories into Honcho after owner approval or direct owner creation.

Prefer direct REST or a tiny local wrapper for the first Worker prototype. The TypeScript SDK is small and Apache-2.0, but the current package is CommonJS and reads `process.env` when options are omitted. That is manageable if every option is explicit, but a direct Worker-native wrapper keeps the first spike clearer.

## What Not To Do

- Do not vendor Honcho server code into ME3 Core.
- Do not make Honcho required for the baseline Core chat experience.
- Do not write Honcho-derived memories back into public `me.json`.
- Do not bypass Mission Control approval semantics for durable facts that affect future behavior.
- Do not send private owner data to managed Honcho without an explicit setup screen and clear data-boundary copy.

## Risks

- License: Honcho server is AGPL-3.0; SDK packages are Apache-2.0. Keep the server separate unless legal/product explicitly accepts the self-hosting obligations.
- Data privacy: managed Honcho means owner messages and derived memory leave the install.
- Worker compatibility: the SDK likely bundles, but direct REST is safer for Cloudflare Workers.
- Eventual consistency: Honcho reasoning is asynchronous, so fresh turns may not immediately affect representations.
- Cost and latency: background reasoning adds provider/service cost and extra prompt-time calls.
- Identity design: poor peer/session IDs could create misleading memory or leak context across projects/contacts.
- Versioning: docs and server are currently v3, while SDK package versions are v2.x; pin versions and test API compatibility.

## Prototype Acceptance Criteria

A useful follow-up spike should prove:

- Core chat can append turns to Honcho without breaking the existing `assistant_messages` fallback.
- Core chat can retrieve a bounded Honcho context block and inject it before model calls.
- Mission Control can show whether Honcho memory is disabled, connected, or failing.
- Owner-approved Mission Control memory can be synced as explicit Honcho conclusions.
- A test fixture proves project/contact/session scoping prevents unrelated context from appearing.
- Failure mode falls back to current ME3 chat context with no user-facing crash.

## Recommendation

Proceed with an optional adapter prototype. If the prototype improves recall and context quality without muddying Core/plugin/hosted boundaries, Honcho is a strong candidate for ME3 agent memory. If the adapter requires too much special-case identity handling or introduces opaque privacy/cost behavior, keep Mission Control private memory and build a simpler local retrieval layer first.
