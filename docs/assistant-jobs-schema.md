# Assistant Jobs Schema and Recipe Model

Source of truth: bead `me3-wsn.2` under parent `me3-wsn`.

Assistant Jobs should persist editable recipe instances, not fixed `job_type` rows.

The schema should answer four questions:

- What did the owner ask the assistant to keep doing?
- What version of that job was used for a run?
- What capabilities and approvals were involved?
- What landed in Mission Control afterward?

This is a design spec. It is not a migration file.

## Ownership

Core owns the Assistant Jobs model because `/assistant` is a Core surface and job execution crosses installed plugins.

Mission Control owns the default destination records: review packets, tasks, captures, approvals, private memory suggestions, activity, and run summaries.

Plugins own provider-specific configuration and capabilities. Jobs store references to plugin capabilities but should not copy provider secrets, hosted-only subscription state, or plugin-private credentials.

## Model Overview

Core should store:

- `assistant_recipes`: built-in or installed recipe templates.
- `assistant_jobs`: owner-confirmed job instances.
- `assistant_job_versions`: immutable snapshots used for runs.
- `assistant_job_runs`: one execution attempt.
- `assistant_job_run_events`: structured run timeline.
- `assistant_job_artifacts`: durable outputs created by runs.
- `assistant_job_action_results`: per-action outcome and idempotency state.
- `assistant_job_ingress_events`: normalized events that may trigger jobs.

Mission Control should receive linked records for owner-facing output, but Core should retain the job/run spine.

## Recipe

A recipe is an editable starting point. It can come from Core, a first-party plugin, or a later trusted catalog.

Type sketch:

```ts
type AssistantRecipe = {
  id: string;
  source: "core" | "plugin" | "import";
  pluginId: string | null;
  slug: string;
  name: string;
  summary: string;
  defaultPurpose: string;
  defaultTrigger: JobTriggerDraft;
  defaultRules: JobRuleDraft[];
  defaultActions: JobActionDraft[];
  defaultApprovalPolicy: JobApprovalPolicyDraft;
  defaultDestination: JobDestinationDraft;
  requiredCapabilityIds: string[];
  optionalCapabilityIds: string[];
  status: "active" | "deprecated";
  createdAt: string;
  updatedAt: string;
};
```

Recipes are templates only. Editing a job never mutates the recipe.

## Job

A job is an owner-confirmed recipe instance.

Type sketch:

```ts
type AssistantJob = {
  id: string;
  userId: string;
  recipeId: string | null;
  name: string;
  purpose: string;
  status: "draft" | "active" | "paused" | "needs_setup" | "failing" | "archived";
  currentVersionId: string | null;
  projectId: string | null;
  destination: JobDestination;
  triggerSummary: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: JobRunStatus | null;
  failureCount: number;
  setupStateJson: string;
  createdBy: "owner" | "assistant";
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};
```

The row should contain list-friendly summaries. The full executable shape belongs in immutable versions.

## Job Version

A version snapshots a job at the moment it can run.

Type sketch:

```ts
type AssistantJobVersion = {
  id: string;
  jobId: string;
  userId: string;
  versionNumber: number;
  name: string;
  purpose: string;
  trigger: JobTrigger;
  scope: JobScope;
  rules: JobRule[];
  actions: JobAction[];
  approvalPolicy: JobApprovalPolicy;
  destination: JobDestination;
  capabilityIds: string[];
  permissionSummary: JobPermissionSummary;
  validationStatus: "valid" | "invalid" | "needs_setup";
  validationErrors: JobValidationError[];
  createdAt: string;
};
```

Runs should always point at the version they used. Editing a job creates a new version.

## Trigger

User-facing trigger language should stay simple:

- `manual`: "When I ask."
- `schedule`: "On a schedule."
- `event`: "When something happens."

Type sketch:

```ts
type JobTrigger =
  | { kind: "manual" }
  | {
      kind: "schedule";
      timezone: string;
      cadence: "daily" | "weekly" | "monthly" | "custom";
      rrule: string | null;
      localTime: string | null;
      dayOfWeek: number | null;
      nextRunAt: string | null;
    }
  | {
      kind: "event";
      source: "core" | "mission_control" | "plugin";
      sourceId: string;
      eventType: string;
      filters: JobRule[];
    };
```

The schema can store `rrule` for precision, but owner surfaces should not require users to see it.

## Scope, Rules, and Actions

`JobScope` says what data the job may consider.

```ts
type JobScope = {
  projectId: string | null;
  sourceIds: string[];
  providerAccountIds: string[];
  filters: Array<{
    field: string;
    operator: "equals" | "contains" | "starts_with" | "in" | "before" | "after";
    value: unknown;
  }>;
};
```

`JobRule` is a condition used by the trigger or runner.

```ts
type JobRule = {
  id: string;
  label: string;
  field: string;
  operator: string;
  value: unknown;
};
```

`JobAction` is an ordered capability call.

```ts
type JobAction = {
  id: string;
  capabilityId: string;
  label: string;
  inputs: Record<string, unknown>;
  approvalMode: "none" | "review_required" | "approval_required" | "forbidden";
  onFailure: "stop" | "continue" | "request_review";
  idempotencyScope: "run" | "source_event" | "artifact" | "external_ref";
};
```

Action order matters for the runner, but the UI should summarize intent rather than expose a workflow canvas in v1.

## Approval Policy

The job version stores the policy used by the runner.

```ts
type JobApprovalPolicy = {
  defaultMode: "none" | "review_required" | "approval_required";
  overrides: Array<{
    capabilityId: string;
    mode: "none" | "review_required" | "approval_required" | "forbidden";
    reason: string;
  }>;
  ownerCanApproveFrom: "mission_control";
  approvalExpiresAfterHours: number | null;
};
```

The safety spec defines which classes are allowed for each mode.

## Destination

Jobs default to Mission Control.

```ts
type JobDestination = {
  kind: "mission_control";
  projectId: string | null;
  landing: "review_packet" | "task" | "capture" | "approval" | "memory_review" | "activity";
  quietIfNoChanges: boolean;
};
```

Provider-specific destinations should be represented as actions, not as the primary destination.

## Run

A run records execution. It should be useful without replaying logs.

```ts
type AssistantJobRun = {
  id: string;
  userId: string;
  jobId: string;
  jobVersionId: string;
  triggerKind: "manual" | "schedule" | "event" | "heartbeat_retry";
  triggerRef: string | null;
  status: "queued" | "running" | "waiting_for_approval" | "succeeded" | "failed" | "cancelled" | "blocked";
  startedAt: string | null;
  finishedAt: string | null;
  outputPreview: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

## Artifact

Artifacts preserve outputs without forcing everything into one table.

```ts
type AssistantJobArtifact = {
  id: string;
  userId: string;
  jobId: string;
  runId: string;
  kind: "review_packet" | "draft" | "summary" | "extraction" | "file_ref" | "provider_ref";
  title: string;
  preview: string | null;
  payloadJson: string;
  missionControlRef: string | null;
  providerRef: string | null;
  createdAt: string;
};
```

Large payloads can later move to R2 with a pointer. Core v1 should keep small structured artifacts in D1.

## Ingress Event and Idempotency

Event-driven jobs need an ingress ledger before work runs.

```ts
type AssistantJobIngressEvent = {
  id: string;
  userId: string;
  sourceKind: "core" | "mission_control" | "plugin" | "webhook";
  sourceId: string;
  sourceEventId: string;
  eventType: string;
  idempotencyKey: string;
  payloadJson: string;
  rawPayloadRef: string | null;
  status: "received" | "matched" | "queued" | "processed" | "ignored" | "failed";
  createdAt: string;
  updatedAt: string;
};
```

Every external side effect also needs an action-level idempotency key:

```ts
type AssistantJobActionResult = {
  id: string;
  runId: string;
  actionId: string;
  capabilityId: string;
  idempotencyKey: string;
  status: "skipped" | "blocked" | "pending_approval" | "succeeded" | "failed";
  approvalId: string | null;
  artifactId: string | null;
  externalRef: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Duplicate ingress events must not create duplicate side effects.

## Migration Plan

When implementation begins:

1. Add Core D1 tables for recipes, jobs, versions, runs, run events, artifacts, action results, and ingress events.
2. Seed Core starter recipes as data, not hardcoded job branches.
3. Add indexes for owner list views, due schedules, active event triggers, run history, and idempotency keys.
4. Keep existing hosted-style `jobType` values behind a compatibility mapper until migrated.
5. Add serializers and validators in a shared package before route handlers.
6. Add API tests for create, edit, versioning, pause, run now, invalid capability references, and idempotency.

No migration should include hosted-only subscription state, hosted Cloudflare routes, production provider IDs, or billing config.

## Suggested Table Names

The final migration can use:

- `assistant_recipes`
- `assistant_jobs`
- `assistant_job_versions`
- `assistant_job_runs`
- `assistant_job_run_events`
- `assistant_job_artifacts`
- `assistant_job_action_results`
- `assistant_job_ingress_events`

All tables should include `user_id`, `created_at`, and enough indexes to avoid scanning all users or all jobs.
