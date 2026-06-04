# Mission Control Dashboard Roadmap

Planning source: refactor/redesign session on 2026-06-04.

## Product Direction

Mission Control should become the owner's calm operational dashboard. It should not be a full plugin dump, a writing workspace, or a kanban-first project manager.

New route shape:

- `/mission-control`: dashboard, default route.
- `/mission-control/projects`: projects and tasks workspace.
- `/mission-control/wheel-of-life`: existing full Wheel of Life workspace, retained.
- `/mission-control?section=projects`: redirect or normalize to `/mission-control/projects`.
- Legacy settings query sections can keep working during migration, but should move behind a dashboard settings surface or plugin-owned pages over time.

Default dashboard cards:

1. Daily Briefing: latest message from the Assistant Jobs `daily-briefing` recipe.
2. Mission Statement: editable owner statement, with the suggested prompt shape: `I am here to help ... by ...`.
3. Wheel of Life Snapshot: latest saved wheel snapshot.

Secondary dashboard section:

- Quick action buttons styled like the `/assistant` starter prompts, but implemented with reusable [Button.vue](/Users/kieranbutler/Coding/me3/apps/web/src/components/Button.vue).
- Defaults should be conditional and owner-editable:
  - `View Projects` -> `/mission-control/projects`.
  - `Write a blog` -> site wizard/blog step when the profile site is published and blog is active.
  - `Add Journal Entry` -> `/journal` when `me3.journal` is active.
  - `Schedule a post` -> `/social` when `me3.social-publishing` is active.
  - `Chat with ME3` -> `/assistant`.

## Pushback And Recommendations

Start with ordered cards, not freeform drag-resize layout. Reordering, adding, hiding, and changing card size is enough for the first useful version. True grid editing can come later if users actually need it.

Do not let plugin cards become arbitrary remote UI. The plugin manifest can advertise card availability, but the web app should resolve first-party card component keys from a local registry. This keeps dashboard code auditable and avoids turning plugin metadata into executable UI.

Move Wheel of Life data out of component-local `localStorage` before making the dashboard card depend on it. The card can read localStorage as a temporary bridge, but the stable design should use plugin-owned D1 storage and an API so snapshots follow the owner across devices.

Do not keep full plugin workspaces inside Mission Control long-term. Accounts currently exists as a Mission Control primary tab. In the new model, Accounts should contribute a summary card and quick action, while its full ledger eventually becomes its own plugin page.

Keep the project list visually quieter than the current board. The default projects/tasks view should use one column, project group headers, row dividers, and inline controls. Do not turn each task row into a card.

## Current Architecture Notes

- [mission-control.vue](/Users/kieranbutler/Coding/me3/apps/web/src/pages/mission-control.vue) is a large page-level implementation containing project kanban, accounts, activity, memory, sources, and modals.
- Mission Control already uses owner-scoped project/task APIs: `GET/POST /api/mission-control/projects` and `GET/POST/PATCH/DELETE /api/mission-control/tasks`.
- The current task board is kanban-first with statuses `backlog`, `in_progress`, `review`, and `done`.
- Plugin manifests already expose simple `uiSlots`, but those slots are descriptive. They need a richer dashboard contribution contract.
- Daily Briefing already exists as an Assistant Jobs starter recipe. Runs write Mission Control activity with briefing metadata.
- Wheel of Life is currently a frontend component with `localStorage` state, not a server-backed plugin model.
- Shared UI guidance says to use `--ui-*` tokens, avoid nested cards, keep operational UI calm, and reuse shared primitives.

## Projects And Tasks Redesign

The projects/tasks workspace moves to `/mission-control/projects`.

Default view:

- One-column task list grouped by project.
- Project selector/popover remains available in the topbar.
- The existing `Add project` button remains in the selector.
- The selected project narrows the list to one project; `All` groups tasks by project.
- Active tasks appear by default: `backlog`, `in_progress`, and `review`.
- Done and archived tasks should be reachable through filters or archive controls, not mixed into the default list.
- Rows should support status changes, task detail modal, archive/delete, due date display, and local-run affordances where applicable.

Kanban:

- Keep the current kanban board as an optional view.
- Add a Mission Control setting, default `kanbanEnabled: false`.
- When disabled, hide kanban UI entirely.
- When enabled, show a compact list/kanban view switcher on `/mission-control/projects`, with list still the default.

API adjustment:

- Add an explicit task filter for the default list, for example `GET /api/mission-control/tasks?active=1`.
- Keep existing `status`, `projectId`, `archived`, `limit`, and `cursor` behavior.
- Avoid relying on client-side filtering to hide `done` or `cancelled` tasks in the default list.

## Dashboard Card System

Add a first-party dashboard registry with two layers:

1. Manifest contribution metadata from enabled plugins.
2. Local web component registry that maps known card ids/component keys to Vue components.

Suggested manifest extension:

```ts
type DashboardCardContribution = {
  id: string;
  pluginId: string;
  label: string;
  componentKey: string;
  defaultEnabled: boolean;
  defaultSize: "small" | "medium" | "wide";
  dataEndpoint?: string;
  requiresPluginIds?: string[];
  requiresCapabilityIds?: string[];
};

type DashboardQuickActionContribution = {
  id: string;
  pluginId: string;
  label: string;
  icon: string;
  defaultEnabled: boolean;
  route?: string;
  assistantPrompt?: string;
  requiresPluginIds?: string[];
};
```

First-party card examples:

- `mission.daily-briefing`
- `mission.mission-statement`
- `mission.wheel-latest-snapshot`
- `mission.projects-summary`
- `accounts.summary`
- `calendar.today`
- `journal.latest-entry`
- `social.queue-summary`

Plugin cards should only be available when their plugin is active. If a plugin is deactivated, preserve the user's dashboard setting but hide the card until the plugin returns.

## Dashboard Persistence

For the first version, a single owner-scoped settings row is enough:

```sql
CREATE TABLE IF NOT EXISTS mission_dashboard_settings (
  user_id TEXT PRIMARY KEY DEFAULT 'owner',
  cards_json TEXT NOT NULL DEFAULT '[]',
  quick_links_json TEXT NOT NULL DEFAULT '[]',
  settings_json TEXT NOT NULL DEFAULT '{}',
  mission_statement TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`cards_json` stores ordered card instances:

```ts
type DashboardCardInstance = {
  instanceId: string;
  cardId: string;
  pluginId: string;
  enabled: boolean;
  size: "small" | "medium" | "wide";
  sortOrder: number;
  config?: Record<string, unknown>;
};
```

`quick_links_json` stores editable action buttons:

```ts
type DashboardQuickLink = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  sortOrder: number;
  kind: "route" | "assistant_prompt";
  route?: string;
  assistantPrompt?: string;
  requiresPluginId?: string;
};
```

This JSON-row approach is intentionally simple. Normalize later only if dashboard settings become multi-user, collaborative, or query-heavy.

## Dashboard API

Add Mission Control dashboard endpoints:

- `GET /api/mission-control/dashboard`
  - Returns available card contributions, resolved card instances, quick links, dashboard settings, and first-load data for default cards.
- `PATCH /api/mission-control/dashboard`
  - Updates card order, card visibility, card size, quick links, mission statement, and view settings such as `kanbanEnabled`.
- `GET /api/mission-control/dashboard/cards/:cardId`
  - Optional later endpoint for lazy card refreshes.

Default card data:

- Daily Briefing: latest `mission_plugin_activity` row produced by the `daily-briefing` Assistant Job. If none exists, show an empty state with a path to configure the job in `/assistant`.
- Mission Statement: stored in `mission_dashboard_settings.mission_statement`.
- Wheel Snapshot: latest server-backed Wheel of Life snapshot. During migration, a temporary frontend bridge can read the existing localStorage key.

## Wheel Of Life Follow-Up

Move Wheel of Life to plugin-owned storage:

```sql
CREATE TABLE IF NOT EXISTS mission_wheel_settings (
  user_id TEXT PRIMARY KEY DEFAULT 'owner',
  segments_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mission_wheel_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  segments_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mission_wheel_snapshots_user_created
  ON mission_wheel_snapshots(user_id, created_at);
```

Add endpoints:

- `GET /api/mission-control/wheel`
- `PATCH /api/mission-control/wheel`
- `POST /api/mission-control/wheel/snapshots`
- `GET /api/mission-control/wheel/snapshots?limit=1`

Then update the full Wheel page and dashboard card to share the same API/composable.

## Frontend Components

Extract reusable components instead of growing [mission-control.vue](/Users/kieranbutler/Coding/me3/apps/web/src/pages/mission-control.vue):

- `components/dashboard/DashboardCardShell.vue`
- `components/dashboard/DashboardCardGrid.vue`
- `components/dashboard/DashboardQuickActions.vue`
- `components/mission-control/cards/DailyBriefingCard.vue`
- `components/mission-control/cards/MissionStatementCard.vue`
- `components/mission-control/cards/WheelSnapshotCard.vue`
- `components/mission-control/projects/ProjectPickerPopover.vue`
- `components/mission-control/projects/ProjectTaskList.vue`
- `components/mission-control/projects/ProjectKanbanBoard.vue`
- `components/mission-control/projects/ProjectTaskDetailModal.vue`

Reuse:

- [Button.vue](/Users/kieranbutler/Coding/me3/apps/web/src/components/Button.vue) for quick actions and modal actions.
- [Card.vue](/Users/kieranbutler/Coding/me3/apps/web/src/components/Card.vue), after updating it to use `--ui-*` tokens consistently.
- [UiIcon.vue](/Users/kieranbutler/Coding/me3/apps/web/src/components/UiIcon.vue) for action icons.

Layout guidance:

- Dashboard max width around 960-1040px.
- One column on mobile.
- Two-column card grid on desktop, with `wide` cards spanning both columns.
- Daily Briefing should default to `wide`.
- Mission Statement and Wheel Snapshot can default to `medium`.
- Quick actions should be pill buttons in a centered flex wrap, visually close to the `/assistant` starter prompts.
- No decorative hero, no nested cards, no oversized marketing layout.

## Migration Plan

1. Routing shell
   - Change `/mission-control` into a dashboard placeholder.
   - Move the existing projects workspace to `/mission-control/projects`.
   - Redirect old `section=projects` links.
   - Keep `/mission-control/wheel-of-life` working.

2. Project extraction
   - Extract project picker, project modal, task detail modal, task board, and task helpers out of the monolith.
   - Preserve existing kanban behavior behind a temporary internal flag.

3. Default task list
   - Build grouped one-column list.
   - Add explicit active-task API filtering.
   - Add simple status controls and task detail affordances.
   - Keep kanban disabled by default.

4. Dashboard settings and cards
   - Add `mission_dashboard_settings` migration.
   - Add dashboard GET/PATCH endpoints.
   - Implement default card instances and editable mission statement.

5. Wheel storage
   - Add Wheel API and snapshot storage.
   - Migrate existing browser-local state opportunistically when the owner opens Wheel of Life.
   - Use the new latest snapshot endpoint for the dashboard card.

6. Plugin contributions
   - Extend plugin manifest types for dashboard cards and quick actions.
   - Add first-party local card registry.
   - Add Accounts summary card using existing `/accounts/stats`.
   - Add conditional quick actions for Journal, Social Publishing, Sites/blog, and Assistant.

7. Settings and polish
   - Add dashboard edit mode for add/remove/reorder cards and quick actions.
   - Add Mission Control setting for kanban visibility.
   - Verify light/dark mode and mobile/desktop layouts.

## Quality Gates For Implementation

When implementation starts, run:

```bash
pnpm --filter @me3/web test
pnpm --filter @me3-core/worker test
pnpm build
```

Browser verification:

- `/mission-control` opens to the dashboard.
- `/mission-control/projects` opens to the grouped task list.
- `/mission-control?section=projects` redirects or lands safely.
- Project picker and `Add project` still work.
- Task create, status update, archive, detail modal, and local-run affordances still work.
- Kanban is hidden by default and only appears after enabling it in settings.
- Dashboard cards can be added, removed, reordered, and restored.
- Default cards render useful empty states.
- Quick actions hide or disable cleanly when their required plugins are inactive.
- Light mode, dark mode, desktop, and mobile all remain clean.

## Open Questions

- Should Mission Statement be plain text only, or should it support a small structured template with editable variables?
- Should Accounts get its own `/accounts` page in the same pass, or should the first pass link to the existing temporary Mission Control accounts surface?
- Should dashboard quick links support arbitrary owner-defined routes in MVP, or only a curated set of internal destinations and assistant prompts?
- Should card ordering use buttons first for accessibility, with drag-and-drop added later?
