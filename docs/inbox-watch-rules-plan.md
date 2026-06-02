# Inbox Watch Rules and Approval-First Outcomes Plan

Planning source of truth: [`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md).
Tracking bead: `me3-wsn.30`.

This document is the detailed plan for the next Inbox Watch outcome after the first
mailbox-backed summary path. It should refine the visible Inbox Watch starter job without
becoming a separate custom job builder. The future builder should be able to draft this same
shape later, but owners should not need a workflow canvas to get useful email watching now.

## Goal

Inbox Watch should let the owner define simple readable rules for new mailbox messages, then
take safe approval-first actions when messages match.

Good v1 outcomes:

- Only triage fresh inbox candidates on each run, preferably unread or not yet processed by
  Inbox Watch, without marking mail as read.
- Let one visible Inbox Watch setup contain multiple rules.
- Support immediate owner notification for high-value matches.
- Support daily or weekly triage for lower-urgency matches.
- Create approval-first email reply drafts for matched messages.
- Create Mission Control tasks or activity when a match needs owner follow-up.
- Report matched count, action count, draft count, task count, and pending approvals in run
  summaries.

Non-goals for this slice:

- Do not send email automatically.
- Do not unsubscribe automatically.
- Do not apply provider-side important/star/label state without an approval-gated provider
  capability.
- Do not build the general custom jobs builder UI.
- Do not introduce a broad natural-language rule engine or arbitrary nested condition builder.

## Owner-Facing Model

Use one visible starter surface: Inbox Watch.

Owners should see plain settings such as:

```text
Watch for:
- Email from ada@example.com
- Email from any @client.com address
- Subject contains "contract"
- Message looks like it needs a reply

When matched:
- Notify me in Soulink
- Draft a reply for review
- Create a Mission Control task
- Include in daily digest
```

Avoid internal language such as capability IDs, action manifests, trigger unions, provider event
ledgers, approval policy, or cron.

## Can One Inbox Watch Handle Multiple Rules?

Yes, and it should for maximal usefulness. Multiple rules are the right owner-facing model.

The nuance is timing. A single Assistant Job version currently has one top-level trigger, so
"notify me immediately when Ada emails" and "triage other matching mail every Friday" are two
different execution timings. The owner should still experience this as one Inbox Watch setup,
but Core should avoid stretching the generic job schema before the custom builder work.

Recommended path:

1. Support multiple rules inside one Inbox Watch configuration immediately.
2. Support multiple actions per rule.
3. For rules with the same timing, run them inside one Assistant Job run.
4. For mixed immediate plus scheduled digest behavior, keep one owner-facing Inbox Watch surface
   but allow Core to execute it through separate internal trigger paths.

Possible internal implementations for mixed timing:

- Preferred v1: one visible Inbox Watch job record with rule metadata, plus runner branches for
  event-triggered and scheduled invocations. Event invocations evaluate only immediate rules;
  scheduled invocations evaluate digest rules.
- Alternative if the current single-trigger persistence makes that awkward: create managed
  sibling Assistant Jobs under the same visible Inbox Watch setup, one event-triggered and one
  scheduled, while hiding that split from the Add Job UI.
- Future builder path: introduce an explicit multi-trigger or grouped-job abstraction only after
  the general job builder needs it across more than email.

The key product constraint is that the owner should not have to create "Inbox Watch: Ada",
"Inbox Watch: Clients", and "Inbox Watch: Weekly digest" as separate visible starter jobs unless
they explicitly want that granularity.

## Rule Shape

Keep the executable shape compatible with current Assistant Job primitives.

V1 rule fields:

```ts
type InboxWatchRuleConfig = {
  id: string;
  label: string;
  enabled: boolean;
  timing: "immediate" | "daily_digest" | "weekly_digest" | "manual";
  match: {
    fromAddresses?: string[];
    fromDomains?: string[];
    subjectContains?: string[];
    bodyContains?: string[];
    inferredLabels?: Array<"needs_reply" | "important" | "finance" | "scheduling" | "review">;
  };
  actions: {
    notifyOwner?: boolean;
    summarizeAndLabel?: boolean;
    draftReply?: boolean;
    createTask?: boolean;
    recommendUnsubscribe?: boolean;
    markImportantInternally?: boolean;
  };
};
```

Persistence can map this into existing job storage:

- `draft.rules` stores readable match rules.
- `draft.actions` stores registered capability actions.
- `action.inputs.ruleIds` scopes an action to one or more rules.
- `action.inputs.deliveryTiming` records immediate, daily digest, weekly digest, or manual.
- `action.inputs.draftReplyStyle` can describe a short reply style without requiring a model in v1.

This keeps the future custom builder aligned with the same `rules` and `actions` shape instead
of inventing an Inbox Watch-only automation DSL.

## Candidate Selection

Scheduled and manual runs should avoid reprocessing the same old inbox messages.

Candidate selection should prefer:

- Active owner mailbox only.
- `direction = inbound`.
- `message_kind = email`.
- `folder = inbox`.
- `status IN ('received', 'forwarded')`.
- Fresh messages since the last successful Inbox Watch run, or messages with no Inbox Watch
  processing marker.
- Unread messages when `read_at` is available, without writing `read_at`.

Event-triggered runs from the future Email Worker adapter should evaluate the specific inbound
message event and, when useful, load nearby thread context.

Avoid marking messages as read. Inbox Watch can write `agent_summary` and `agent_labels_json` for
ME3-owned internal classification, but provider-visible state changes must go through a separate
approval-gated provider action.

## Action Semantics

### Notify Owner

Use `message.owner.notify`.

This can run without approval when owner notifications are configured. Soulink should be the
primary delivery channel.

### Summarize and Label

Use the existing mailbox summary and internal agent labels path.

Internal labels such as `needs_reply` or `important` are safe as ME3-owned metadata. Provider-side
"mark as important", Gmail stars, mailbox labels, or archive/move operations are external writes
and should remain approval-gated or deferred until a concrete provider capability exists.

### Draft Reply

Use `email.reply.draft` and the existing mailbox draft helper. Drafts should be created as
`pending_approval` and threaded to the source message when possible.

V1 reply text can be conservative and deterministic, such as a short acknowledgement draft, unless
the model-backed adapter is ready. The important behavior is that the owner can review and edit the
draft before sending.

### Create Task

Use `mission.task.create`.

Task titles should include the sender or rule label. Descriptions should include source message
summary, matched rule, suggested next step, and a source reference.

### Recommend Unsubscribe

Do not unsubscribe in v1.

Unsubscribe is destructive under the Assistant Jobs safety policy. Inbox Watch can create a task,
result item, or approval preview that says "Consider unsubscribing from this sender" if a later
provider-specific unsubscribe capability exists.

## Run Summary

Inbox Watch run summaries should be useful without raw mailbox inspection:

```text
Inbox Watch reviewed 8 new inbox messages, matched 3 across 2 rules, drafted 1 reply,
created 2 tasks, and has 1 item waiting for review.
```

Mission Control activity metadata should include:

- Message count.
- Thread count.
- Matched count.
- Rule match counts.
- Action counts.
- Draft IDs.
- Task IDs.
- Pending approval IDs.
- Skipped count and reason categories.

## Implementation Slices

1. Add Inbox Watch rule normalization and matching helpers.
2. Refine mailbox candidate loading to fresh unread or unprocessed messages.
3. Extend the Inbox Watch runner path to evaluate all enabled rules.
4. Scope actions by `ruleIds` and `deliveryTiming`.
5. Reuse mailbox draft creation for `email.reply.draft` outcomes.
6. Create Mission Control tasks for matched task actions.
7. Update run summaries and Mission Control activity metadata.
8. Add a recipe-specific settings panel in the Inbox Watch job detail modal.
9. Add tests for multiple rules, no duplicate side effects, fresh candidate selection, drafts,
   tasks, notifications, and no automatic sends.

## Future Builder Compatibility

The future custom jobs builder should not need a special Inbox Watch concept. It should learn to
draft the same ingredients:

- Trigger or timing.
- Scope.
- Rules.
- Actions.
- Approval policy.
- Destination.

The Inbox Watch starter can be the curated, owner-friendly surface for email use cases. The custom
builder can later create similar jobs from plain language once starter job QA, capability
unification, and output surfaces are stronger.

## Open Decisions

- Whether mixed immediate plus digest timing should be persisted as one job with invocation modes
  or as managed sibling jobs hidden behind one visible Inbox Watch setup.
- Whether v1 draft replies use deterministic templates only or can call the configured model route.
- Whether internal `important` labels should be renamed to avoid confusion with provider-side
  important/star state.
- Whether rule matches should be stored in mailbox message metadata or only in job run metadata.
