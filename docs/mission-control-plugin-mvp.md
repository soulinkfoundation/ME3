# ME3 Core Mission Control Plugin MVP

Source of truth: bead `me3-q6s.3.1` under parent `me3-q6s.3`.

Mission Control is the default first-party base workspace for Core users. It makes the assistant visible without turning Core into a pile of optional features: day capture, tasks, projects, approvals, agent run history, plugin activity, private memory, context sources, setup status, and an optional local daemon bridge for explicitly approved local files and repos.

The Captain's Log is the reference implementation for power-user workflows, especially daily capture, journal autosave, beads/project aggregation, ME3 dispatch state, and agent-run visibility. Mission Control should reuse those product lessons while becoming more generic, calmer, and friendlier for non-builder Core users.

## Product Shape

Route: `/mission-control`

Navigation: first-party plugin nav item with rocket emoji `🚀`, labelled `Mission Control`.

Default screen: Today. The top bar keeps the day switcher centered:

```text
<       Today / Thu 14th May       >
```

The first viewport should be quiet and task-oriented:

1. A compact top navbar with workspace sections: `Today`, `Projects`, `Approvals`, `Runs`, `Memory`, `Sources`, `Setup`.
2. A centered day switcher. `Today` is the default label for the current local date; other days use `Thu 14th May` style.
3. A single capture row for `task`, `reminder`, and `event`.
4. A daily list of open captures and completed items.
5. A full-width journal editor below the capture list.

Reminders and events should write through the Calendar plugin when it is installed. If Calendar is disabled, Mission Control still stores the capture, marks calendar sync as pending/setup-blocked, and points the user at setup.

Useful Captain's Log behavior to carry forward:

- Natural capture type inference: task by default, reminder for "remind me...", event for meeting/date/time phrases.
- Manual type toggle with familiar symbols: task check, reminder clock, event calendar.
- Autosaving daily journal with visible "Saving" / "Saved" state.
- Open/done/archived capture item states.
- Project selection, but default to a friendly `Personal` project instead of ecosystem-specific project names.
- Carry-over support for unfinished items in weekly review or tomorrow planning.
- ME3 dispatch records for captures that sync into another Core surface.
- Agent run summaries with changed files, quality gates, branch/main result, and concise run notes.

## Plugin Manifest

Package: `@me3-core/plugin-mission-control`

Plugin id: `me3.mission-control`

Default: enabled by default for new Core installs after owner setup.

Implementation status for MVP: `bundled`.

Suggested catalog entry:

```ts
const MISSION_CONTROL_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: "me3.mission-control",
  name: "ME3 Mission Control",
  version: "0.1.0",
  description:
    "Default first-party Core workspace for daily capture, tasks, projects, approvals, agent run history, plugin activity, private memory, context sources, setup status, and optional local-daemon bridge.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: true,
  implementationStatus: "bundled",
  capabilityIds: [
    "workspace.mission_control",
    "workspace.daily_capture",
    "workspace.tasks",
    "workspace.approvals",
    "workspace.private_memory",
    "workspace.context_sources",
    "workspace.agent_runs",
    "workspace.local_daemon_bridge"
  ],
  permissions: [
    { id: "mission.capture.manage", label: "Create and manage daily captures and journal entries" },
    { id: "mission.tasks.manage", label: "Create and manage Mission Control tasks and projects" },
    { id: "mission.approvals.manage", label: "Review and resolve assistant approvals" },
    { id: "mission.memory.manage", label: "Store and manage private owner memory" },
    { id: "mission.context_sources.manage", label: "Manage private context source inventory" },
    { id: "mission.agent_runs.read", label: "Read agent run history and plugin activity" },
    { id: "mission.daemon.pair", label: "Pair optional local daemon bridges" }
  ],
  routes: [
    { id: "mission.overview.api", path: "/api/mission-control/overview", methods: ["GET"], auth: "owner" },
    { id: "mission.day.api", path: "/api/mission-control/days/:date", methods: ["GET", "PATCH"], auth: "owner" },
    { id: "mission.capture.api", path: "/api/mission-control/capture", methods: ["GET", "POST"], auth: "owner" },
    { id: "mission.capture.item.api", path: "/api/mission-control/capture/:id", methods: ["PATCH", "DELETE"], auth: "owner" },
    { id: "mission.projects.api", path: "/api/mission-control/projects", methods: ["GET", "POST"], auth: "owner" },
    { id: "mission.tasks.api", path: "/api/mission-control/tasks", methods: ["GET", "POST"], auth: "owner" },
    { id: "mission.task.api", path: "/api/mission-control/tasks/:id", methods: ["PATCH", "DELETE"], auth: "owner" },
    { id: "mission.approvals.api", path: "/api/mission-control/approvals", methods: ["GET"], auth: "owner" },
    { id: "mission.approval.api", path: "/api/mission-control/approvals/:id", methods: ["POST"], auth: "owner" },
    { id: "mission.runs.api", path: "/api/mission-control/agent-runs", methods: ["GET"], auth: "owner" },
    { id: "mission.memory.api", path: "/api/mission-control/memory", methods: ["GET", "POST"], auth: "owner" },
    { id: "mission.context-sources.api", path: "/api/mission-control/context-sources", methods: ["GET", "POST"], auth: "owner" },
    { id: "mission.daemon.api", path: "/api/mission-control/daemon/*", methods: ["GET", "POST", "PATCH"], auth: "owner" }
  ],
  uiSlots: [
    { id: "mission.dashboard.nav", slot: "dashboard.nav", label: "🚀 Mission Control" },
    { id: "mission.workspace.page", slot: "dashboard.page", label: "Mission Control" },
    { id: "mission.setup.panel", slot: "account.plugins.setup", label: "Mission Control setup" },
    { id: "mission.approvals.panel", slot: "app.shell.alerts", label: "Pending approvals" }
  ],
  agentTools: [
    { id: "mission.capture.create", label: "Create daily capture", sideEffect: "internal_write", approvalMode: "none" },
    { id: "mission.task.create", label: "Create task", sideEffect: "internal_write", approvalMode: "approval_required" },
    { id: "mission.memory.write", label: "Write private memory", sideEffect: "internal_write", approvalMode: "approval_required" },
    { id: "mission.approval.request", label: "Request owner approval", sideEffect: "internal_write", approvalMode: "none" },
    { id: "mission.daemon.read", label: "Read approved local context through paired daemon", sideEffect: "local_read", approvalMode: "approval_required" },
    { id: "mission.daemon.write", label: "Write approved local files through paired daemon", sideEffect: "local_write", approvalMode: "approval_required" },
    { id: "mission.daemon.shell", label: "Run approved local shell command through paired daemon", sideEffect: "local_shell", approvalMode: "approval_required" }
  ],
  secrets: [],
  migrations: [
    { id: "mission.0015", path: "./apps/worker/migrations/0015_mission_control_plugin.sql", destructive: false }
  ],
  queuesAndCrons: [],
  notes: [
    "Mission Control is bundled as a first-party package and enabled by default.",
    "Public me.json remains Core-owned and separate from plugin private memory.",
    "Local daemon access is optional, owner-paired, path-scoped, and approval-gated."
  ]
};
```

## Data Model

All tables are owner-scoped and plugin-owned unless noted. Use D1 for metadata and small text. Use R2 only for larger imported files, attachments, or agent-run artifacts.

```sql
CREATE TABLE mission_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  color TEXT,
  icon TEXT,
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'daemon_repo', 'beads', 'import')),
  source_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, slug)
);

CREATE TABLE mission_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog'
    CHECK (status IN ('backlog', 'in_progress', 'review', 'done', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 3,
  due_at TEXT,
  scheduled_for TEXT,
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'capture', 'agent', 'beads', 'daemon')),
  source_ref TEXT,
  approval_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  FOREIGN KEY (project_id) REFERENCES mission_projects(id) ON DELETE SET NULL
);

CREATE TABLE mission_daily_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  date TEXT NOT NULL,
  title TEXT,
  journal_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)
);

CREATE TABLE mission_capture_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  day_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task', 'reminder', 'event')),
  text TEXT NOT NULL,
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done', 'archived')),
  task_id TEXT,
  calendar_event_id TEXT,
  reminder_id TEXT,
  due_at TEXT,
  event_start_at TEXT,
  event_end_at TEXT,
  timezone TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local'
    CHECK (sync_status IN ('local', 'pending', 'synced', 'failed', 'setup_required')),
  sync_error TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'agent', 'import', 'carry_over')),
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (day_id) REFERENCES mission_daily_notes(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES mission_projects(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES mission_tasks(id) ON DELETE SET NULL
);
```

Approvals, runs, activity, memory, and sources:

```sql
CREATE TABLE mission_approvals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  plugin_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  requested_by TEXT NOT NULL DEFAULT 'agent',
  resolved_by TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  expires_at TEXT
);

CREATE TABLE mission_agent_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  source TEXT NOT NULL DEFAULT 'core'
    CHECK (source IN ('core', 'daemon', 'hosted_cloud', 'import')),
  project_id TEXT,
  task_id TEXT,
  approval_id TEXT,
  title TEXT NOT NULL,
  prompt_summary TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  model TEXT,
  runner_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  cost_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  artifact_manifest_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mission_agent_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES mission_agent_runs(id) ON DELETE CASCADE
);

CREATE TABLE mission_plugin_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  plugin_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT,
  related_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mission_private_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  memory_kind TEXT NOT NULL
    CHECK (memory_kind IN ('owner_note', 'project_context', 'preference', 'relationship_note', 'correction', 'learning')),
  scope_kind TEXT NOT NULL DEFAULT 'owner'
    CHECK (scope_kind IN ('owner', 'project', 'contact', 'plugin')),
  scope_id TEXT,
  title TEXT,
  body TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'agent', 'import', 'daemon')),
  source_ref TEXT,
  review_status TEXT NOT NULL DEFAULT 'active'
    CHECK (review_status IN ('active', 'needs_review', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mission_context_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('public_me_json', 'private_memory', 'core_table', 'plugin_table', 'daemon_directory', 'daemon_repo', 'provider', 'upload', 'url')),
  label TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'setup_required', 'paused', 'failed', 'archived')),
  source_ref TEXT,
  last_indexed_at TEXT,
  grants_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Daemon bridge tables:

```sql
CREATE TABLE mission_daemon_pairings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  runner_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  public_key TEXT,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'paused', 'revoked', 'unhealthy')),
  version TEXT,
  platform TEXT,
  last_seen_at TEXT,
  health_json TEXT NOT NULL DEFAULT '{}',
  paired_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, runner_id)
);

CREATE TABLE mission_daemon_allowlist_entries (
  id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL,
  label TEXT NOT NULL,
  path_hint TEXT NOT NULL,
  resource_kind TEXT NOT NULL CHECK (resource_kind IN ('directory', 'repo')),
  permission_tier TEXT NOT NULL DEFAULT 'metadata'
    CHECK (permission_tier IN ('metadata', 'read', 'write', 'shell')),
  shell_policy_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'revoked', 'missing')),
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pairing_id) REFERENCES mission_daemon_pairings(id) ON DELETE CASCADE
);

CREATE TABLE mission_daemon_audit_events (
  id TEXT PRIMARY KEY,
  pairing_id TEXT,
  allowlist_entry_id TEXT,
  run_id TEXT,
  approval_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('pair_requested', 'paired', 'grant_added', 'grant_changed', 'grant_revoked', 'health_check', 'metadata_read', 'file_read', 'file_write', 'shell_run', 'denied', 'error')),
  actor TEXT NOT NULL DEFAULT 'owner',
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pairing_id) REFERENCES mission_daemon_pairings(id) ON DELETE SET NULL,
  FOREIGN KEY (allowlist_entry_id) REFERENCES mission_daemon_allowlist_entries(id) ON DELETE SET NULL
);
```

Indexes should cover user/date, project/status, task/status, approval/status, run/status, source/status, daemon last seen, and daemon audit created time.

## Route Contracts

Owner-facing routes:

- `GET /api/mission-control/overview?date=YYYY-MM-DD`: day record, captures, tasks due today, pending approvals, recent runs, setup status, daemon health, plugin activity summary.
- `GET /api/mission-control/days/:date`: daily note plus captures for the date.
- `PATCH /api/mission-control/days/:date`: save journal text/title.
- `POST /api/mission-control/capture`: create task/reminder/event capture. For reminders/events, also call Calendar plugin APIs when enabled.
- `PATCH /api/mission-control/capture/:id`: update status, text, parsed time, project, sync state.
- `DELETE /api/mission-control/capture/:id`: archive capture item.
- `GET/POST/PATCH /api/mission-control/projects`: manage friendly project list and imported repo/project records.
- `GET/POST/PATCH/DELETE /api/mission-control/tasks`: manage plugin tasks. Deleting archives by default.
- `GET /api/mission-control/approvals`: list pending/recent approvals.
- `POST /api/mission-control/approvals/:id`: approve/reject/cancel with optional owner note.
- `GET /api/mission-control/agent-runs`: list run history.
- `GET /api/mission-control/plugin-activity`: list plugin events.
- `GET/POST/PATCH/DELETE /api/mission-control/memory`: owner-approved private memory CRUD.
- `GET/POST/PATCH/DELETE /api/mission-control/context-sources`: source inventory and indexing setup.
- `GET /api/mission-control/setup`: setup checklist for Calendar, AI provider, approvals, daemon, memory review, plugin readiness.

Daemon routes:

- `POST /api/mission-control/daemon/pairing/start`: owner creates a short-lived pairing code.
- `POST /api/mission-control/daemon/pairing/complete`: daemon exchanges code for a scoped daemon token.
- `POST /api/mission-control/daemon/heartbeat`: daemon reports version, platform, health, allowed path summaries, and last job state.
- `GET /api/mission-control/daemon/jobs`: daemon polls for owner-approved local jobs.
- `POST /api/mission-control/daemon/jobs/:id/events`: daemon appends run/audit events.
- `POST /api/mission-control/daemon/jobs/:id/complete`: daemon submits result summary and artifact manifest.
- `GET/POST/PATCH/DELETE /api/mission-control/daemon/allowlist`: owner manages directory/repo allowlist entries from the Core UI.
- `GET /api/mission-control/daemon/audit`: owner views local access audit history.

The Worker should not require inbound access to the user's computer. The daemon polls Core for approved jobs, so self-hosted and hosted installs behave consistently behind NAT.

## Local Daemon Bridge

The local daemon is optional. Mission Control works without it.

Responsibilities:

- Pair with one Core install using a one-time code and a long-lived daemon token stored locally outside the repo.
- Poll Core for approved local jobs.
- Enforce local allowlists before reading files, writing files, or running shell commands.
- Report health and audit events back to Core.
- Keep raw local file contents local unless a specific approved read job asks for content.

Permission tiers:

- `metadata`: path exists, repo name, git branch/status summary, beads issue count, file tree names when explicitly requested. No file contents.
- `read`: read file contents, search within allowlisted paths, compute hashes, summarize context.
- `write`: create/update/delete files only inside allowlisted paths. Requires owner approval per job unless the user creates a narrow standing rule later.
- `shell`: run commands only in allowlisted repos/directories. Requires owner approval per job and a command policy.

Shell policy should include:

- Working directory.
- Allowed command families, for example `pnpm build`, `pnpm test`, `git status`, `bd sync`.
- Denied command patterns, including force push, destructive reset/checkout, secret-printing commands, and broad home-directory scans.
- Max runtime, max output, and max artifact size.

Health checks:

- Daemon version matches minimum supported version.
- Token valid and not revoked.
- Clock skew acceptable.
- Each allowlisted path exists.
- Repo paths report branch, dirty state, upstream, and default branch.
- Required tools available per granted tier: `git`, `bd`, package manager, shell runtime.
- Last poll, last successful job, last failed job, and current queue length.

Audit events:

- Pairing started/completed/revoked.
- Allowlist entry added/changed/revoked.
- Every metadata read, file read, file write, and shell run.
- Denials with reason.
- Health degradation and recovery.
- Job result summary, changed file count, command exit codes, and artifact references.

The current `~/.me3` local runner proves the core pattern: runner id, API base, token env name, allowed repos, repo policies, log directory, poll interval, max runtime, and run logs. The MVP bridge should generalize that into a user-facing setup model and avoid hardcoded project names.

## Security Model

Public `me.json` stays Core-owned and public. Mission Control private memory is plugin-owned and never written to `me.json` unless the owner explicitly publishes or maps selected public profile fields through a Core-owned flow.

Safe defaults:

- Mission Control routes are owner-only.
- Daemon bridge is disabled until explicitly paired.
- New daemon grants start at `metadata`, not `read`.
- `write` and `shell` are separate grants and always approval-gated in MVP.
- Agent-created tasks and memory writes should request approval when they affect future behavior or external actions.
- Reminder/event captures can be owner-created without a separate approval because the owner is directly entering them.
- External provider writes, local writes, local shell, publishing, sending, booking, and payment-related actions require explicit approval and audit.

Token handling:

- Owner session remains Core-owned.
- Pairing codes are short-lived and one-use.
- Daemon tokens are hashed in D1 and stored locally by the daemon.
- Any token or secret material in Core uses the existing install encryption key pattern where storage of recoverable secret material is required.
- API responses return hints and status, never raw tokens or local file contents by default.

Data retention:

- Store run summaries and artifact manifests by default.
- Avoid storing full command output beyond configured caps.
- Avoid storing full file contents unless the approved job created an artifact intended for Core.
- Make local audit exportable.

## Setup Flow

Activation:

1. Core owner setup completes.
2. Mission Control is default-enabled and `/mission-control` becomes the app landing path when installed.
3. Plugin migration creates a `Personal` project and today's daily note lazily on first visit.
4. Setup panel shows Calendar, AI provider, private memory review, context sources, and optional local daemon bridge.

Daily capture:

1. User opens `/mission-control`.
2. Day switcher defaults to Today.
3. User types a capture.
4. Type inference selects `task`, `reminder`, or `event`; user can toggle it.
5. Task creates a Mission Control task and capture item.
6. Reminder creates a capture item and Calendar reminder when Calendar is installed.
7. Event creates a capture item and Calendar event when Calendar is installed.
8. Journal autosaves for the selected day.

Daemon setup:

1. User chooses `Setup -> Local files and repos`.
2. Core explains that local access is optional and private.
3. User starts pairing; Core shows a one-time code and install command.
4. Daemon completes pairing and appears as `Connected`.
5. User adds directories/repos one by one.
6. Each entry starts as `metadata`; the user can upgrade to `read`, `write`, or `shell`.
7. Health checks run immediately and on every heartbeat.
8. Audit tab shows every local access event.

## Boundaries

Core owns:

- Owner auth, sessions, install secrets, D1/R2 bindings, setup-required states.
- Public profile and public `me.json`.
- Plugin registry, plugin activation, permission grants, and setup requirement display.
- Shared Calendar plugin APIs for events/reminders.
- Shared approval primitives if/when extracted below Mission Control.

Mission Control plugin owns:

- `/mission-control` page and section navigation.
- Daily notes, capture inbox, task/project workspace.
- Approval inbox UI and Mission Control approval records.
- Agent run history UI and run/event records.
- Plugin activity feed.
- Private memory surfaces and context source inventory.
- Daemon pairing metadata, allowlists, health summaries, and audit events.
- Friendly setup copy and setup checklist.

Local daemon owns:

- Local config and local token storage.
- Local directory/repo validation.
- Local file reads/writes and command execution.
- Local command allow/deny enforcement.
- Local run logs before summarized upload.
- Local health probes and audit event submission.

Hosted ME3 Cloud owns only hosted concerns:

- ME3 account identity, hosted install claim, and cross-device coordination.
- Hosted OAuth app credentials and managed provider setup where applicable.
- Managed queues/relays for daemon polling if a hosted install uses Cloud as coordination layer.
- Subscriptions, billing, quotas, support ops, and production Cloudflare routes.
- Optional hosted AI routing and hosted notification delivery.

Hosted Cloud must not own public/private boundary decisions for Core installs, must not receive local file contents except through explicit owner-approved jobs, and must not make local daemon access implicit.

## Starter Implementation Plan

1. Scaffold `packages/mission-control` with runtime constants, TypeScript types, capture parsing helpers, serializers, and tests.
2. Add `0015_mission_control_plugin.sql` with the tables above, plus indexes.
3. Register `me3.mission-control` in `apps/worker/src/plugins.ts` as bundled and default-enabled.
4. Add Worker routes under `/api/mission-control/*`, keeping Calendar writes behind the existing Calendar plugin contract.
5. Add `apps/web/src/pages/mission-control.vue` with the Today view first: navbar, centered day switcher, capture row, capture list, journal editor.
6. Add nav visibility for the rocket item when the plugin is installed.
7. Add setup panels for Calendar sync state, private memory, context sources, and daemon bridge placeholders.
8. Add approval/run/activity/memory/source tabs as read/write API surfaces, then deepen each UI.
9. Add daemon pairing and heartbeat endpoints with token hashing, health state, and audit writes.
10. Add the local daemon package/script only after the Core-side pairing and audit model exists.

Suggested follow-up beads:

- Scaffold the `@me3-core/plugin-mission-control` package and catalog manifest.
- Add Mission Control D1 migration and Worker route skeleton.
- Build the `/mission-control` Today UI with capture and journal autosave.
- Wire task/reminder/event capture to Mission Control and Calendar plugin records.
- Add approval, run history, plugin activity, private memory, and context source APIs.
- Implement daemon pairing, allowlists, health checks, and audit events.
- Add optional local daemon runner package with polling jobs and permission-tier enforcement.
