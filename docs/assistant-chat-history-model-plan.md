# Assistant Chat History Model Plan

Planning source of truth: `me3-3ic`.

Date: 2026-06-03

Related docs:

- [`docs/assistant-agent-console-plan.md`](assistant-agent-console-plan.md)
- [`docs/agent-context-roadmap.md`](agent-context-roadmap.md)
- [`docs/mission-control-cleanup-plan.md`](mission-control-cleanup-plan.md)
- [`docs/soulink-agent-chat-spike.md`](soulink-agent-chat-spike.md)

## Decision

ME3 should use a shared assistant thread/message model, with `/assistant` as the full history UI.

Do not add chat history to the main app side nav. The main nav should continue to show product
areas such as Assistant, Mission Control, Email, Journal, and Account.

Add an assistant-only secondary panel on `/assistant`, similar in spirit to the `/email` side rail.
The panel should contain a `New chat` button, a collapsible list of recent chats, and lightweight
grouping controls. It can be collapsed or hidden without changing the active chat.

Mission Control projects should be available as optional chat grouping metadata. This is advisable
because many assistant conversations will naturally belong to ongoing work, local projects, or
project-scoped jobs. It should remain optional because some chats are personal, exploratory, or
cross-project.

## Product Boundaries

`/assistant` owns conversational history:

- Full chat transcript view.
- Chat thread picker and search.
- New chat creation.
- Thread rename, pin, archive, delete, and export controls.
- Model, attachment, context, and job/action creation affordances.

Mission Control owns durable operational objects:

- Projects.
- Tasks.
- Approvals.
- Agent runs.
- Activity.
- Private memory.
- Context sources.
- Local executor project records.

Soulink owns portable messaging:

- Quick owner/assistant chat away from the ME3 UI.
- Notifications and replies.
- A bridge into the same assistant runtime, not a separate durable product model.

`AgentChatLauncher.vue` owns lightweight in-app capture:

- Quick command/chat entry on non-assistant pages.
- Current-page context handoff.
- Continue in `/assistant` when the owner needs history, attachments, model choice, or longer work.

## Transcript, Context, And Audit Split

Keep these records separate:

1. Assistant threads and messages.
   - User-facing conversation history.
   - Refresh-persistent.
   - Searchable, archivable, deletable, and exportable.

2. Thread context links.
   - References to projects, tasks, jobs, runs, email threads, contacts, sources, files, and Soulink
     channels.
   - Used to build context packets without stuffing every old message back into the prompt.

3. Audit events.
   - Durable structured records for actions, jobs, approvals, tool calls, local executor work, and
     external writes.
   - Not raw transcript storage.
   - Survive transcript deletion when needed for operational integrity, but should not expose more
     private chat text than required.

Deleting a chat transcript should delete or tombstone the thread/messages and detach thread context
links. It should not erase durable task/job/run/approval/audit records that already exist in Mission
Control.

## Recommended Data Model

Start with a Core-owned D1 model that can be migrated or adapted later.

```text
assistant_threads
- id
- user_id
- title
- origin_surface: assistant | launcher | soulink | job | system
- project_id nullable references mission_projects(id)
- status: active | archived | deleted
- pinned_at nullable
- archived_at nullable
- deleted_at nullable
- last_message_at
- created_at
- updated_at

assistant_messages
- id
- thread_id
- user_id
- role: user | assistant | system | tool
- content_text nullable
- content_json nullable
- model_provider nullable
- model_id nullable
- status: complete | streaming | failed | deleted
- created_at
- updated_at

assistant_thread_context
- id
- thread_id
- source_kind: project | task | job | run | approval | email_thread | contact | source | file | soulink_channel
- source_id
- label nullable
- visibility: private | public | internal
- created_at

assistant_message_attachments
- id
- message_id
- kind: image | text_file | pdf | csv | json | artifact
- name
- mime_type
- size_bytes
- storage_ref nullable
- extracted_text_ref nullable
- created_at
```

Existing `assistant_messages` usage should be reconciled before adding new tables. If the current
table can safely become the canonical message table, migrate toward the shape above instead of
creating a parallel store.

## Project Grouping

Project grouping is manageable and worth doing, with a narrow rule:

Each thread may have zero or one primary `mission_projects.id`.

This enables:

- A project-grouped chat list in `/assistant`.
- Project-scoped context packets.
- Easier handoff from Mission Control Projects into chat.
- Easier discovery of prior work for local executor projects.
- A future "open assistant for this project" action from Mission Control.

Do not require every message to carry a project id. The thread's primary project is enough for the
first pass. Use `assistant_thread_context` for additional project/task/job/run references when a
conversation touches multiple objects.

Recommended defaults:

- New chat from `/assistant`: no project by default, with a project picker available.
- New chat from Mission Control project: preselect that project.
- New chat from a project task or local run: set the task/run context link and the task's project as
  the primary project.
- New chat from `AgentChatLauncher.vue`: no project unless current page context clearly supplies one.
- Soulink-originated chat: no primary project unless the bridge receives explicit project context.

The Personal project may be shown as a filter/group if it already exists, but do not silently force
all ungrouped chats into Personal. "Ungrouped" is a useful state.

## `/assistant` Side Panel UX

Use the `/email` rail as the visual reference, but adapt it for chat history.

Desktop:

- Left secondary panel inside the assistant page.
- `New chat` button at the top.
- Collapsible sections:
  - Pinned.
  - Recent.
  - Projects.
  - Archived, either collapsed by default or behind a control.
- Each row shows thread title, last activity, and optional project marker.
- Active thread row has the same obvious selected state as the email folder rail.
- Panel can collapse to icons or hide entirely, with the active chat remaining in view.

Mobile:

- Do not keep a permanent second nav.
- Use a drawer/sheet launched from the assistant top controls or mobile page controls.
- `New chat` remains reachable without opening a dense history list when possible.

Search:

- Phase one can use a simple search input/filter within the side panel.
- Later, add server-side full-text search over title and recent message text.

Thread actions:

- Rename.
- Pin/unpin.
- Move to project.
- Archive.
- Delete.
- Export transcript.

Keep destructive actions in a menu or confirmation flow, not as row-level primary actions.

## Refresh Persistence

The first implementation should guarantee:

- Refreshing `/assistant` preserves the current thread.
- A new message appends to the selected thread.
- Opening `/assistant` without a thread selects the most recent active thread or starts a new empty
  draft state.
- Local draft composer text can remain browser-local until sent.

Thread ids should be route-addressable:

```text
/assistant
/assistant?thread=assistant_thread_id
```

Avoid a nested route until the core behavior is proven. Query params match existing ME3 page
patterns and make it easier to preserve the current app shell.

## API Plan

Add product-facing endpoints under `/api/assistant`.

```text
GET    /api/assistant/threads
POST   /api/assistant/threads
GET    /api/assistant/threads/:id
PATCH  /api/assistant/threads/:id
DELETE /api/assistant/threads/:id
POST   /api/assistant/threads/:id/archive
POST   /api/assistant/threads/:id/pin
DELETE /api/assistant/threads/:id/pin
GET    /api/assistant/threads/:id/export
GET    /api/assistant/threads/:id/messages
POST   /api/assistant/chat/turn
```

`POST /api/assistant/chat/turn` should accept an optional `threadId`. If omitted, the Worker creates
an assistant-origin thread. The response should return the resolved `threadId` so the UI can update
the route after the first send.

Thread list query parameters:

```text
projectId
status
pinned
originSurface
search
cursor
limit
```

## Context Behavior

The current thread contributes only a bounded recent-message window to a model call.

Longer history should be summarized or selected through the native context packet system from
`docs/agent-context-roadmap.md`.

Project grouping should influence context:

- If a thread has `project_id`, include a small project summary and open project tasks when useful.
- If a thread has linked task/job/run context, include those specific records.
- Do not include every project task by default.
- Always include a source manifest so the assistant can say what context it used.

## Soulink And Launcher Sharing

Use the same underlying thread/message model, but expose different UX.

Recommended behavior:

- `/assistant` shows all active assistant threads, including launcher-created threads if saved.
- `AgentChatLauncher.vue` can create or append to a lightweight thread, then offer "Open full
  assistant".
- Soulink can map its stable assistant channel to a thread or thread family, but should avoid dumping
  every portable message into the main `/assistant` Recent list unless that becomes useful.

First pass:

- `/assistant` and launcher share Core threads.
- Soulink remains bridged through existing assistant message plumbing, with a follow-up decision on
  whether to show Soulink-origin threads in `/assistant` by default.

## Retention And Privacy Defaults

Defaults:

- `/assistant` threads persist until archived or deleted.
- Launcher chats persist only when they create a thread or are continued in `/assistant`; otherwise
  local ephemeral behavior is acceptable.
- Archived threads are hidden from default Recent.
- Deleted threads are tombstoned first, then hard-deleted by a later cleanup if needed.
- Export produces transcript content and basic metadata, not internal audit logs.

Privacy:

- Do not use deleted transcript text in future context packets.
- Do not store raw provider prompts in audit records unless explicitly needed for debugging and
  protected by a development-only or owner-visible retention policy.
- Durable audit events should store structured summaries and object references.

## Implementation Phases

### Phase 1: Decision Record And Minimal Thread Persistence

- Add the final decision record from this plan.
- Reconcile current `assistant_messages` usage.
- Add or migrate tables for threads and messages.
- Update `/api/assistant/chat/turn` to accept and return `threadId`.
- Persist `/assistant` messages across refresh.
- Keep chat history out of the main side nav.

Acceptance:

- Refreshing `/assistant?thread=...` restores the conversation.
- Sending a first message creates a thread.
- Existing chat turns still work with selected model behavior.

### Phase 2: Assistant Secondary Panel

- Add the `/email`-inspired secondary panel to `/assistant`.
- Add `New chat`.
- List active recent threads.
- Show active selected row.
- Add collapse behavior on desktop and drawer behavior on mobile.
- Add archive/delete affordances behind a menu.

Acceptance:

- The main app side nav remains uncluttered.
- The owner can switch chats from `/assistant`.
- The panel does not overlap the composer or message timeline at desktop or mobile widths.

### Phase 3: Project Grouping

- Load Mission Control projects for the assistant thread panel.
- Add nullable `projectId` to thread create/update.
- Add "Move to project" or project picker on thread details/menu.
- Group or filter chats by Mission Control project.
- Add Mission Control entry points that open a project-scoped assistant chat.

Acceptance:

- Project-associated chats appear under that project.
- Ungrouped chats remain visible.
- Mission Control Projects can start a project-scoped chat without duplicating project data.

### Phase 4: Search, Export, And Retention Controls

- Add server-side thread search.
- Add transcript export.
- Add archive view.
- Add delete/tombstone behavior and tests.
- Add retention cleanup policy if hard deletion is needed.

Acceptance:

- Search finds useful old chats without showing archived/deleted items by default.
- Export excludes internal audit logs.
- Deleted transcript text is not used for future context.

### Phase 5: Soulink And Audit Reconciliation

- Decide whether Soulink assistant channels appear in `/assistant` by default.
- Map Soulink channel ids to thread context where appropriate.
- Make action/job audit events reference thread/message ids without depending on transcript storage.
- Add owner-visible links from Mission Control run/activity records back to relevant chats when
  useful.

Acceptance:

- Portable chat and in-app chat do not feel like competing assistant products.
- Mission Control can show useful action provenance without exposing unnecessary transcript text.

## Quality Gates

For documentation-only changes:

- No app build is required.

For implementation phases:

```bash
pnpm --filter @me3/web test
pnpm --filter @me3-core/worker test
pnpm build
```

Browser verification for UI phases:

- `/assistant` desktop, light and dark mode.
- `/assistant` mobile drawer behavior.
- `/assistant?thread=...` refresh persistence.
- `/mission-control` project chat entry point once added.
- Main side nav remains unchanged.

## Open Questions

- Should archived chats be visible under a collapsed `Archived` section or only in search/filter?
- Should thread summaries be generated automatically, or should titles be the only generated field
  at first?
- Should Soulink-origin threads be visible in `/assistant` Recent by default, or behind a `Soulink`
  filter?
- Should Personal be shown as a project group, or should unassigned chats stay visually separate?
- What hard-delete retention window, if any, should follow transcript deletion?

## Recommended Next Beads

- `me3-3ic.1`: Implement refresh-persistent assistant threads.
- `me3-3ic.2`: Add `/assistant` chat history side panel.
- `me3-3ic.3`: Group assistant chats by Mission Control project.
- `me3-3ic.4`: Add assistant transcript search, export, and retention controls.
- `me3-3ic.5`: Reconcile Soulink and launcher assistant thread history.
