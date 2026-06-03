# Weekly Review As A Mission Control Task

## Goal

Move Weekly Review from a standalone Mission Control panel/result surface into the normal Mission Control task model.

The owner should see a generated task in `/mission-control`, open it like any other task, and complete the review from the task detail modal. This keeps Mission Control centered on projects and tasks while `/journal` owns journaling.

## Current State

- `/mission-control` no longer has the old Today/Journal sections.
- Old journal section query values redirect to `/journal`.
- Weekly Review backend result generation still exists in Assistant Jobs.
- Weekly Review submit support exists at `/api/mission-control/weekly-review/:runId/submit`.
- Soulink ready notification already exists in `apps/worker/src/assistant-jobs.ts` through `sendWeeklyReviewOwnerNotificationIfConnected()`.
- The notification text is already the desired count format:
  `Weekly Review is ready: X open tasks, Y completed, Z reminders, N memory suggestions.`

## Product Shape

Weekly Review should be represented by one system-generated Mission Control task.

Example:

- Title: `Weekly Review: 2026-06-01 to 2026-06-07`
- Project: default Personal/Mission Control project, or a dedicated Reviews project if we decide one is worth the extra surface.
- Status: `review` or `backlog` initially. Prefer `review` if the task means "ready for owner review."
- Source kind: keep `agent` unless we add a more specific task source enum.
- Metadata:
  - `kind: "weekly_review"`
  - `assistantJobRunId`
  - `missionAgentRunId`
  - `weekStart`
  - `weekEnd`
  - `openTasks`
  - `completedTasks`
  - `reminders`
  - `summary`
  - `memorySuggestions`
  - `submittedAt`

## Owner Flow

1. Weekly Review job runs on schedule.
2. Job creates/updates the Weekly Review result payload.
3. Core creates one Mission Control task for that review window.
4. Soulink receives the ready-count notification when connected.
5. Owner opens `/mission-control`.
6. The generated Weekly Review task appears in the ordinary task list/board.
7. Owner opens the task detail modal.
8. The modal detects `metadata.kind === "weekly_review"` and renders the review UI:
   - Open tasks with carry-over checkboxes.
   - Completed tasks collapsed.
   - Reminder count/list.
   - Short review summary.
   - Memory suggestions with duplicate/pattern awareness.
9. Owner submits selected actions.
10. Submit updates selected existing tasks, queues selected memory suggestions for Memory review, records activity, and marks the Weekly Review task done.

## UI Placement

Do not add a new top-level Weekly Review panel to `/mission-control`.

Use the task detail modal as the special rendering surface. This makes the feature survive future Mission Control layout changes as long as tasks remain the core primitive.

The task card itself should stay compact:

- Title
- Week range
- A small `Weekly Review` badge
- Counts if there is room: open, completed, memory suggestions

## Backend Plan

### 1. Create Or Upsert Review Task

When `buildWeeklyReviewResult()` is attached to a successful Weekly Review run, upsert a Mission Control task.

Use deterministic IDs to avoid duplicate tasks:

```text
weekly-review-task:{userId}:{weekStart}:{weekEnd}
```

or store a deterministic `source_ref`:

```text
weekly-review:{weekStart}:{weekEnd}
```

### 2. Store Structured Metadata

Persist the review payload on the task `metadata_json`, or store only references and read the run result on demand.

Recommendation: store a compact task metadata payload plus the run id. This keeps the task list usable without heavy joins, while the modal can still fetch full detail if needed later.

### 3. Submit From Task

Keep the existing submit endpoint if practical, but make it task-aware:

```text
POST /api/mission-control/tasks/:id/weekly-review/submit
```

The handler should:

- Validate the task belongs to the owner.
- Validate `metadata.kind === "weekly_review"`.
- Carry over selected existing tasks by setting `scheduled_for` or another future planning field.
- Create selected memory suggestions as `sourceKind: "agent"` and `reviewStatus: "needs_review"`.
- Mark the Weekly Review task `done`.
- Record `weekly_review.submitted` activity.
- Be idempotent if submitted twice.

### 4. Keep Soulink Notification

The Soulink notification is already implemented for connected owners. Keep it, but point any deep link/copy toward the generated task when task links exist.

Future message:

```text
Weekly Review is ready: X open tasks, Y completed, Z reminders, N memory suggestions.
```

Optional later addition:

```text
Open it in Mission Control: <task link>
```

## Frontend Plan

### 1. Task Metadata Type

Add a Weekly Review metadata type beside the existing task types in `mission-control.vue`.

### 2. Card Treatment

If a task has Weekly Review metadata:

- Show a compact `Weekly Review` badge.
- Prefer the week range over project/source noise.
- Keep card actions the same unless submit state needs a quick action later.

### 3. Modal Treatment

Extend the existing task detail modal:

- Normal title/status/description controls stay available only where useful.
- Render Weekly Review controls in the modal body.
- Submit button lives in the modal footer or review section.
- After submit, refresh project tasks and memory.

### 4. Remove Journal Language

Do not refer to “Journal” inside Mission Control UI.

Rename frontend labels to:

- `Review summary`
- `Weekly Review`
- `Memory suggestions`

Backend compatibility fields like `journalSummary` can remain briefly if changing them would churn the result schema, but new UI should not expose that name.

## Cleanup Plan

- Remove any remaining `/mission-control` frontend references to Today/Journal UI.
- Keep redirects from old query sections to `/journal` only if they are useful for users with old links.
- Move any journal-specific APIs and docs to the Journal plugin area.
- Update Assistant Jobs docs to say Weekly Review creates a Mission Control task, not a free-floating review panel.

## Open Questions

- Should Weekly Review tasks live in Personal, Mission Control, or a dedicated Reviews project?
- Should the generated task status be `review` or `backlog`?
- Should completing the review task happen automatically on submit, or should Submit only apply actions and leave the owner to mark it done?
- Do we need a permanent history of past Weekly Review tasks, or can completed review tasks be archived later like ordinary completed work?

## Recommended First Slice

1. Upsert Weekly Review task with structured metadata when the job succeeds.
2. Render the special task modal UI.
3. Change submit endpoint to be task-based.
4. Keep current Soulink notification.
5. Update docs/tests.
