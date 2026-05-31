# ME3 Agent Harness Roadmap

Last updated: 2026-05-31

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
| Assistant Jobs | Schema, API, UI, starter recipes, runner lifecycle, and Mission Control activity writes exist. | Jobs still look more complete than they are: setup readiness, schedules, heartbeat, notifications, adapters, and QA remain unfinished. | `me3-wsn` |
| Setup readiness | Validation supports setup requirements, but Worker calls do not yet pass real readiness state. | Provider-backed jobs can show `Needs setup` even when Account setup is ready. | `me3-wsn.26` |
| Starter job QA | Not complete. Daily Briefing currently creates Mission Control output only. | Custom builder would expose unfinished behavior if started before starter QA. | `me3-wsn.25` |
| Context and memory | Native context packet contract, resolvers, manifests, chat wiring, memory review, and job-run wiring exist. | Scheduled jobs and model-backed job outputs still need richer context use. | `me3-ctx.8` |
| Capability model | Assistant Jobs capabilities and plugin `agentTools` both exist. | Two registries can drift and weaken safety/setup behavior. | `me3-q6s.2`, new capability-unification work |
| Mission Control | Good base workspace direction for results, approvals, memory, activity, projects, and run records. | Result surfaces and project-level job activity are still incomplete. | `me3-q6s.3`, `me3-wsn.14` |
| Safety and audit | Assistant Jobs safety policy exists and should become the shared harness policy. | Enforcement is not yet uniformly shared by chat actions, jobs, plugins, events, and retries. | `me3-q6s.2` |
| Scheduler and reliability | Heartbeat/reconciliation design exists. | Due jobs, stuck runs, missed events, provider-watch renewal, and DLQ surfacing are not implemented. | `me3-wsn.11`, `me3-wsn.22` |
| Delivery channels | Soulink assistant chat spike exists; Assistant Jobs notification action is not implemented. | Daily Briefing cannot yet prove owner-message delivery through Soulink. | `me3-wsn.13`, Soulink follow-up |
| Plugin expansion | Plugin manifests expose routes, UI slots, permissions, and `agentTools`. | Plugins need one capability contract plus optional skills/resources/recipes. | `me3-3ul`, `me3-q6s.2` |

## Roadmap

### Phase 1: Stabilize The Shared Harness

- Make this document the first planning reference for agent harness work.
- Keep detailed implementation specs as references, not competing product roadmaps.
- Unify Assistant Jobs capabilities and plugin `agentTools` into one internal capability
  contract.
- Add setup-readiness resolvers for email, calendar, owner notifications, local daemon,
  and plugin-owned providers.
- Route chat actions and job actions through the same capability, approval, and audit policy.

Primary beads: `me3-q6s.2`, `me3-wsn.26`, `me3-3ul`.

### Phase 2: QA Existing Starter Jobs Before Custom Builder

Test only the current visible starter set:

1. Daily Briefing
2. Weekly Review
3. Email Triage
4. Invoice and Receipt Triage

For each starter, record whether it can be added, opened, run, blocked with a clear reason,
and surfaced in Mission Control. Do not start the custom builder until this pass is complete.

Primary bead: `me3-wsn.25`.

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
- Add concrete email and calendar adapters.
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
- Prove the pattern with a first-party plugin such as social publishing only after the
  Core harness is dependable.

Primary beads: `me3-3ul`, `me3-q6s.2`, social publishing follow-up work.

## Current Visible Starter Jobs

These are the only starter jobs that should appear in the Add Job UI for now.

| Starter | Current intent | Current blocker |
| --- | --- | --- |
| Daily Briefing | Prepare a daily Mission Control briefing. | No owner notification action yet. |
| Weekly Review | Summarize the week and carry-over choices. | Needs full QA and result surface review. |
| Email Triage | Summarize inbox messages and draft useful replies. | Setup readiness and concrete email adapter work. |
| Invoice and Receipt Triage | Find likely invoices/receipts and create review tasks. | Setup readiness and concrete email extraction path. |

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
