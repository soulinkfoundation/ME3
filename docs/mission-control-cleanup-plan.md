# ME3 Mission Control Cleanup Plan

Source of truth: follows `docs/journal-plugin-plan.md` and bead `me3-3ic`.

## Timing

Do this after the new Journal plugin has landed on `main`.

Mission Control cleanup is intentionally sequenced after Journal because the cleanup touches the same hot files as the Journal plugin work:

- `apps/web/src/pages/mission-control.vue`
- `apps/web/src/components/AppSideNav.vue`
- `apps/worker/src/plugins.ts`
- package manifests and lockfile if plugin metadata is still changing

Do not begin the cleanup while another session has uncommitted Journal plugin work in the shared worktree. Wait for that session to commit and push, then pull/rebase `main`.

## Product Decision

Mission Control should become an operational review workspace, not a human writing or daily capture workspace.

For this cleanup pass:

- Mission Control opens to Projects by default.
- The current Projects kanban remains as-is.
- Journal UI and journal archive UI leave Mission Control.
- Task/reminder/event capture UI leaves Mission Control.
- Backend Mission Control task/project/activity APIs remain in place.
- Legacy `mission_daily_notes` storage remains in place because capture records currently reference it, but the Mission Control page should stop using journal data.

After this pass, the product boundary should be clear:

- `/journal`: daily writing and human capture.
- `/assistant`: conversational creation and actions.
- `/mission-control`: project/task/status review.

## Target UI

Route: `/mission-control`

Default visible section: `projects`

Primary workspace:

- Project switcher in the topbar.
- Existing project kanban board.
- Existing local project summary and local-run affordances.
- Existing task detail modal and task composer behavior.

Optional sections that may remain:

- `Accounts`, if the Accounts plugin is enabled.
- `Activity`, `Memory`, and `Sources` behind the current settings menu if removing them creates unrelated churn.

Removed sections:

- `today`
- `journalArchive`

Removed visible UI:

- Journal tab.
- Day/date switcher.
- Daily briefing panel.
- Weekly review panel from the Today view.
- Task/reminder/event capture row.
- Today capture list.
- Journal textarea.
- Journal archive list and preview.
- Archive picker that mixes journal archive and project archives.

## Link And Query Behavior

Normalize old Mission Control journal links safely:

- `/mission-control`
  - Opens Projects.
- `/mission-control?section=projects`
  - Opens Projects.
- `/mission-control?section=today`
  - Prefer redirecting to `/journal` if the Journal plugin is enabled.
  - Otherwise fall back to Projects.
- `/mission-control?section=journal`
  - Same behavior as `today`.
- `/mission-control?section=archive` or `journal-archive`
  - Prefer redirecting to `/journal` archive behavior if that exists.
  - Otherwise fall back to Projects.

Do not leave users on a blank page for removed sections.

## Frontend Work

Main file: `apps/web/src/pages/mission-control.vue`

Section types:

- Remove `today` from `MissionSection`.
- Remove `journalArchive` from `MissionSection`.
- Change `PrimaryMissionSection` to include `projects` and optional `accounts`.
- Change `SettingsMissionSection` to include only settings/review sections that remain.
- Make `normalizeSection` default to `projects`.

Topbar:

- Remove the day switcher branch.
- Keep the project switcher branch.
- Keep settings menu only for remaining sections.
- Update mobile section cycle behavior so it does not refer to Journal.
- If Projects is the only primary section, consider hiding the tab group instead of showing a single selected tab.

State and computed cleanup:

- Remove `selectedDate`, `day`, `captures`, `tasksDueToday`, `latestBriefing`, `latestWeeklyReview`, weekly review selection state, capture input state, date picker state, journal draft state, journal archive state, and archive picker state.
- Keep `projects`, `projectTasks`, `selectedProjectDetailId`, project picker state, project modal state, local executor status, activity, memory, sources, and accounts state as needed.

Methods and watchers to remove:

- `loadJournalArchive`
- journal save/autosave methods
- date picker methods
- capture submit/update/archive methods
- daily briefing dismiss helpers
- weekly review submit/toggle helpers
- `selectJournalDate`, `moveDay`, `pickToday`
- watchers for `selectedDate`, `journalDraft`, and `captureText`
- `journalSaveTimer` cleanup

Methods to keep or replace:

- Keep project task CRUD and local-run methods.
- Keep project picker and project creation methods.
- Keep activity/memory/source methods if their sections remain.
- Replace `loadOverview` as the initial project source if possible.

Preferred data loading:

- Use `GET /api/mission-control/projects` to load projects for the project switcher and project task composer.
- Use `GET /api/mission-control/tasks` for the board.
- Avoid `GET /api/mission-control/overview` for the default Mission Control page because it loads day/journal context and may create daily-note records.
- If Activity remains, load its data only when the Activity section opens or retain a small review-specific endpoint as a later improvement.

Template cleanup:

- Delete the `activeSection === 'today'` section.
- Delete the `activeSection === 'journalArchive'` section.
- Keep the `activeSection === 'projects'` section.
- Keep remaining settings sections only if still reachable.

Style cleanup:

- Remove styles used only by deleted Today/Journal UI:
  - `.mission-control__day-switcher`
  - `.daily-sheet`
  - `.daily-briefing-panel`
  - `.weekly-review-*`
  - `.capture-row*`
  - `.capture-item*`
  - `.journal-sheet`
  - `.journal-editor*`
  - `.journal-archive*` if project archive is not retained
  - `.archive-picker-popover*` if archive picker is removed
- Keep shared button, project board, modal, settings, activity, memory, source, and account styles.

## Worker And Plugin Metadata

Keep Mission Control APIs for now:

- Project APIs stay.
- Task APIs stay.
- Activity, approvals, runs, memory, sources, and local executor bridge APIs stay.
- Capture APIs may stay even if the direct capture UI is removed, because Assistant and jobs may still need a compatibility path.

Update catalog copy in `apps/worker/src/plugins.ts`:

- Remove "daily notes" and "journal entries" from the Mission Control plugin description.
- Change `mission.capture.manage` copy so it does not promise journal entries.
- Keep task/project/activity/approval/memory/source permissions.

Do not drop or rename `mission_daily_notes` in this cleanup.

## Project Archive Decision

The current archive UI is coupled to Journal archive. For this cleanup, it is acceptable to remove that mixed archive view.

If archived project tasks still need an owner-facing path before cleanup lands, add a follow-up bead for a Projects-native archive:

- Route/query: `/mission-control?section=projects&view=archive`
- Or a compact "Archived tasks" link in the project switcher.
- Single-column list is preferred over reusing the old Journal archive layout.

Do not keep Journal archive UI solely to preserve project archive access.

## Implementation Phases

1. Preflight after Journal lands:
   - Pull/rebase `main`.
   - Confirm `/journal` exists and works.
   - Confirm Journal nav is installed/enabled behavior is settled.
2. Update Mission Control section model:
   - Remove `today` and `journalArchive`.
   - Default `normalizeSection` to `projects`.
   - Handle old query values.
3. Remove Today and Journal UI:
   - Delete template blocks.
   - Delete state, computed values, watchers, and methods.
   - Remove unused imports such as `DatePickerPopover` and capture type inference.
4. Replace default data loading:
   - Load projects from project APIs.
   - Load board tasks from task APIs.
   - Stop calling overview for default page load if possible.
5. Clean styles:
   - Remove dead daily capture/journal/archive CSS.
   - Verify no remaining class references are broken.
6. Update Mission Control plugin metadata copy.
7. Run quality gates and browser verification.

## Quality Gates

Run after implementation:

```bash
pnpm --filter @me3/web test
pnpm --filter @me3-core/worker test
pnpm build
```

Because this changes the web app, `pnpm build` is required before landing.

Use the in-app browser or Playwright screenshots to verify:

- `/mission-control` opens to Projects.
- `/mission-control?section=projects` opens to Projects.
- Old journal query values do not produce a broken view.
- Project picker still works.
- Project task board still loads.
- Add task still works.
- Drag/drop between board columns still works.
- Task detail modal still works.
- Local project summary and "Run locally" behavior still render when applicable.
- Accounts tab still appears only when enabled, if retained.
- Activity/Memory/Sources still work if retained.
- Desktop and mobile topbar controls do not overlap.
- Light and dark mode remain readable.

## Risks

- `mission-control.vue` is monolithic, so dead-state cleanup can easily remove something still used by Projects or settings sections.
- `loadOverview` currently hydrates several pieces of state at once; replacing it should be done carefully.
- Old links from account setup, assistant results, docs, or tests may still point to removed sections.
- Project archive access may disappear unless a follow-up is filed or a Projects-native archive is added.
- Parallel Journal plugin work will cause merge conflicts if this starts too early.

## Out Of Scope

- Redesigning Projects from kanban to a single-column collapsible list.
- Moving task/reminder/event creation into Assistant.
- Deleting Mission Control capture APIs.
- Dropping `mission_daily_notes`.
- Migrating old journal entries.
- Building selected-text Journal actions.
