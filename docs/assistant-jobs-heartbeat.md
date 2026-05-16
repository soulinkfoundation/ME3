# Assistant Jobs Heartbeat and Reconciliation Loop

Source of truth: bead `me3-wsn.22` under parent `me3-wsn`.

The heartbeat is a reliability layer for Assistant Jobs.

It should not replace event-driven ingress, per-job schedules, or the per-user runner. Its job is to notice what should have happened, recover what got stuck, renew watches, and surface unhealthy jobs.

## Recommendation

Use a hybrid model:

- One Core heartbeat entry point on a conservative interval.
- Per-job `next_run_at` for due scheduled work.
- Per-user runner isolation for execution.
- Event ingress ledger for event-triggered jobs.
- Reconciliation passes that are safe to rerun.

The heartbeat finds work and repairs state. The job runner does the actual job execution.

## Responsibilities

The heartbeat should:

- Find due scheduled jobs.
- Detect missed schedules.
- Reconcile received events that were not processed.
- Retry runs that are safe to retry.
- Mark stuck runs as failed or blocked.
- Renew provider watches when adapters support them.
- Surface disconnected providers or setup problems.
- Create Mission Control activity for owner-actionable issues.

The heartbeat should not:

- Execute job action logic inline.
- Send external messages.
- Bypass approval policy.
- Create duplicate runs for the same due schedule or source event.
- Hide repeated failures from the owner.

## Scheduling Model

Every active scheduled job stores:

- `next_run_at`
- `timezone`
- trigger config
- current valid job version
- last schedule cursor

The heartbeat scans due jobs in bounded batches:

```text
status = active
trigger.kind = schedule
next_run_at <= now
```

For each due job, it creates or finds a run using a deterministic idempotency key:

```text
job:{jobId}:version:{versionId}:schedule:{scheduledAt}
```

Then it advances `next_run_at` only after the due run is safely recorded.

## Event Backlog Reconciliation

Event ingress handlers should record events before job work runs.

The heartbeat scans event ledger records that are stuck in:

- `received`
- `matched`
- `queued`
- `failed` with retryable errors

For each event, it:

1. Recomputes matching active event-triggered jobs.
2. Creates missing runs idempotently.
3. Marks ignored events when no active job matches.
4. Escalates repeatedly failing events to Mission Control activity.

This protects against webhook handler failures and queue/consumer gaps.

## Stuck Run Detection

A run is stuck when it has not moved within its expected window.

Suggested windows:

- `queued`: no pickup after 10 minutes.
- `running`: no heartbeat after 30 minutes.
- `waiting_for_approval`: not stuck, but may be stale after configured approval expiry.
- `blocked`: no retry unless setup or permission changes.

Stuck run handling:

- If retryable, increment retry count and set `next_retry_at`.
- If not retryable, mark failed or blocked.
- If owner action is needed, create Mission Control activity.
- Never retry an action after owner denial.

## Retry Policy

Retries should be bounded and idempotent.

Suggested defaults:

- Retry transient provider/read errors up to 3 times.
- Use exponential backoff with jitter.
- Do not retry validation errors, forbidden actions, approval denial, missing setup, or unknown capabilities.
- Preserve action idempotency keys across retries.
- Mark terminal failures clearly in run history.

## Provider Watch Renewal

Some later provider adapters may need watch or webhook renewal.

The heartbeat can ask each installed adapter for watch health:

```ts
type ProviderWatchHealth = {
  providerId: string;
  sourceId: string;
  status: "healthy" | "expires_soon" | "expired" | "error" | "setup_missing";
  renewAfter: string | null;
  ownerActionRequired: boolean;
};
```

Renewal rules:

- Only renew provider watches that were owner-authorized.
- Do not create new provider scopes silently.
- Record renewal attempts in job or provider activity.
- Surface setup errors in Mission Control.

## Rate Limits and Isolation

The heartbeat must be boring under load:

- Batch by user and job.
- Cap jobs scanned per tick.
- Cap events reconciled per tick.
- Do not let one provider or user starve others.
- Use deterministic cursors where possible.
- Prefer many small resumable passes over one large scan.

Core installs are usually owner-scoped, but the model should still avoid assuming one global user forever.

## Mission Control Surfacing

Heartbeat activity should appear only when useful:

- Job missed multiple runs.
- Provider watch expired.
- Job moved to needs setup.
- Job has repeated terminal failures.
- Event backlog cannot drain.
- Dead-lettered work needs attention.

Routine successful heartbeat passes should remain quiet. They can be visible in developer logs or run history only when debugging.

Owner-facing copy examples:

```text
Weekly Review missed its Friday run. I queued a catch-up run.
Email Watch needs Email setup before it can resume.
Invoice Triage failed three times while reading Email. Review provider setup.
```

## Dead-Letter Surface

The design should include a dead-letter concept even before choosing infrastructure.

A terminally failed event or run should store:

- Source event or run ID.
- Job ID and version.
- Failure code.
- Last error message.
- Retry count.
- Whether owner action can fix it.
- Link to Mission Control activity.

This can later map to Cloudflare Queues DLQ behavior, but the product model should not depend on queues existing first.

## Tenant and Permission Safety

Every heartbeat pass must re-check:

- Job is still active.
- Job version is still valid.
- User/owner scope matches.
- Plugin is enabled.
- Required setup is available.
- Approval policy has not become weaker than capability policy.

If any check fails, the heartbeat should not enqueue execution. It should mark the job needs setup, blocked, or invalid depending on the reason.

## Candidate Implementation Shape Later

When implementation starts, prefer:

1. A Core scheduled entry point that calls a small reconciler.
2. A due-job scanner using `next_run_at`.
3. An event-ledger reconciler.
4. A stuck-run reconciler.
5. Provider watch renewal hooks.
6. Mission Control activity writes for owner-actionable failures.

Cloudflare Cron, Durable Object alarms, or Agents scheduling can all fit this shape. The key design choice is not the platform primitive; it is that all work is idempotent, user-scoped, and visible when unhealthy.

## Open Decisions for Implementation

Implementation should decide:

- Heartbeat interval.
- Batch sizes.
- Where per-user runner leases live.
- Whether due schedules are claimed directly in D1 or by a user-scoped Durable Object.
- How queue/DLQ infrastructure maps to the run and ingress ledgers.
- Provider-specific watch renewal contracts.

These decisions should be made after the schema, registry, and runner contracts exist.
