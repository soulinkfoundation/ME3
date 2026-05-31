# Assistant Jobs Capability Registry

Source of truth: bead `me3-wsn.3` under parent `me3-wsn`.

The capability registry tells Assistant Jobs what the assistant can do.

It is not a list of prompts. It is a typed manifest of readable and callable actions contributed by Core and installed plugins, with side-effect and approval metadata.

## Goals

The registry should let three systems agree:

- The Add job agent knows what it can offer.
- The job validator knows whether a draft is safe and possible.
- The job runner knows whether an action is allowed at execution time.

Every capability must be explicit about:

- Who owns it.
- What it can read.
- What it can change.
- Whether it is safe for event-driven use.
- Which approval mode is required.
- What shape of input it expects.
- What shape of output it returns.

## Capability Shape

Type sketch:

```ts
type AssistantCapability = {
  id: string;
  owner: "core" | "plugin";
  pluginId: string | null;
  version: string;
  label: string;
  summary: string;
  category: "mission_control" | "assistant" | "email" | "calendar" | "messaging" | "memory" | "local" | "provider";
  sideEffect: CapabilitySideEffect;
  approvalMode: "none" | "review_required" | "approval_required" | "forbidden";
  eventSafe: boolean;
  manualRunSafe: boolean;
  requiresSetup: string[];
  inputSchema: CapabilitySchema;
  outputSchema: CapabilitySchema;
  userFacingReadSummary: string;
  userFacingWriteSummary: string;
  auditEventKind: string;
};
```

The registry should support JSON-schema-like validation without requiring the owner to see raw schema.

## Side Effects

Capabilities reuse the safety policy side-effect classes:

- `read_private`
- `read_external`
- `write_internal_draft`
- `write_internal_active`
- `memory_write`
- `notify_owner`
- `external_draft`
- `external_write`
- `external_send`
- `public_publish`
- `destructive`
- `money_or_account`
- `local_read`
- `local_write`
- `local_shell`
- `permission_change`

The capability's declared side effect is the maximum risk level. A job action can request a stricter approval mode, but it cannot lower the capability's policy.

## Core Capabilities

Core should contribute capabilities that do not depend on optional providers:

| ID | Purpose | Side effect | Approval |
| --- | --- | --- | --- |
| `assistant.job.create_draft` | Draft a new job during Add job flow. | `write_internal_draft` | `review_required` |
| `assistant.job.validate` | Validate a job draft against registry and policy. | `read_private` | `none` |
| `assistant.job.save_confirmed` | Save an owner-confirmed job. | `write_internal_active` | `none` after confirmation |
| `assistant.job.run_now` | Start a manual run for an active job. | `write_internal_active` | `none` if allowed |
| `assistant.job.pause` | Pause a job. | `write_internal_active` | `none` |
| `assistant.job.resume` | Resume a job after validation. | `write_internal_active` | `none` |
| `assistant.job.request_approval` | Create an approval request. | `write_internal_active` | `none` |

Core job-management capabilities are primarily used by the Add job flow and owner UI. Background jobs should not be able to create new active jobs without owner confirmation.

## Mission Control Capabilities

Mission Control should contribute the v1 workbench capabilities:

| ID | Purpose | Side effect | Approval |
| --- | --- | --- | --- |
| `mission.review_packet.create` | Create a scan-friendly review packet. | `write_internal_draft` | `review_required` |
| `mission.task.create` | Create a Mission Control task. | `write_internal_active` | `none` or `review_required` by job |
| `mission.capture.create` | Create a capture item. | `write_internal_active` | `none` |
| `mission.approval.create` | Create an approval item. | `write_internal_active` | `none` |
| `mission.activity.create` | Add project or job activity. | `write_internal_active` | `none` |
| `mission.memory.suggest` | Suggest private memory for review. | `write_internal_draft` | `review_required` |
| `mission.memory.activate` | Convert a suggestion into active durable memory. | `memory_write` | `approval_required` |
| `mission.project.read` | Read scoped project state. | `read_private` | `none` |
| `mission.task.read` | Read scoped tasks and captures. | `read_private` | `none` |
| `mission.approval.read` | Read pending approvals. | `read_private` | `none` |

V1 starter jobs should be possible with these capabilities alone.

## Email Capabilities

Email is a provider adapter surface, not Core v1 required infrastructure.

| ID | Purpose | Side effect | Approval |
| --- | --- | --- | --- |
| `email.message.read` | Read scoped mailbox messages. | `read_external` | `none` if scoped |
| `email.thread.summarize` | Summarize a scoped thread. | `read_external` | `none` if scoped |
| `email.reply.draft` | Draft a reply without sending. | `external_draft` | `review_required` |
| `email.message.send` | Send an email. | `external_send` | `approval_required` |
| `email.message.label` | Apply a mailbox label. | `external_write` | `approval_required` in Core v1 |

Email ingress can be event-safe only after provider setup, webhook verification, idempotency, and permission scopes exist.

## Messaging Capabilities

Messaging includes Soulink/current client messaging and later provider channels. Telegram remains a legacy connector while Soulink becomes the primary portable assistant chat surface.

| ID | Purpose | Side effect | Approval |
| --- | --- | --- | --- |
| `message.owner.notify` | Notify only the owner. | `notify_owner` | `none` if job enabled it |
| `message.client.draft` | Draft a message to another person. | `external_draft` | `review_required` |
| `message.client.send` | Send a message to another person. | `external_send` | `approval_required` |

Owner notifications need quiet-hour and failure behavior in the action manifest, but they are safe enough for v1 job health updates.

## Calendar Capabilities

Calendar is provider-backed when installed.

| ID | Purpose | Side effect | Approval |
| --- | --- | --- | --- |
| `calendar.event.read` | Read scoped events. | `read_external` | `none` if scoped |
| `calendar.reminder.draft` | Draft a reminder. | `external_draft` | `review_required` |
| `calendar.event.draft` | Draft an event. | `external_draft` | `review_required` |
| `calendar.event.create` | Create or change an event. | `external_write` | `approval_required` |
| `calendar.event.cancel` | Cancel an event. | `destructive` | `approval_required` or `forbidden` |

## Local Daemon Capabilities

Local daemon access is optional and should stay tightly scoped.

| ID | Purpose | Side effect | Approval |
| --- | --- | --- | --- |
| `daemon.metadata.read` | Read approved metadata only. | `local_read` | `approval_required` in Core v1 |
| `daemon.file.read` | Read approved local files. | `local_read` | `approval_required` |
| `daemon.file.write` | Write approved local files. | `local_write` | `approval_required` |
| `daemon.shell.run` | Run approved shell commands. | `local_shell` | `approval_required` |

Jobs should not receive local daemon capabilities until the owner pairs and scopes the daemon.

## Event Safety

A capability can be event-safe only if:

- It has deterministic validation.
- It can run idempotently.
- It does not need human clarification during execution.
- Its setup can be checked before enqueueing work.
- It records structured audit output.
- It respects the job approval policy.

External sends, destructive actions, local writes, shell commands, memory activation, money/account actions, and permission changes are not event-safe in Core v1.

## Action Manifest

Each job action references one capability and supplies bound inputs.

Type sketch:

```ts
type JobActionManifest = {
  actionId: string;
  capabilityId: string;
  label: string;
  inputBindings: Record<string, unknown>;
  outputBinding: string | null;
  approvalMode: "none" | "review_required" | "approval_required" | "forbidden";
  idempotencyScope: "run" | "source_event" | "artifact" | "external_ref";
  onFailure: "stop" | "continue" | "request_review";
};
```

The validator checks:

- Capability exists and is enabled.
- Plugin is installed and setup requirements are met or job is marked needs setup.
- Requested approval mode is not weaker than the capability mode.
- Inputs match the capability schema.
- Event-triggered jobs use event-safe capabilities for automatic execution.
- Destination actions point to allowed Mission Control surfaces.

## User-Facing Permission Summary

The registry should help generate job permission copy:

```text
This job can read tasks and captures in Mission Control.
It can create review packets and draft tasks.
It will ask before sending email or writing durable memory.
It cannot delete provider data or change permissions.
```

The summary should come from capability metadata, not model improvisation.

## Implementation Notes Later

When implementation starts, define registry constants and validators before API routes. Tests should cover unknown capability IDs, disabled plugins, too-weak approval modes, invalid inputs, event-unsafe actions, and setup-required capabilities.
