# Assistant Jobs Starter Recipe Library

Source of truth: bead `me3-wsn.5` under parent `me3-wsn`.

Starter recipes are editable templates. They help the owner start from a useful shape without making Assistant Jobs a fixed list of job types.

Every starter creates a normal job draft. The owner can edit the trigger, scope, destination, actions, and approval policy before saving.

## Recipe Defaults

Each starter recipe should define:

- Name.
- Plain-language outcome.
- Default trigger.
- Default scope.
- Default destination.
- Required capabilities.
- Optional capabilities.
- Approval behavior.
- Setup state if requirements are missing.

Recipe IDs should be stable, lowercase, and not tied to hosted-only features.

## Core V1 Recipes

### Daily Briefing

Outcome: prepare a morning review of today's tasks, approvals, due items, and recent project activity.

Default trigger: daily schedule at owner-selected morning time.

Default destination: Mission Control review packet.

Required capabilities:

- `mission.task.read`
- `mission.approval.read`
- `mission.review_packet.create`
- `mission.activity.create`

Approval behavior: no external action. Creates review packet without extra approval.

### Weekly Review

Outcome: gather unfinished tasks, completed work, pending approvals, project changes, and carry-over decisions.

Default trigger: weekly schedule, Friday afternoon or Sunday evening by owner choice.

Default destination: Mission Control review packet, optionally scoped to all projects or one project.

Required capabilities:

- `mission.project.read`
- `mission.task.read`
- `mission.approval.read`
- `mission.review_packet.create`
- `mission.activity.create`

Optional capabilities:

- `message.owner.notify`

Approval behavior: can notify owner if enabled. External sends require approval.

### Task Carry-Over

Outcome: collect unfinished tasks and prepare tomorrow or next-week carry-over choices.

Default trigger: daily or weekly schedule.

Default destination: Mission Control review packet with linked tasks.

Required capabilities:

- `mission.task.read`
- `mission.review_packet.create`
- `mission.task.create`

Approval behavior: creating active tasks can be allowed when scoped to Mission Control; bulk changes or external sync require approval.

### Project Digest

Outcome: summarize what changed in a project and what needs attention.

Default trigger: weekly schedule or manual.

Default destination: Mission Control project review packet.

Required capabilities:

- `mission.project.read`
- `mission.task.read`
- `mission.review_packet.create`
- `mission.activity.create`

Optional capabilities:

- `daemon.metadata.read`
- `daemon.file.read`

Approval behavior: local daemon reads require approval in Core v1.

### Approval Sweep

Outcome: gather pending approvals and stale decisions into one review packet.

Default trigger: daily schedule or manual.

Default destination: Mission Control review packet.

Required capabilities:

- `mission.approval.read`
- `mission.review_packet.create`
- `mission.activity.create`

Approval behavior: resolving approvals remains owner action in Mission Control.

### Memory Review

Outcome: gather useful memory suggestions from recent work without silently making them durable.

Default trigger: weekly schedule or manual.

Default destination: Mission Control memory review.

Required capabilities:

- `mission.project.read`
- `mission.task.read`
- `mission.memory.suggest`
- `mission.review_packet.create`

Approval behavior: activating durable memory requires approval.

### Setup Health Check

Outcome: show jobs, providers, or capabilities that need setup before they can run.

Default trigger: daily schedule or manual.

Default destination: Mission Control activity or review packet only when action is needed.

Required capabilities:

- `assistant.job.validate`
- `mission.activity.create`
- `mission.review_packet.create`

Approval behavior: no external action. Quiet if healthy.

### Source Monitor

Outcome: watch a connected source for relevant changes and prepare a review item.

Default trigger: event-driven when source support exists, manual or scheduled scan otherwise.

Default destination: Mission Control review packet or activity.

Required capabilities:

- Source-specific read capability.
- `mission.review_packet.create`
- `mission.activity.create`

Approval behavior: source reads must be scoped. External writes and sends require approval.

## Later Provider Recipes

### Email Watch

Outcome: create a Mission Control review item when important email arrives.

Default trigger: email event.

Required capabilities:

- `email.message.read`
- `mission.review_packet.create`
- `mission.activity.create`

Optional capabilities:

- `message.owner.notify`
- `email.reply.draft`

Approval behavior: drafts are review-required. Sending is approval-required.

### Email Triage

Outcome: summarize inbox messages that need the owner and draft replies where useful.

Default trigger: schedule or email event batch.

Required capabilities:

- `email.message.read`
- `email.thread.summarize`
- `mission.review_packet.create`

Optional capabilities:

- `email.reply.draft`
- `mission.task.create`

Approval behavior: replies are drafts. Sending requires approval.

### Invoice and Receipt Triage

Outcome: find likely invoices and receipts, extract useful fields, and create review tasks.

Default trigger: email event or recurring scan.

Required capabilities:

- `email.message.read`
- `mission.review_packet.create`
- `mission.task.create`

Optional capabilities:

- Accounts or bookkeeping plugin capabilities when installed.

Approval behavior: payment, bookkeeping writes, and sends require approval.

### Relationship Follow-Up

Outcome: show people the owner may want to follow up with.

Default trigger: weekly schedule.

Required capabilities:

- A contacts, email, calendar, or messaging adapter when installed.
- `mission.review_packet.create`
- `mission.task.create`

Approval behavior: creates review suggestions and tasks. Sending messages requires approval.

### Booking Reminder

Outcome: prepare context before a meeting or booking and create follow-up tasks after.

Default trigger: calendar event or schedule.

Required capabilities:

- `calendar.event.read`
- `mission.review_packet.create`
- `mission.task.create`

Optional capabilities:

- `email.thread.summarize`
- `message.owner.notify`

Approval behavior: booking, rescheduling, cancellation, or external messages require approval.

## Recipe States

Recipes can appear as:

- `ready`: all required capabilities are available.
- `needs_setup`: useful but requires provider setup.
- `manual_only`: can run manually but cannot watch events yet.
- `coming_later`: visible only if the product wants to hint at future adapters.

Core v1 should prefer `ready` and `needs_setup` over a large coming-soon catalog.

## Conversion to Jobs

When the owner uses a starter:

1. Create a draft from recipe defaults.
2. Ask for missing scope, trigger, or project only when needed.
3. Validate required capabilities and setup.
4. Show the permission summary.
5. Save as active, draft, or needs setup after owner confirmation.

The saved job should not keep relying on mutable recipe defaults. It gets its own immutable version snapshot.

## Initial Ordering

Recommended order on `/assistant`:

1. Weekly Review
2. Daily Briefing
3. Task Carry-Over
4. Project Digest
5. Approval Sweep
6. Memory Review
7. Setup Health Check
8. Email Watch
9. Email Triage
10. Invoice and Receipt Triage
11. Relationship Follow-Up
12. Source Monitor

This order starts with Core/Mission Control value before provider-dependent jobs.
