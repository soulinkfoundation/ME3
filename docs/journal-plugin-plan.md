# ME3 Journal Plugin Plan

Source of truth: bead `me3-3ic`.

## Product Decision

Journal should become a first-party optional plugin instead of a tab inside Mission Control.

Mission Control should stop competing with Journal and Assistant:

- Journal owns human writing capture: daily notes, braindumps, drafts, and later longer-form writing.
- Assistant owns conversational action: task creation, reminders, events, bookings, site edits, project-aware jobs, and automation.
- Mission Control owns operational review: for this pass, its visible default workspace becomes the current Projects board.

The old Mission Control journal entries do not need to be migrated. The new Journal plugin should use fresh APIs and storage. Existing Mission Control journal data can remain in place as legacy data because `mission_capture_items` currently references `mission_daily_notes`; this plan only stops using that table for the new Journal surface.

## Plugin Shape

Plugin id: `me3.journal`

Package: `@me3-core/plugin-journal`

Route: `/journal`

Default enabled: `false`

Navigation: side-nav item only when the plugin is installed and enabled.

Suggested nav label/icon:

- Label: `Journal`
- Emoji: `📝`

Capabilities:

- `workspace.journal`
- `journal.entries.manage`

Permissions:

- `journal.entries.manage`: Create and manage private journal entries.

Routes:

- `GET /api/journal/days/:date`
- `PATCH /api/journal/days/:date`
- `GET /api/journal/archive`

Future routes:

- `POST /api/journal/entries` for non-daily drafts.
- `PATCH /api/journal/entries/:id` for titled drafts, posts, and archived entries.
- `POST /api/journal/entries/:id/send-to-assistant` once selection/actions exist.

## Data Model

Add a new migration, likely `apps/worker/migrations/0026_journal_plugin.sql`.

```sql
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  entry_date TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  body_format TEXT NOT NULL DEFAULT 'plain_text'
    CHECK (body_format IN ('plain_text', 'markdown', 'html')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  UNIQUE(user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date
  ON journal_entries(user_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_updated
  ON journal_entries(user_id, updated_at);
```

For MVP, use one daily entry per user/date. Empty entries do not need to appear in archive results.

## API Behavior

`GET /api/journal/days/:date`

- Requires owner auth.
- Requires `me3.journal` enabled.
- Validates `YYYY-MM-DD`.
- Returns `{ entry: JournalEntry | null }`.
- Does not create a row just because the user viewed a date.

`PATCH /api/journal/days/:date`

- Requires owner auth.
- Requires `me3.journal` enabled.
- Validates `YYYY-MM-DD`.
- Upserts the daily entry.
- Accepts `{ title?: string | null, body: string, bodyFormat?: "plain_text" | "markdown" | "html" }`.
- Returns `{ entry: JournalEntry }`.

`GET /api/journal/archive`

- Requires owner auth.
- Requires `me3.journal` enabled.
- Lists non-empty, non-archived entries newest first.
- Supports `limit` now and cursor pagination later.
- Returns compact previews plus full body only for the selected entry if the UI needs that. For the first pass, returning full body in each row is acceptable because entries are small D1 text.

## Frontend Shape

Add `apps/web/src/pages/journal.vue`.

The page should be a calm single-column writing workspace:

- Sticky topbar.
- Centered day switcher.
- Archive affordance.
- Large autosaving textarea.
- Visible `Saving`, `Saved`, and error states.
- No task/reminder/event capture row.
- No project picker.
- No Mission Control settings menu.
- No chat mode or assistant response expectation.

The Journal page should use the same app shell and side nav as the rest of ME3.

## Reuse Targets

The current Mission Control page is too entangled to copy wholesale. Reuse the small useful pieces only.

Direct reuse:

- `apps/web/src/components/calendar/DatePickerPopover.vue`
- `apps/web/src/components/UiIcon.vue`
- Existing date label behavior from `mission-control.vue`: current date shows `Today`, other dates use the compact day label.

Lift or extract:

- Date helper functions from `apps/web/src/pages/mission-control.vue`:
  - `todayKey`
  - `dateToKey`
  - `monthKey`
  - `addDays`
  - `normalizeLocalDateInput`
  - `formatDaySwitcherDate`
- Journal autosave pattern:
  - debounce save by roughly 700ms
  - flush pending save before changing selected date
  - reset save state when a new entry loads
- Textarea styling from:
  - `.journal-sheet`
  - `.journal-editor__textarea`
  - `.journal-editor__status`

Preferred extraction:

- Create a small date utility module if the same helpers remain useful outside Journal.
- Create a focused `JournalEditor` component only if it reduces duplication. Avoid extracting from the Mission Control monolith until the Journal UI is working.

Avoid reusing:

- Capture row and capture type inference.
- Capture list rendering.
- Weekly review panels.
- Mission Control settings menu.
- Project archive switching.
- Accounts/activity/memory/source sections.

## Mission Control Reduction

After `/journal` exists, reduce `apps/web/src/pages/mission-control.vue`:

- Remove `today` from the primary sections.
- Make `projects` the default normalized section.
- Remove the Journal tab label and day switcher from Mission Control.
- Remove the journal textarea from Mission Control.
- Remove the journal archive UI from Mission Control.
- Keep the current Projects kanban view as-is for this pass.

Temporary compatibility is acceptable:

- Mission Control APIs for captures/tasks can stay.
- `mission_daily_notes` can stay because current capture storage depends on it.
- Activity, memory, sources, and setup can stay behind existing internal/settings affordances if removing them creates too much unrelated churn.

Longer term, Mission Control can become a simpler status/review page or a project list with collapsible project sections, but that is out of scope for this pass.

## Plugin Catalog And Nav Work

Worker:

- Add `packages/journal/src/index.ts` with `JOURNAL_PLUGIN_ID` and `JOURNAL_RUNTIME`.
- Add `packages/journal/package.json` and `tsconfig.json`.
- Add the package to `pnpm-workspace.yaml` if needed.
- Add `@me3-core/plugin-journal` to worker and web package dependencies.
- Add a `JOURNAL_PLUGIN` catalog entry in `apps/worker/src/plugins.ts`.
- Add the migration to the plugin manifest.
- Add a `requireJournalPlugin` guard in `apps/worker/src/index.ts`.
- Add journal route handlers or a small `apps/worker/src/journal.ts` module.

Web:

- Add `/journal` route/page.
- Add side-nav installed state for `me3.journal`.
- Add `me3.journal` to `pluginNavEmojis`.
- Do not add Journal to `RECOMMENDED_START_PLUGIN_IDS` unless the product decision changes from optional to default.

## Implementation Phases

1. Add package and catalog entry.
2. Add migration and worker journal module.
3. Add journal API routes and worker tests.
4. Add `/journal` page using the existing `DatePickerPopover` and lifted textarea/autosave behavior.
5. Add side-nav wiring for installed Journal plugin.
6. Reduce Mission Control default behavior to Projects.
7. Run quality gates and inspect `/journal` and `/mission-control` in light/dark and desktop/mobile.

## Quality Gates

Run after implementation:

```bash
pnpm --filter @me3-core/worker test
pnpm --filter @me3/web test
pnpm build
```

Because this changes the web app, `pnpm build` is required before landing.

Use the in-app browser or Playwright screenshots to verify:

- `/journal` loads when the plugin is enabled.
- `/journal` is hidden or blocked when the plugin is disabled.
- Autosave works after typing.
- Changing date flushes pending save.
- Archive lists only non-empty entries.
- `/mission-control` opens directly to the Projects board.
- Mobile topbar controls do not overlap.
- Light and dark mode remain readable.

## Open Decisions

- Whether Journal should support Markdown immediately or remain plain text for MVP.
- Whether archive preview should be a route, drawer, or inline split view.
- Whether Project archive needs a replacement link before the Journal archive is removed from Mission Control.
- Whether selected text actions should be implemented as a Journal plugin capability or routed through Assistant tooling later.
