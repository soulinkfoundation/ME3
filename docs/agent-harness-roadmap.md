# ME3 Agent Harness Roadmap

Last updated: 2026-06-02

This document is the source of truth for the medium-term ME3 Core agent harness work.
Update it whenever chat actions, Assistant Jobs, context/memory, Mission Control outputs,
plugin capabilities, or agent safety policy change.

The goal is a robust owner-controlled agent harness for ME3 Core. The harness should let
the ME3 agent handle immediate owner requests, recurring jobs, provider events, reminders,
email, calendar, Mission Control work, and later plugin-owned capabilities such as social
publishing. The owner-facing UI should stay simple; internal terms can remain internal.

## Owner-Facing Model

- Chat: ask the assistant to do something now.
- Assistant Jobs: create and manage repeatable jobs.
- Mission Control: review results, approvals, tasks, memory, runs, and activity.
- Account and Plugins: connect the things the assistant can use.

Do not surface backend terms like recipes, capabilities, approval policy, event ingress,
runs, or Mission Control outputs as primary UI language. Use plain words such as jobs,
results, drafts, approvals, setup, and history.

## Internal Model

- Agent Harness: the shared runtime and policy layer for chat turns, jobs, events, tools,
  context, approvals, audit, and plugin-provided capabilities.
- Capability: a typed action or readable surface contributed by Core or a plugin.
- Skill or resource: instructions or reference material that help the agent do work, but
  never grant permissions by themselves.
- Recipe: an internal starter template for a job.
- Job: an owner-confirmed routine with trigger, scope, actions, destination, and policy.
- Run: one execution attempt for a chat action, job, or event-triggered action.
- Context packet: source-labeled context assembled before the agent answers or acts.
- Approval: a visible owner decision before sensitive side effects.
- Plugin: owns its setup, routes, UI slots, data, capabilities, optional skills, and optional
  starter recipes.

## Current State

| Area | State | Main Risk | Tracking |
| --- | --- | --- | --- |
| Core chat actions | Partial parity. Reminder create/list and booking lookup have started. | Hosted actions could be ported unevenly without shared capability/audit policy. | `me3-tlt` |
| Assistant Jobs | Schema, API, UI, starter recipes, runner lifecycle, Mission Control activity writes, Daily Briefing owner notification, and Inbox Watch mailbox-backed execution exist. | Jobs still look more complete than they are: schedules, heartbeat, richer model/provider adapters, and QA remain unfinished. | `me3-wsn` |
| Setup readiness | Validation supports setup requirements. Owner notifications resolve from active Soulink, email resolves from an active mailbox, and calendar resolves from the enabled Calendar plugin. | Future plugin-owned capabilities need the same resolver pattern so job setup does not drift from Account/Plugins state. | `me3-wsn.26` |
| Starter job QA | Final manual QA pass. Daily Briefing and Invoice and Receipt Triage are satisfactory for now. Weekly Review and Inbox Watch run and write Mission Control activity, but still need sharper owner-facing outcomes. | Custom builder would expose unfinished behavior if started before Weekly Review and Inbox Watch outcomes are designed. | `me3-wsn.25`, `me3-wsn.15`, `me3-wsn.30` |
| Context and memory | Native context packet contract, resolvers, manifests, chat wiring, memory review, and job-run wiring exist. | Scheduled jobs and model-backed job outputs still need richer context use. | `me3-ctx.8` |
| Capability model | Assistant Jobs capabilities and plugin `agentTools` both exist. | Two registries can drift and weaken safety/setup behavior. | `me3-q6s.2`, new capability-unification work |
| Mission Control | Good base workspace direction for results, approvals, memory, activity, projects, and run records. Activity now has a testing clear action for run/plugin activity. | Result surfaces and project-level job activity are still incomplete. | `me3-q6s.3`, `me3-wsn.14` |
| Safety and audit | Assistant Jobs safety policy exists and should become the shared harness policy. | Enforcement is not yet uniformly shared by chat actions, jobs, plugins, events, and retries. | `me3-q6s.2` |
| Scheduler and reliability | Assistant Job event ingress uses Cloudflare Queues and a DLQ. Heartbeat/reconciliation design exists. Schedule editing is the first active `me3-wsn.11` slice. | Manual runs are synchronous, due scheduled jobs are not dispatched yet, and plugin queues such as booking reminders/social publishing are not wired in Core. | `me3-wsn.11`, `me3-wsn.22`, `me3-tlt.1`, `me3-1dr.1` |
| Delivery channels | Soulink assistant chat can provision a stable Stream chat, send a welcome message, dispatch owner messages to ME3 Core, post assistant replies, and accept Core job notifications through `/api/me3/assistant-channel/notify`. Daily Briefing Run now delivers to the owner's Soulink chat. | Remaining delivery QA should focus on richer provider-backed jobs and failure visibility. | `me3-wsn.13`, `me3-wsn.25` |
| Plugin expansion | Plugin manifests expose routes, UI slots, permissions, and `agentTools`. | Plugins need one capability contract plus optional skills/resources/recipes. | `me3-3ul`, `me3-q6s.2` |
| Local executor | MVP path is now in Core: optional `me3.local-executor` activation, Account Configure modal, source-checkout runner pairing, local project creation from Mission Control Projects, and task-level Run locally queueing. Provider choice now belongs in local runner config, not project UI. | Still needs long-running daemon mode, richer result panels, packaged local runner install, and Assistant Job starter/scheduled approval wiring. | `me3-wsn.28` |

Soulink should now be treated as the primary portable assistant chat transport for harness work.
The current milestone proves the channel plumbing: ME3 Core activation provisions one stable
assistant Stream chat in Soulink, Soulink relays owner messages to
`/api/agent/channels/soulink/dispatch`, replies are posted back as the ME3 Assistant, and Core can
post owner notifications through Soulink's `/api/me3/assistant-channel/notify` route. Remaining
reply failures should be treated as harness/model-provider issues unless channel logs show a
transport error.

## Roadmap

### Phase 1: Stabilize The Shared Harness

- Make this document the first planning reference for agent harness work.
- Keep detailed implementation specs as references, not competing product roadmaps.
- Unify Assistant Jobs capabilities and plugin `agentTools` into one internal capability
  contract.
- Extend the setup-readiness resolver pattern from owner notifications, email, and calendar
  to local daemon and future plugin-owned providers.
- Route chat actions and job actions through the same capability, approval, and audit policy.

Primary beads: `me3-q6s.2`, `me3-wsn.26`, `me3-3ul`.

### Phase 2: QA Existing Starter Jobs Before Custom Builder

Status: final manual verification pass. Daily Briefing and Invoice and Receipt Triage are
satisfactory for now; Weekly Review and Inbox Watch need outcome design before this phase should
be considered fully complete. Test only the current visible starter set:

1. Daily Briefing - added, run, Mission Control activity written, Soulink notification delivered.
2. Weekly Review - added, run, Mission Control activity written.
3. Inbox Watch - added, run, reads active mailbox messages, writes mailbox summaries/labels, and creates Mission Control activity/run summaries with message and thread counts.
4. Invoice and Receipt Triage

For each starter, record whether it can be added, opened, run, blocked with a clear reason,
and surfaced in Mission Control. For provider-backed jobs, also record whether the output is
useful enough to act on without reading raw provider data. Do not start the custom builder until
this pass is complete.

Primary bead: `me3-wsn.25`.

Latest QA notes, 2026-06-02:

- Daily Briefing runs, sends a Soulink message when connected, and writes succeeded activity in
  Mission Control. When Soulink is disconnected, the result remains visible in Mission Control.
- Inbox Watch runs and writes Mission Control activity such as "Inbox Watch reviewed 6 inbox
  messages across 6 threads; 1 needs a reply and 0 flagged important." Next outcome work should
  let owners define matching rules and approval-first draft reply actions.
- Invoice and Receipt Triage runs and writes Mission Control activity such as "Invoice and Receipt
  Triage added 0 account entries; 0 need review and 6 skipped." Satisfactory for now.
- Weekly Review runs and writes Mission Control activity such as "Weekly Review ran successfully
  and created a Mission Control result." It still needs a real weekly review outcome and UI.

### Phase 3: Finish Core Chat Actions

- Finish reminder update/cancel/list behavior.
- Add booking creation or booking handoff behavior.
- Add mailbox draft actions.
- Add contact create/update actions.
- Add profile/site update proposals with approval boundaries.
- Ensure every action has structured audit, permission checks, and approval behavior.

Primary bead: `me3-tlt`.

### Phase 4: Make Jobs Operational

- Implement scheduled/manual/event trigger behavior.
- Implement heartbeat and reconciliation.
- Add owner notification delivery through the current client/Soulink channel.
- Expand concrete email/calendar adapters beyond the first mailbox-backed Inbox Watch path.
- Add scheduled-job dispatch and plugin delivery queues where the side effect must survive retries
  or outlive the HTTP request. Current gaps: Core booking reminders (`me3-tlt.1`) and Social
  Publishing external publish dispatch (`me3-1dr.1`).
- Improve run history, failure surfacing, and Mission Control links.
- Add tests and evals for blocked, approval-required, retry, and setup-missing paths.

Primary beads: `me3-wsn.10`, `me3-wsn.11`, `me3-wsn.12`, `me3-wsn.13`,
`me3-wsn.16`, `me3-wsn.18`, `me3-wsn.22`.

### Phase 5: Deepen Context And Memory

- Update job execution prompts to use richer context packets.
- Make scheduled jobs carry context manifests into result surfaces.
- Keep durable memory owner-visible and approval-aware.
- Show concise "used context from..." summaries where useful.

Primary bead: `me3-ctx.8`.

### Phase 6: Add Plugin-Owned Capabilities

- Let plugins export capabilities, setup checks, optional skills/resources, and optional
  starter recipes.
- Keep side effects behind the shared approval/audit layer.
- Use the Local Executor reference to prove a plugin-owned local capability without exposing
  raw local file or shell primitives in the first public job surface.
- Prove the pattern with a first-party plugin such as social publishing only after the
  Core harness is dependable.

Primary beads: `me3-3ul`, `me3-q6s.2`, social publishing follow-up work.

## Current Visible Starter Jobs

These are the only starter jobs that should appear in the Add Job UI for now.

| Starter | Current intent | Current blocker |
| --- | --- | --- |
| Daily Briefing | Prepare a daily Mission Control briefing and notify the owner through Soulink. | Satisfactory for now: run writes Mission Control activity and sends Soulink notification when connected. |
| Weekly Review | Summarize the week and carry-over choices. | Runs, but needs a real owner-facing review surface, carry-over actions, memory suggestions, and optional Soulink summary. |
| Inbox Watch | Get notified or take action when specific people email you. | First mailbox-backed path landed; next work is owner-authored rules and approval-first draft reply/actions. |
| Invoice and Receipt Triage | Extract receipts and invoices and add them to an accounts ledger. | Satisfactory for now: run writes Mission Control activity and can create Accounts entries for likely invoices/receipts. |

Do not reintroduce standalone starters such as Project Digest, Approval Sweep, Memory Review,
Setup Health Check, Relationship Follow-Up, Source Monitor, Email Watch, or Booking Reminder
until they have a clear owner-facing reason and concrete execution path.

## Documentation Map

Use this document for planning and current truth.

Detailed reference docs:

- `docs/assistant-jobs-schema.md`: persistence and run schema reference.
- `docs/assistant-jobs-capability-registry.md`: capability registry reference.
- `docs/assistant-jobs-safety.md`: safety and approval policy reference.
- `docs/assistant-jobs-heartbeat.md`: heartbeat and reconciliation reference.
- `docs/assistant-job-creation-capability.md`: custom job builder reference.
- `docs/assistant-jobs-and-agent-skills.md`: skill/recipe/job/capability boundary.
- `docs/agent-context-roadmap.md`: native context and memory design reference.
- `docs/local-executor-assistant-job.md`: optional local executor plugin and daemon reference.
- `docs/mission-control-plugin-mvp.md`: Mission Control workspace/plugin reference.
- `docs/soulink-agent-chat-spike.md`: Soulink assistant chat channel reference.

Retired stale docs:

- `docs/assistant-jobs.md`
- `docs/assistant-jobs-ux.md`
- `docs/assistant-jobs-starter-recipes.md`
- `docs/agent-context-progress.md`

## Update Rules

- Update this document when a harness phase changes status.
- Keep bead notes for detailed session history; keep this file for the readable map.
- If a detailed reference doc disagrees with this file, this file wins.
- If UI language starts exposing internal nouns, treat it as a product bug.
- If a plugin adds agent functionality, record the capability/setup/safety path here.
