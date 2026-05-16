# Assistant Jobs Product Model

Source of truth: bead `me3-wsn.1` under parent `me3-wsn`.

Assistant Jobs are boring, repeatable jobs created with the assistant, for the assistant.

Page title: `Assistant Jobs`

Subtitle: `Create boring jobs with your assistant, for your assistant.`

The product split should stay simple:

- `/assistant` is where the owner creates, edits, pauses, runs, and understands jobs.
- Mission Control is where the consequences of those jobs land: review packets, tasks, approvals, memory suggestions, project updates, activity, and run history.

Assistant Jobs should feel like asking a capable helper to take responsibility for small repeated work. It should not feel like building an automation graph, configuring cloud infrastructure, or choosing from a pile of fixed job types.

## Product Intent

Assistant Jobs give ME3 owners a way to turn repeatable work into editable assistant routines.

A job can be as small as "every Friday, make my weekly review packet" or as specific as "when a new invoice email arrives, extract the amount, draft a task, and ask me before sending anything." The owner should describe the outcome in plain language. The assistant should translate that into a draft job, explain what it will read and do, and save only after the owner confirms.

The first version should optimize for trust and obviousness:

- Jobs are owner-created or owner-confirmed.
- Jobs are editable and pausable.
- Jobs use visible capabilities from Core and installed plugins.
- Jobs keep a readable run history.
- Jobs send review work to Mission Control instead of hiding it inside the builder.
- Risky actions ask for approval before they happen.

## What `/assistant` Is For

`/assistant` is the Assistant Jobs home.

It answers three owner questions:

1. What jobs do I have?
2. What are they allowed to do?
3. What happened the last time they ran?

The page should include:

- The title and subtitle above.
- An `Add job` entry point that opens an agent-led creation flow.
- A clean list or table of active and paused jobs.
- Starter jobs that can be copied into editable job instances.
- Job detail for purpose, trigger, scope, permissions, approvals, destination, recent runs, and next run.
- Basic controls: run now, pause or resume, edit, duplicate, delete.

`/assistant` is not the place for reviewing every output. It can preview the latest run and link to full history, but owner decisions should happen in Mission Control.

## What Mission Control Is For

Mission Control is the owner's private workbench for things that need attention.

Assistant Jobs use Mission Control as their default destination because job outputs are not just logs. They are often decisions, drafts, follow-ups, memory candidates, or project updates.

Mission Control should receive:

- Review packets for grouped job outputs.
- Tasks and captures created by jobs.
- Approval requests for risky or owner-confirmed actions.
- Private memory suggestions that need review.
- Project activity and recent run summaries.
- Health warnings when a job cannot run, needs setup, or has repeated failures.

Mission Control is not the job builder. It can show related jobs from a project or run, but editing the job belongs in `/assistant`.

## Core Nouns

`Capability`: Something Core or an installed plugin says the assistant can do, with clear read/write/send risk and approval metadata. Examples: create a Mission Control task, draft an email, request approval, read calendar events.

`Recipe`: An editable template for a useful kind of job. A recipe is not a hardcoded job type. It gives the agent a strong starting shape that the owner can customize.

`Job`: An owner-confirmed recipe instance. It has a purpose, trigger, scope, rules, actions, approval policy, destination, project relationship, status, and run history.

`Trigger`: The thing that starts a job. User-facing trigger language should stay simple: "When I ask", "On a schedule", or "When something happens."

`Rule`: A condition or guardrail the job uses to decide what matters. Examples: only include overdue tasks, only watch emails from a client domain, only create a review packet if something changed.

`Action`: A thing the job tries to do through a capability. Examples: create a task, prepare a review packet, draft a reply, request approval, write a memory suggestion.

`Approval`: A visible owner decision required before a risky action completes. Jobs may draft freely inside their permission boundary, but sending, publishing, deleting, paying, booking, or changing external systems should require approval unless a later policy explicitly allows a narrow exception.

`Run`: One execution of a job. A run records why it started, what it considered, what it produced, which actions succeeded, which approvals were requested, and whether anything failed.

`Artifact`: A durable output from a run, such as a review packet, draft, extracted summary, file reference, or structured result.

`Project`: A Mission Control container for related work. Jobs may be scoped to a project and should land relevant outputs back on that project.

`Review packet`: A Mission Control artifact that gathers job output into something the owner can scan, decide on, and clear. It is the preferred shape for summaries, digests, triage, and weekly reviews.

## Starter Jobs

Starter jobs are recipe templates. They should be useful out of the box, but every starter creates a normal editable job.

The first set should favor jobs that are easy to explain:

| Starter | Owner wording | First version |
| --- | --- | --- |
| Daily plan | "Every morning, show what needs my attention today." | Core v1 |
| Weekly review | "Every Friday, make a packet of unfinished tasks, project updates, and decisions." | Core v1 |
| Task carry-over | "Move unfinished tasks into tomorrow's review." | Core v1 |
| Project digest | "Summarize what changed on this project this week." | Core v1 |
| Approval sweep | "Show approvals I still need to decide on." | Core v1 |
| Memory review | "Collect useful memory suggestions before they become durable." | Core v1 |
| Setup health check | "Tell me when a provider or job needs setup." | Core v1 |
| Email watch | "When an important client emails, make a review item." | Later provider adapter |
| Email triage | "Summarize my inbox and draft replies for the messages that need me." | Later provider adapter |
| Invoice and receipt triage | "Find bills and receipts, extract the amount, and create review tasks." | Later provider adapter |
| Relationship follow-up | "Remind me who I should follow up with this week." | Later provider adapter |
| Booking reminder | "Before a meeting or booking, prepare the context and follow-up task." | Later provider adapter |

Core v1 should prove the model with Mission Control data, manual runs, simple schedules, review packets, tasks, approvals, memory suggestions, activity, and run history. Later provider adapters can add email, calendar, payments, CRM, messaging, files, and hosted-only conveniences without changing the product model.

## Job List and Detail

The job list should be a management surface, not a dashboard stuffed with every run result.

Useful list columns or cells:

- Job name and short purpose.
- Status: active, paused, needs setup, failing, or draft.
- Trigger summary: manual, schedule, or event.
- Destination: usually Mission Control, optionally scoped to a project.
- Next run or latest event.
- Last run result.
- Approval state, if something is waiting.

Job detail should make the job understandable in plain English:

- What this job is trying to do.
- When it runs.
- What it can read.
- What it can change.
- What always requires approval.
- Where outputs land.
- Recent runs and linked Mission Control outputs.
- Controls for run now, pause, edit, duplicate, delete.

The detail view can include structured internals later, but the default owner-facing view should read like a responsibility card for the assistant.

## Add Job Agent Flow

The `Add job` flow should be agent-led.

The owner can start from a starter job or plain language:

```text
Make a weekly review for my client projects every Friday afternoon.
```

The assistant should:

1. Restate the intended job in plain English.
2. Ask only the clarifying questions needed to make the job safe and useful.
3. Suggest a recipe or draft a custom job.
4. Show what the job will read, what it may create, and what needs approval.
5. Choose a Mission Control destination and project scope.
6. Show a final confirmation summary.
7. Save the job only after explicit owner confirmation.

The assistant should not present raw schema, queue names, cron syntax, or plugin internals in this flow. When setup is missing, it should say what connection is needed and save the job as draft or needs setup only if that is useful to the owner.

## How Jobs Land in Mission Control

Every job should have a clear output destination.

Default destination: Mission Control.

Common landing patterns:

- A digest job creates a review packet.
- A triage job creates a review packet plus tasks for follow-up.
- A risky action creates an approval request.
- A memory-oriented job creates memory suggestions, not silent memory writes.
- A project-scoped job writes activity and outputs under that project.
- A failed or unhealthy job creates visible Mission Control activity when the owner needs to act.

`/assistant` links back to these outputs from job detail and run history. Mission Control links back to the job that created them when the owner wants to edit the routine.

## V1

V1 should establish the product model before deep infrastructure:

- `/assistant` has the Assistant Jobs framing, job list contract, starter recipes, job detail contract, and Add job flow contract.
- Jobs are recipe instances, not fixed job types.
- Core v1 recipes focus on Mission Control-owned data and outputs.
- Jobs can create review packets, tasks, approvals, memory suggestions, activity, and run summaries in Mission Control.
- Job creation requires explicit owner confirmation.
- Risky actions require approval by default.
- Missing provider setup is visible and understandable.

V1 should avoid pretending that every provider is already connected. It should make the simple Core jobs feel real first.

## Later

Later work can extend the same model with:

- Provider adapters for email, calendar, messaging, payments, files, CRM, publishing, and other plugin-owned systems.
- Event-driven provider watches.
- More advanced permission presets.
- Shared recipe marketplace or first-party recipe catalog.
- Hosted ME3 Cloud conveniences that do not leak hosted-only assumptions into Core.
- Richer run artifacts and exportable review packets.
- Smarter job suggestions based on repeated owner behavior.

The product rule stays the same: `/assistant` manages routines; Mission Control handles the work those routines produce.

## Immediate Follow-On Specs

The next specs should land in this order:

1. `me3-wsn.17` - safety, approval, and permission policy: [`docs/assistant-jobs-safety.md`](assistant-jobs-safety.md).
2. `me3-wsn.2` - job schema, recipe model, and migrations: [`docs/assistant-jobs-schema.md`](assistant-jobs-schema.md).
3. `me3-wsn.3` - capability registry and job action manifest: [`docs/assistant-jobs-capability-registry.md`](assistant-jobs-capability-registry.md).
4. `me3-wsn.4` - agent custom job creation capability: [`docs/assistant-job-creation-capability.md`](assistant-job-creation-capability.md).
5. `me3-wsn.6` - Assistant Jobs page and builder UX: [`docs/assistant-jobs-ux.md`](assistant-jobs-ux.md).
6. `me3-wsn.22` - heartbeat and reconciliation design: [`docs/assistant-jobs-heartbeat.md`](assistant-jobs-heartbeat.md).

The starter recipe library lives in [`docs/assistant-jobs-starter-recipes.md`](assistant-jobs-starter-recipes.md).

Implementation should begin only after those boundaries are clear enough that the architecture can stay boring.
