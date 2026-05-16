# Assistant Jobs Page and Builder UX

Source of truth: bead `me3-wsn.6` under parent `me3-wsn`.

Page title: `Assistant Jobs`

Subtitle: `Create boring jobs with your assistant, for your assistant.`

`/assistant` should feel like a calm work surface for managing routines, not a workflow automation product.

## Design Principles

Use the shared Kieran UI direction:

- Calm, operational, readable.
- Semantic `--ui-*` tokens for new UI.
- Green-teal accent for primary action, active state, focus, and meaningful badges.
- No decorative eyebrow labels.
- No oversized hero or marketing layout.
- No nested cards.
- Use tables or row lists for jobs, panels for detail and builder surfaces, and modals/drawers only when the owner is actively editing.
- Light and dark mode are first-class.

## Page Structure

Desktop layout:

```text
Assistant Jobs                                      [Add job]
Create boring jobs with your assistant, for your assistant.

[Active jobs | Suggested jobs | Runs needing attention]

Job list / empty state
```

The first viewport should prioritize:

- Page title and subtitle.
- `Add job` primary action.
- Active and paused jobs.
- Jobs that need setup or approval.

Avoid putting run output summaries above the job list. Job consequences belong in Mission Control.

## Active Jobs List

The primary list should support scanning and repeated use.

Columns or row fields:

- Job: name and one-line purpose.
- Status: active, paused, draft, needs setup, failing.
- Trigger: manual, schedule, or event summary.
- Destination: Mission Control, optionally a project.
- Last run: status and time.
- Next run: time or event-driven label.
- Waiting: approval count or setup issue when present.
- Actions: run now, pause/resume, more menu.

Recommended row behavior:

- Clicking the row opens job detail.
- Toggle is only for pause/resume.
- `Run now` is an icon/text button when enough space exists.
- Destructive actions live in a menu and require confirmation.
- Jobs with waiting approvals link to Mission Control, not an inline approval flow.

Mobile layout:

- Use stacked rows, not a wide table.
- Preserve job name, status, trigger, last run, and primary action.
- Move secondary actions into a menu.
- Keep the mobile title in the app shell controls.

## Empty State

The empty state should be useful, not decorative.

Copy:

```text
No assistant jobs yet.
Create a small repeatable job, like a weekly review or daily plan.
```

Actions:

- Primary: `Add job`
- Secondary: show suggested starter jobs below.

Do not use a marketing hero. The owner is already inside the app.

## Suggested Jobs

Suggested jobs are recipe starters. They create editable drafts.

Initial suggestions:

- Daily plan
- Weekly review
- Task carry-over
- Project digest
- Approval sweep
- Memory review
- Setup health check
- Email watch, shown as needs setup if Email is not ready
- Invoice and receipt triage, shown as needs setup if Email or Accounts is missing

Suggested job rows should show:

- Name.
- Plain-language outcome.
- Required setup.
- Destination.
- `Use starter` action.

They should not look like a marketplace or template gallery. Keep them compact and operational.

## Add Job Flow

`Add job` opens an agent panel.

Recommended shape:

```text
[Panel title] Add job
[Conversation]
[Draft card appears when ready]
[Confirm and save] [Save as draft] [Cancel]
```

The owner can:

- Type a job request.
- Pick a starter.
- Answer a short clarification.
- Review the draft.
- Confirm and save.

The agent panel should show a structured draft card with:

- Job name.
- Purpose.
- Trigger.
- Scope.
- Actions.
- Destination.
- Reads.
- Creates.
- Requires approval.
- Setup needed.

The draft card should be the anchor, not a chat transcript alone.

## Draft Review State

Draft states:

- `valid`: can save active.
- `needs_setup`: can save as draft or needs setup.
- `invalid`: cannot save until fixed.
- `unsafe`: refused or redirected to safer version.

The confirmation area should use plain language:

```text
This job can read tasks in Mission Control.
It can create one review packet every Friday.
It will ask before sending messages or writing durable memory.
```

Primary save action is enabled only when the owner can safely confirm.

## Job Detail

Job detail can be a route or a side panel. The initial implementation can choose the simpler pattern, but the information architecture should be:

- Header: name, status, pause/resume, run now, more.
- Summary: purpose in one or two sentences.
- Trigger: when it runs.
- Scope: what it watches or reads.
- Output: where it lands in Mission Control.
- Permissions: reads, writes, approval-required actions.
- Setup: missing provider or daemon state.
- Recent runs: compact list with links to Mission Control outputs.
- Version note: last edited time and by whom.

Editing should open the same Add job/draft flow seeded with the current job version.

## Run Now

`Run now` should:

- Validate the current job version.
- Show a confirmation if the run may create approvals or owner notifications.
- Start a manual run if valid.
- Move invalid jobs to detail with the blocking reason.

Manual runs should not bypass trigger rules, permissions, or approval policy.

## Pause, Resume, Duplicate, Delete

Pause:

- Immediate, reversible.
- Stops future scheduled/event runs.
- Does not cancel already waiting approvals.

Resume:

- Revalidates setup and capability references.
- If invalid, opens detail with the fix.

Duplicate:

- Creates a draft copy.
- Requires owner confirmation before active.

Delete:

- Prefer archive over hard delete.
- Requires confirmation.
- Does not delete Mission Control outputs or historical runs.

## Runs Needing Attention

The page may include a small filtered view for jobs that need owner action:

- Needs setup.
- Repeated failures.
- Waiting approvals.
- Event source disconnected.

This should stay secondary to the job list. Full review work stays in Mission Control.

## Mobile State Map

Mobile must support:

- Empty state.
- Active jobs list.
- Suggested jobs.
- Add job panel.
- Draft review.
- Job detail.
- Pause/resume.
- Run now.
- Setup missing.
- Delete confirmation.

Panels should fit small screens without text overflow. Long job names wrap; controls keep stable dimensions.

## Implementation Notes Later

When code starts, replace the current fixed-job placeholder with:

- Product header and Add job action.
- Real job row model from the new schema.
- Starter recipe list from recipe data.
- Agent builder panel.
- Detail surface wired to job versions and run history.

Use the app's existing side nav and shared token model. Do not introduce a separate visual system for Assistant Jobs.
