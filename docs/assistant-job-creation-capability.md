# ME3 Agent Custom Job Creation Capability

Planning source of truth: [`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md).
This document is the detailed custom job builder reference, and should not outrun the
starter-job QA and capability-unification work tracked in the roadmap.

Custom job creation should be a first-class ME3 agent capability.

The owner should be able to say what they want in plain language. The agent should turn that into a safe, structured job draft, explain it, validate it, and save it only after explicit confirmation.

## Capability Contract

Capability ID: `assistant.job.create_with_owner`

Purpose: help the owner create or edit an Assistant Job through conversation.

The capability may:

- Read the capability registry.
- Read starter recipe metadata.
- Read Mission Control project names and setup state.
- Draft a job.
- Validate the draft.
- Ask clarifying questions.
- Show permission and approval summaries.
- Save a job after explicit confirmation.

The capability must not:

- Save an active job before confirmation.
- Invent capabilities that are not registered.
- Hide approval requirements.
- Bypass provider setup.
- Create external sends, payments, deletes, or permission changes during the builder flow.
- Store durable private memory unless a separate approval flow exists.

## Inputs

```ts
type JobCreationInput = {
  ownerMessage: string;
  selectedRecipeId?: string;
  editingJobId?: string;
  projectId?: string;
  context?: {
    availableCapabilities: AssistantCapability[];
    starterRecipes: AssistantRecipe[];
    missionControlProjects: Array<{ id: string; name: string }>;
    setupState: Array<{ requirement: string; status: "ready" | "missing" | "error" }>;
  };
};
```

## Outputs

```ts
type JobCreationOutput =
  | {
      kind: "clarification";
      question: string;
      options?: string[];
    }
  | {
      kind: "draft";
      draft: AssistantJobDraft;
      explanation: JobDraftExplanation;
      validation: JobDraftValidation;
    }
  | {
      kind: "confirmed_save";
      jobId: string;
      summary: string;
    }
  | {
      kind: "refusal";
      reason: string;
      saferAlternative?: string;
    };
```

The UI can render this as a conversation plus a structured draft card.

## Draft Job Shape

```ts
type AssistantJobDraft = {
  name: string;
  purpose: string;
  recipeId: string | null;
  trigger: JobTrigger;
  scope: JobScope;
  rules: JobRule[];
  actions: JobAction[];
  approvalPolicy: JobApprovalPolicy;
  destination: JobDestination;
  projectId: string | null;
};
```

The draft is not executable until validation passes and the owner confirms.

## Prompt Behavior

The agent should behave like an assistant taking responsibility for a small routine, not like a workflow builder.

It should:

- Prefer a starter recipe when one fits.
- Ask at most one or two clarification questions before drafting.
- Use plain language for trigger, scope, and output.
- Explain reads, writes, and approvals before confirmation.
- Keep provider-missing jobs as draft or needs setup.
- Offer safe alternatives when the request is too broad or risky.

It should not:

- Ask the owner to choose raw capability IDs.
- Show cron syntax, queue names, schema names, or internal policy labels unless debugging.
- Convert "send this automatically" into an external send without approval.
- Treat "remember this forever" as durable memory without approval.

## Clarification Rules

Ask a clarification question when:

- The trigger is missing or ambiguous.
- The data scope is too broad for the requested job.
- The destination project is unclear and the output should be project-scoped.
- A required provider is not set up and there is a useful choice: save as draft, connect provider later, or use a Core-only version.
- The requested action might send, publish, delete, pay, book, or change account state.

Do not ask when:

- A safe default exists.
- The job can start as manual.
- Mission Control is an acceptable default destination.
- The owner's wording maps cleanly to a starter recipe.

## Validation Errors

Validation should return structured errors:

```ts
type JobDraftValidation = {
  status: "valid" | "needs_setup" | "invalid";
  errors: Array<{
    code:
      | "unknown_capability"
      | "plugin_disabled"
      | "setup_missing"
      | "scope_too_broad"
      | "approval_too_weak"
      | "event_unsafe_action"
      | "forbidden_action"
      | "invalid_trigger"
      | "invalid_destination";
    message: string;
    blocking: boolean;
  }>;
  permissionSummary: JobPermissionSummary;
};
```

Blocking errors prevent save as active. Missing setup can allow save as draft or needs setup.

## Confirmation Step

Before saving, show a confirmation summary:

```text
Job: Weekly client review
Runs: Fridays at 3:00 PM
Reads: Mission Control tasks and project activity for client projects
Creates: One result in Mission Control
Asks before: Sending messages, writing durable memory, or changing external systems
Destination: Mission Control -> Client Projects
```

The owner must choose an explicit save action. The agent saying "looks good" is not confirmation.

## Refusal and Safety Rules

Refuse or redirect requests to:

- Send messages automatically to other people without approval.
- Delete or bulk-change provider data.
- Change permissions, secrets, or provider credentials.
- Extract or expose secrets.
- Make payments or account changes without approval.
- Watch sources that are not connected or owner-authorized.

When refusing, offer the nearest safe version, such as drafting for approval or creating a Mission Control result.

## Example Conversations

### Weekly Review

Owner: "Make a weekly review for my client projects every Friday afternoon."

Assistant:

- Maps to Weekly review recipe.
- Asks which project group if needed.
- Drafts a scheduled job.
- Reads Mission Control projects, tasks, approvals, and recent activity.
- Creates a Mission Control result.
- Requires approval for external sends or durable memory writes.

### Inbox Watch

Owner: "Get notified or take action when specific people email me."

Assistant:

- Checks whether Email is connected and ready.
- Drafts a scheduled job scoped to the connected mailbox.
- Creates a Mission Control result from mailbox messages.
- Current implemented path reads active inbox messages, writes mailbox summaries/labels, and
  surfaces message/thread counts in Mission Control run and activity history.
- Optional draft replies are still pending.
- Does not send replies without approval.
- If Email is not ready, offers a needs-setup draft.

### Invoice Triage

Owner: "Watch for invoices and receipts, pull out the amount, and remind me to pay them."

Assistant:

- Checks Email and any Accounts capability.
- Drafts extraction into a Mission Control result.
- Creates tasks for likely payment follow-up.
- Marks payment or accounting writes as approval-required.
- Stores low-confidence matches for review.

### Booking Reminder

Owner: "Before bookings, remind me what I need to know and make a follow-up task."

Assistant:

- Checks whether Calendar is connected and ready.
- Drafts an event-triggered or scheduled job scoped to booking events.
- Reads calendar context and creates a Mission Control result.
- Creates follow-up tasks inside Mission Control.
- Sends owner notifications only after the notification capability exists and is enabled.

## Allowed Tool Calls Later

The eventual agent implementation should have a narrow tool set:

- `assistant.recipes.list`
- `assistant.capabilities.list`
- `mission.projects.list`
- `assistant.job.draft.validate`
- `assistant.job.draft.save_after_confirmation`

It should not directly call provider send/write tools during job creation.
