# Assistant Jobs Safety and Approval Policy

Source of truth: bead `me3-wsn.17` under parent `me3-wsn`.

Assistant Jobs run in the background, so the safety model has to be boring, visible, and conservative.

The rule of thumb:

- Jobs may observe, summarize, classify, and draft inside their granted scope.
- Jobs may write private ME3 workspace records when the job says it can.
- Jobs need approval before external side effects, destructive changes, durable private memory writes, or anything money/account related.
- Jobs fail closed when permissions, setup, provider state, or ownership is unclear.

## Goals

The policy should let useful jobs run without turning every small summary into an approval chore. It should also make it very hard for a job to surprise the owner.

Safety goals:

- The owner can tell what a job is allowed to read and do before saving it.
- The job runner can decide whether an action is allowed without natural-language guessing.
- Risky actions produce Mission Control approvals with useful previews.
- Denied and blocked actions are visible in run history.
- Plugins cannot smuggle broad permissions through friendly labels.
- Provider setup and account state are checked before actions run.

Non-goals for this bead:

- Implementing validators, queues, routes, or UI.
- Creating a complete enterprise policy language.
- Allowing silent sends, purchases, deletes, or public publishing in Core v1.

## Approval Modes

`none`: The action can complete without a separate owner decision when the job has permission. Use for reads, summaries, and low-risk internal records.

`review_required`: The action creates or updates private workspace records that should be checked later but can be stored now. Use for review packets, draft tasks, suggested labels, and extracted metadata.

`approval_required`: The action cannot complete until the owner approves it. Use for sends, external writes, durable memory writes, local file writes, shell commands, publishing, booking, payments, deletes, and account changes.

`forbidden`: The action is not available for jobs, even with approval, until a later product policy explicitly allows it. Use for secrets export, permission escalation, hidden provider changes, destructive bulk actions, and anything that would bypass owner review.

## Side-Effect Classes

Capabilities and actions must declare one side-effect class:

| Class | Meaning | Default approval |
| --- | --- | --- |
| `read_private` | Reads owner-private ME3 or plugin data. | `none` if scoped |
| `read_external` | Reads from a connected provider. | `none` if scoped |
| `write_internal_draft` | Creates private draft or review data. | `review_required` |
| `write_internal_active` | Creates active private workspace records. | `none` or `review_required` by capability |
| `memory_write` | Creates durable private memory. | `approval_required` |
| `notify_owner` | Sends a message only to the owner. | `none` if explicitly configured |
| `external_draft` | Drafts a provider-side message or record without sending. | `review_required` |
| `external_write` | Changes a provider-side system. | `approval_required` |
| `external_send` | Sends to another person or channel. | `approval_required` |
| `public_publish` | Publishes public content or profile changes. | `approval_required` |
| `destructive` | Deletes, archives, cancels, revokes, or overwrites data. | `approval_required` or `forbidden` |
| `money_or_account` | Payments, invoices, subscriptions, billing, account settings. | `approval_required` or `forbidden` |
| `local_read` | Reads approved local daemon paths. | `approval_required` in Core v1 |
| `local_write` | Writes approved local daemon paths. | `approval_required` |
| `local_shell` | Runs approved local commands. | `approval_required` |
| `permission_change` | Changes permissions, grants, secrets, provider connections. | `forbidden` for jobs |

## Preview-Only Actions

Preview-only actions are allowed to prepare work but not commit it externally.

Examples:

- Draft an email reply in Mission Control.
- Extract invoice fields into a review packet.
- Suggest a calendar event without creating it.
- Suggest a memory entry without activating it.
- Prepare a public-site update without publishing it.

Preview-only actions must store enough context for a person to decide:

- What the job saw.
- What it wants to do.
- What would change if approved.
- Which provider or ME3 surface is involved.
- Any uncertainty or missing setup.

## Explicit-Send Actions

Any action that sends content outside the owner's private ME3 install is explicit-send.

Explicit-send includes:

- Sending email.
- Sending a client or Telegram message to another person.
- Publishing a page or social post.
- Booking, rescheduling, or cancelling a meeting with external attendees.
- Submitting a payment, invoice, refund, or subscription change.

Explicit-send actions always create an approval in Core v1. The approval must show the recipient, channel, subject or title, body preview, attachments or linked artifacts, and the job/run that produced it.

## Destructive Actions

Destructive actions include delete, archive, cancel, revoke, overwrite, unsubscribe, disconnect, and permission removal.

Core v1 should prefer not to expose destructive actions to jobs. If a later plugin needs one, the action must:

- Be narrow and capability-specific.
- Require approval.
- Include before/after preview where possible.
- Record an audit event whether approved or denied.
- Never run as a quiet retry after denial.

Bulk destructive actions are `forbidden` until a separate policy exists.

## Per-Job Permissions

Every saved job needs an owner-visible permission summary:

- Scope: all Mission Control, a project, a source, a provider account, a label, or a narrow filter.
- Reads: which capabilities can read data.
- Writes: which internal records can be created or updated.
- External actions: which provider actions can be drafted or requested.
- Approval policy: which actions run, create reviews, or require approval.
- Destination: where outputs land in Mission Control.

The job runner should treat the saved permission summary as a contract. If a recipe changes, plugin capabilities change, or setup is missing, the job should pause or move to needs setup instead of widening itself.

## Restricted Capabilities

These are not job-safe by default:

- Reading secrets, tokens, raw auth sessions, or install keys.
- Changing plugin permissions or provider credentials.
- Sending to new recipients not covered by the job scope.
- Publishing public identity changes to `me.json`.
- Writing durable memory without approval.
- Running shell commands or local file writes without a daemon permission and approval.
- Making payments, refunds, or subscription changes without approval.
- Deleting or bulk editing provider records.

If a plugin registers one of these capabilities, the registry must mark it `approval_required` or `forbidden`.

## Audit Logging

Every run should record:

- Trigger reason and source.
- Job version.
- Capabilities used.
- Inputs read at a summary level.
- Actions attempted.
- Actions completed.
- Actions blocked or denied.
- Approval IDs created.
- External provider IDs returned after approved side effects.
- Error and retry state.

Audit records should be useful to owners and developers. The owner-facing summary can be plain English, but the stored event should be structured enough for tests and future tooling.

## User-Facing Explanations

Owners should see safety in direct language:

- "This job can read Mission Control tasks in Project X."
- "This job can create review packets and draft tasks."
- "This job will ask before sending email."
- "This job cannot delete provider data."
- "This job needs Email setup before it can run."

Avoid labels like OAuth scope names, queue names, or raw schema fields in the product surface.

## Failure Rules

Jobs fail closed when:

- A capability is unknown.
- A plugin is disabled.
- Provider setup is missing.
- Permission scope cannot be checked.
- A requested action is broader than the saved job permission.
- The action approval mode cannot be resolved.
- The run is a retry after owner denial.
- The job version changed while the run was pending approval.

Failure should create a run event and, when owner action is needed, Mission Control activity.

## Required Tests Later

Implementation should add tests for:

- A read-only job cannot write.
- A review job creates review packets without sending externally.
- Explicit-send actions create approvals and do not send before approval.
- Denied approvals do not retry side effects.
- Durable memory writes require approval.
- Unknown capabilities fail closed.
- Disabled plugins fail closed.
- Provider setup missing moves the job to needs setup or blocked run state.
- Destructive actions are blocked unless a capability explicitly allows approval-gated use.
- Job permission changes do not affect already recorded run audit facts.

These tests belong with the runtime implementation and the broader job eval coverage in `me3-wsn.18`.
