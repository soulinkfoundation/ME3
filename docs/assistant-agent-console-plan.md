# ME3 Assistant Agent Console Plan

Planning source of truth: [`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md).

Last updated: 2026-06-03

Tracking: `me3-8it`.

Related follow-up: `me3-kid` tracks the robust composer-only voice dictation adapter.

Related decision plan: [`docs/assistant-chat-history-model-plan.md`](assistant-chat-history-model-plan.md)
tracks assistant thread history, refresh persistence, conversation organization, and Mission Control
project grouping.

Related implementation beads:

- `me3-8it.2`: assistant chat streaming and stop controls.
- `me3-8it.3`: assistant composer attachments.
- `me3-8it.4`: model/attachment compatibility explanations.
- `me3-8it.5`: assistant model selection persistence.
- `me3-8it.6`: structured chat/action audit events.
- `me3-8it.7`: focused assistant console QA coverage.

## Progress Update

As of 2026-06-03:

- Milestone 1 shell is implemented:
  - `/assistant` is a full-screen assistant console.
  - The global launcher is disabled app-wide behind `AGENT_LAUNCHER_UI_ENABLED`.
  - The Jobs modal remains available from the composer and keeps the existing starter/tuning flows.
  - The bottom composer, model selector, starter prompts, and message timeline are in place.
- Milestone 2 is partially implemented:
  - `/api/assistant/chat/turn` is now the product-facing chat route.
  - `/api/assistant/chat/turn/stream` streams assistant replies as server-sent events.
  - `/api/agent/sandbox` remains as a legacy alias.
  - `/assistant` and wizard helper calls use the product chat route family.
  - The assistant page sends the selected model with each turn.
  - The Worker validates selected model payloads and forwards them to the runtime.
  - The runtime respects selected provider/model when provided.
  - Copy, retry, and edit/resend basics are implemented in the assistant UI.
  - Streaming and stop controls are implemented and tracked as closed by `me3-8it.2`.
  - Stop uses request abort and leaves a clear stopped/partial-message state.
  - Refresh-resilient conversation history and conversation organization are owned by `me3-3ic`.
- Milestone 3 is partially implemented:
  - The model picker exists in the assistant composer and is wired to chat turns.
  - The picker reads provider setup state from `/ai-settings`.
  - The picker shows ready/setup/unknown status in the composer.
  - `AI_AGENT_MODEL_OPTIONS` now carries local capability metadata for text, vision, long context,
    reasoning, and tool use.
  - Assistant model selection persists locally and is tracked as closed by `me3-8it.5`.
  - Basic incompatible-send handling is in place for unsupported/error attachments and image/model
    compatibility; the remaining backend vision-routing work stays under `me3-8it.4`.
- Attachments are partially implemented and still tracked by dedicated beads:
  - Composer paperclip/file picker, removable chips, client-side text-like file reading, and
    request metadata are in place under `me3-8it.3`.
  - Remaining `me3-8it.3` work is persisted upload records, PDF extraction, image routing, and
    fuller size/type validation.
  - `me3-8it.4` continues model/attachment compatibility explanations, especially once image
    routing is available.
- Audit metadata is partially implemented:
  - Chat turns record route/thread/model/attachment-count metadata.
  - Streaming turns record stream route metadata.
  - Chat turns now record redacted attachment manifests without raw file content.
  - Streaming turns now record completed, failed, and stopped outcomes in sandbox audit metadata.
  - `me3-8it.6` remains open for richer ME3-native action-card audit records.
- Voice mode is implemented:
  - `me3-kid` delivered composer-only voice dictation with the provider/plugin adapter shape.
- Chat history and UI organization have a decision/implementation plan:
  - `me3-3ic` is closed with follow-up beads for project grouping, search/export/retention, and
    Soulink history reconciliation.
  - [`docs/assistant-chat-history-model-plan.md`](assistant-chat-history-model-plan.md) remains the
    detailed reference.
- The old floating `AgentChatLauncher.vue` is no longer an active milestone; it remains disabled in
  `App.vue` as legacy fallback code.

Current QA coverage:

- `pnpm build`
- Focused Worker tests for `/assistant/chat/turn`, `/agent/sandbox` alias behavior, selected model
  validation, selected Workers AI model routing, audit metadata, and streaming SSE behavior.
- In-app browser visual checks for the assistant shell/composer have been used, though the latest
  streaming smoke pass was blocked by an existing Playwright profile lock.

## What's Left

The essential remaining work is now mostly outside the base chat loop. Retiring the floating
launcher removes the old quick-panel milestone and narrows QA to `/assistant`, Soulink, and the
shared harness routes.

1. Finish attachments (`me3-8it.3` and `me3-8it.4`).
   - Add typed/persisted upload records instead of composer-only text injection.
   - Add PDF extraction if the dependency path is reliable.
   - Route images only through vision-capable models.
   - Keep pre-send explanations for unsupported type/model combinations.

2. Finish audit and observability (`me3-8it.6`).
   - Continue tightening stream outcome visibility as the UI/history model evolves.
   - Keep attachment manifests redacted as persisted upload records land.
   - Extend audit records for richer ME3-native action cards.

3. Add focused QA coverage (`me3-8it.7`).
   - Keep Worker coverage for JSON and streaming turns.
   - Add web-level coverage around composer attachments, model compatibility, stop, retry, and
     edit/resend.
   - Re-run browser visual QA once the Playwright profile lock is clear.

4. Continue parallel tracks.
   - Voice dictation is implemented; keep future work to provider polish and QA rather than
     rebuilding the adapter.
   - Base chat history is implemented; remaining history work is project grouping,
     search/export/retention, and Soulink relationship cleanup.
   - Chat-based job builder and ME3-native action cards remain future milestones after the console
     foundation is stable.

No active launcher work remains. Do not spend time simplifying the floating panel, passing
current-page context into it, or duplicating assistant controls there unless a new product decision
reopens that surface.

This document replaces the earlier agent chat launcher plan. The new product direction is that
`/assistant` becomes ME3's full in-app chat, agent, and model interface. Soulink is the portable
assistant channel. The floating `AgentChatLauncher.vue` is disabled for now and should not drive new
planning unless a concrete quick-entry need reappears.

If this document disagrees with the agent harness roadmap, the harness roadmap wins.

## New Product Thesis

`/assistant` should be the serious ME3 agent console.

It should feel closer to the best Claude, Codex, and modern agent chat experiences than to a
settings page. It should be simple on the surface, but capable enough to use the strongest
configured models, read files and images, accept voice dictation, execute ME3-native actions, and
eventually build and edit Assistant Jobs through conversation.

The important split:

- `/assistant`: the full chat, agent, LLM, and future jobs-builder interface.
- Jobs modal: the manual management and tuning surface for active or draft jobs.
- Mission Control: the durable workspace for tasks, projects, results, approvals, memory, runs,
  activity, and journal.
- Soulink: the portable assistant chat for quick capture, notifications, and messaging away from
  the ME3 UI.

This means the assistant is no longer "a little chat panel beside the real app". The assistant page
becomes the place where the owner talks to the ME3 harness directly.

## High-Level Questions

These are the main product choices to answer before or during implementation:

1. Should `/assistant` and Soulink share one assistant conversation history, or should `/assistant`
   have its own richer console history?
2. Should the model picker show raw model names, simple labels like Fast/Balanced/Deep, or both?
3. Should uploaded files be temporary chat attachments, saved private ME3 context, or both?
4. Should voice dictation run fully on the user's device when possible, or is server-side audio
   transcription acceptable?
5. Should the Jobs button keep opening the current modal, or should jobs eventually become a
   right-side inspector beside the chat?
6. Should the first screen be blank and minimal like Codex, or should it show a few useful ME3
   suggestions?
7. Should job creation through chat be available as soon as the UI exists, or wait until starter
   job QA and capability unification are complete?

## Current Baseline

The current `/assistant` route is now the active in-app assistant console:

- It keeps `hideAgentLauncher: true`, and the launcher is also disabled app-wide in `App.vue`.
- It loads jobs and starter recipes.
- It has Jobs controls in the assistant flow and opens the existing Jobs modal.
- It keeps starter jobs, active jobs, toggles, detail editing, Daily Briefing controls, and Inbox
  Watch rules available through the modal.
- It has a centered message timeline, bottom composer, model picker, starter prompts, attachment
  chips, streaming/stop controls, retry/copy/edit/resend basics, and staged voice UI.

The floating `AgentChatLauncher.vue` currently:

- Is imported by `App.vue` but disabled by `AGENT_LAUNCHER_UI_ENABLED = false`.
- Should be treated as legacy fallback code, not an active user surface.
- Should not receive new model picker, attachment, voice, jobs-builder, or harness features unless
  the product direction changes again.

Existing supporting pieces:

- `apps/web/src/utils/aiModelCatalog.ts` already has model metadata across Workers AI, OpenAI, and
  Anthropic.
- Account settings already expose AI provider/model configuration.
- `packages/agent-chat` already routes sandbox turns through provider-backed or fallback replies.
- Assistant Jobs already have schema, API, starter recipes, run records, setup validation, and
  Mission Control activity writes.

The remaining phase-one job is to finish the console capabilities without reintroducing a competing
in-app assistant surface.

## Primary Use Cases

The new `/assistant` page should support five owner intents:

1. Chat with the chosen model.
   - Ask questions.
   - Draft text.
   - Analyze attached files and images.
   - Use ME3 context when available.

2. Execute ME3-native actions.
   - Add reminders.
   - Create calendar events.
   - Check bookings.
   - Draft emails.
   - Update contacts.
   - Propose website/profile/content changes.

3. Build jobs through conversation.
   - "Watch for invoices and make a review task."
   - "Every Friday, review my client projects."
   - "When this person emails me, draft a reply for approval."

4. Tune jobs manually when needed.
   - Open the Jobs modal.
   - Toggle jobs.
   - Edit schedules.
   - Adjust Inbox Watch rules.
   - Inspect recent runs and setup blockers.

5. Supervise the harness.
   - Review approvals.
   - See failed runs.
   - Understand what setup is missing.
   - Open durable results in Mission Control.

## Page Shape

`/assistant` should become a quiet, focused console.

Recommended layout:

- A compact top or composer-adjacent control row:
  - Model selector.
  - Jobs button.
  - Optional setup/status indicator.
  - Optional history/settings menu later.

- A centered conversation area:
  - Max width similar to Claude/Codex rather than a full dashboard grid.
  - Empty state that is minimal, not a landing page.
  - Assistant and owner messages.
  - Tool/result cards for ME3 actions.
  - Job draft cards.
  - Approval cards.
  - Attachment chips.

- A bottom composer:
  - Multi-line text input.
  - Add attachment button.
  - Voice dictation button.
  - Send button.
  - Optional slash commands later.
  - Model selector and Jobs control close enough to feel part of the chat workflow.

Suggested placeholder:

```text
Message ME3...
```

Suggested starter prompts:

```text
Set up a job
Draft an email
Add a reminder
Review my week
Update my site
```

These should be small actions, not a big hero.

## Retired Launcher Role

`AgentChatLauncher.vue` is not part of the active assistant-console plan.

Current stance:

- Disabled app-wide by `AGENT_LAUNCHER_UI_ENABLED = false` in `apps/web/src/App.vue`.
- Kept only as legacy fallback code while `/assistant` becomes the full in-app agent console.
- Not a destination for new model picker, attachment, voice, jobs-builder, or action-card work.
- If quick-entry is needed later, define it as a new product decision with clear page-context,
  routing, audit, and handoff requirements.

The active split is simpler: `/assistant` is the in-app console; Soulink is the portable assistant
channel.

## Model Selection

Model selection is now a phase-one feature.

The simplest implementation path is to reuse and extend `AI_AGENT_MODEL_OPTIONS`:

- Show available configured models grouped by provider.
- Start with Cloudflare Workers AI as the easiest first-install path.
- Keep OpenAI and Anthropic available when credentials are configured.
- Persist an owner default in Account settings.
- Let `/assistant` choose a per-conversation or per-turn model.
- Show enough model metadata to make a decision: provider, cost label, capability label, and setup
  status.

Do not overcomplicate the first picker. It can look like:

```text
Qwen3 30B
Workers AI
```

or:

```text
Workers AI: Qwen3 30B
```

The picker should be capability-aware:

- Text-only models can handle normal chat.
- Vision-capable models can receive images.
- Long-context models are preferred for larger files.
- Reasoning models are preferred for planning and job design.
- If the selected model cannot handle an attachment type, the UI should explain that before send.

Implementation note: verify the current Workers AI model catalog before wiring hardcoded capability
labels. The local catalog can be the starting source, but the plan should not depend on stale model
claims.

## Attachments

Attachments are also a phase-one feature, but should land in practical layers.

### Phase-One Attachment Scope

Support:

- Images for models that can read images.
- Text-like files such as `.txt`, `.md`, `.json`, `.csv`, `.tsv`, and source code.
- PDFs if a reliable extraction path exists.
- Small files first, with clear size limits.

The owner experience:

- Click the add button.
- Select or drag files.
- See attachment chips in the composer.
- Remove attachments before send.
- The assistant response names what it used.

The runtime behavior:

- Store uploads as chat-turn attachments or short-lived artifacts.
- Extract text when possible.
- Pass images only to models/routes that support vision.
- Add attachment references to the context manifest.
- Write durable artifacts to R2 only when the result needs to survive beyond the chat turn.

### Later Attachment Scope

Later, attachments can become a broader ME3 context system:

- Attach current Mission Control project.
- Attach a run.
- Attach a job.
- Attach an email thread.
- Attach a calendar event.
- Attach a website page draft.
- Save files as reusable private context sources.

## Voice Mode

Voice should start as dictation into the composer.

Recommended first implementation:

- Add a microphone button beside the composer.
- Record audio locally in the browser.
- Transcribe to text.
- Insert the transcript into the composer before the owner sends.
- Keep the normal confirmation and approval rules for actions.

Open-source transcription direction:

- Prefer a Whisper-family open-source path for the real implementation spike.
- Evaluate client-side/WASM options for privacy and standalone installs.
- Evaluate local executor transcription for owners who have local compute.
- Treat browser-native speech APIs as a possible fallback, not the main open-source answer.

Do not start with a live voice agent. Dictation is enough for phase one.

## Jobs Button And Jobs Modal

Keep the current Jobs button, but reposition it beside the model selector or inside the composer
toolbar.

The Jobs modal remains valuable because:

- It shows everything the assistant has already created.
- It gives owners manual control when chat gets too indirect.
- It supports existing starter job toggles and settings.
- It lets job-specific UIs such as Inbox Watch rules exist without forcing everything through chat.

Over time, the Jobs modal should become the manual inspector for jobs created or edited by the
assistant.

Recommended job surface split:

- Chat: create, explain, update, and run jobs through conversation.
- Job draft card: show the proposed job before save.
- Jobs modal: manually inspect, tune, pause, resume, run, or archive jobs.
- Mission Control: review results, activity, approvals, and run history.

## Mission Control Relationship

Mission Control remains canonical.

The assistant chat can create tasks, reminders, results, approvals, memories, and job runs, but
Mission Control should remain where those objects live over time.

Recommended routing:

- Chat-created tasks land in Mission Control tasks.
- Chat-created reminders/events sync through Calendar when available and stay visible through
  Mission Control.
- Job runs write activity and results into Mission Control.
- Approvals are shown in chat when relevant but remain durable in Mission Control.
- Memory writes require owner-visible review/approval and stay inspectable in Mission Control.

Do not remove Mission Control's direct capture inputs yet. The chat can become another creation
path, but manual capture remains important for speed and trust.

## Soulink Relationship

Soulink remains the portable assistant channel.

Recommended split:

- Soulink: on-the-go capture, assistant messages, notifications, owner replies, and quick asks.
- `/assistant`: richer model selection, attachments, jobs builder, action cards, approvals, and
  longer supervision work.

Open design choice: decide whether Soulink and `/assistant` share one conversation stream or use
separate histories connected by the same harness/audit layer.

## Safety And Approval Model

The richer chat UI must not bypass the harness safety model.

Rules:

- Reading private ME3 context is allowed only through context resolvers.
- External sends require approval.
- Public website/content publishing requires approval or explicit save boundaries.
- Deletes, payments, account changes, provider credential changes, and durable memory writes require
  clear owner confirmation.
- Jobs created through chat are saved only after explicit owner confirmation.
- The UI should show what will be read, written, sent, or saved in plain language.

This maps directly to the roadmap's shared capability, approval, setup, and audit policy work.

## Implementation Roadmap

### Milestone 1: Full Assistant Page Shell

Goal: make `/assistant` visually and structurally become the primary chat console.

Tasks:

- [x] Keep `hideAgentLauncher: true` on `/assistant`.
- [x] Disable the floating launcher app-wide while `/assistant` is the active in-app surface.
- [x] Change page metadata from "Assistant Jobs" to "Assistant".
- [x] Preserve the existing Jobs modal and data-loading logic.
- [x] Add a centered chat timeline to `/assistant`.
- [x] Add a bottom composer similar in feel to Codex/Claude.
- [x] Put the Jobs button beside the model selector or composer controls.
- [x] Add empty state prompts without making a landing page.
- [x] Keep the UI calm, dense, and token-driven.

Acceptance:

- `/assistant` opens to a polished chat interface.
- The Jobs modal still works.
- The floating launcher does not compete with the assistant page.
- No job management behavior regresses.

### Milestone 2: Conversation Runtime And Streaming

Goal: make the chat feel like a serious model interface.

Tasks:

- [x] Decide whether to extend `/agent/sandbox` or create a new `/assistant/chat/turn` endpoint.
- [~] Add a typed turn request with message text, selected model, attachments, and context
  references.
- [x] Add streaming responses. Tracked by closed bead `me3-8it.2`.
- [x] Add stop, retry, copy, and edit/resend basics.
- [ ] Persist conversation turns enough for refresh resilience. Tracked by `me3-3ic`.
- [ ] Continue writing structured chat/action audit events. Tracked by `me3-8it.6`.

Notes:

- `/assistant/chat/turn` is the product endpoint.
- `/assistant/chat/turn/stream` is the streaming product endpoint used by the assistant page.
- `/agent/sandbox` is a legacy alias.
- Message text and selected model are wired.
- Text-like attachments are currently injected as readable turn context; persisted typed attachment
  records and richer context references are still pending.
- Copy, retry, edit/resend, streaming, and stop are wired.
- Chat history, refresh resilience, and conversation organization are owned by `me3-3ic`.

Acceptance:

- The user can send a message and receive a model-backed reply.
- Selected model information is respected.
- Errors and missing setup states are visible and useful.

### Milestone 3: Model Picker

Goal: let owners choose a model without leaving the assistant page.

Tasks:

- [x] Use `AI_AGENT_MODEL_OPTIONS` as the first catalog source.
- [x] Show configured/unconfigured provider state.
- [x] Respect Account defaults.
- [x] Persist the current assistant page selection. Tracked by closed bead `me3-8it.5`.
- [x] Add model capability metadata for text, vision, long context, reasoning, and tool use.
- [~] Block or explain incompatible sends, such as image attachment to a text-only model. Tracked by
  open bead `me3-8it.4`.

Notes:

- The picker is visible in the assistant composer.
- `/assistant` sends the selected model per turn.
- The picker loads setup state from `/ai-settings` and shows ready/setup/unknown status.
- Local capability metadata exists in `AI_AGENT_MODEL_OPTIONS`.
- `/assistant` restores a valid saved model id from localStorage and lets Account defaults seed
  first use when no assistant-local selection exists.
- Other chat surfaces omit model selection and continue to use Account/default routing.
- Verify provider capability labels against current provider docs before using them for hard
  enforcement in attachment flows.

Acceptance:

- The owner can pick a Workers AI model in the assistant UI.
- OpenAI/Anthropic options appear when configured.
- The selected model is sent with the chat turn.

### Milestone 4: Attachments

Goal: let the model read useful files and images.

Tasks:

- [~] Add composer attachment UI. Tracked by `me3-8it.3`.
- [ ] Add upload endpoint and typed attachment records. Tracked by `me3-8it.3`.
- [~] Implement text extraction for common text-like files. Tracked by `me3-8it.3`.
- [ ] Add PDF extraction if the dependency path is reliable. Tracked by `me3-8it.3`.
- [ ] Add image handling for vision-capable model routes. Tracked by `me3-8it.3`.
- [~] Add size/type validation. Tracked by `me3-8it.3`.
- [ ] Add attachment references to context manifests and run records. Tracked by `me3-8it.3` and
  `me3-8it.6`.

Acceptance:

- The owner can attach text-like files today and see removable chips.
- The model receives extracted/readable text-like content today.
- Unsupported/error attachments fail clearly before send today.
- Full acceptance still requires persisted typed records and vision-capable image routing.

### Milestone 5: Voice Dictation

Goal: make voice useful without turning it into a live voice agent.

Tasks:

- [ ] Add recorder UI to the composer.
- [ ] Run a transcription spike around Whisper-family open-source options.
- [ ] Choose browser/WASM, local executor, or server-backed transcription based on privacy, speed, and
  standalone feasibility.
- [ ] Insert transcript text into the composer.
- [ ] Keep manual send as the confirmation step.

Notes:

- Tracked separately as `me3-kid`.
- The chosen implementation should be composer-only and robust rather than a temporary browser-only
  proof of concept.

Acceptance:

- The owner can dictate a prompt.
- The transcript is editable before send.
- No action executes merely because audio was captured.

### Milestone 6: Chat-Based Job Builder

Goal: turn the assistant chat into the primary custom jobs builder.

Tasks:

- Use `docs/assistant-job-creation-capability.md` as the detailed capability reference.
- Let the owner describe a job in natural language.
- Draft a structured job with trigger, scope, actions, destination, and approval behavior.
- Render the draft as a job card in chat.
- Validate setup and policy before save.
- Save only after explicit confirmation.
- Show saved jobs in the Jobs modal.
- Let the owner update job settings through chat where safe.

Acceptance:

- The assistant can draft a job from plain language.
- The owner can review and save it.
- The saved job appears in the Jobs modal.
- Manual job settings remain editable.

### Milestone 7: ME3-Native Action Cards

Goal: let the chat handle the useful ME3 actions the harness already knows or is expected to know.

Tasks:

- Add/remap reminder create/update/list actions.
- Add calendar event creation or handoff.
- Add booking lookup and booking handoff.
- Add mailbox draft actions.
- Add contact create/update actions.
- Add site/profile/content proposal cards.
- Route all actions through shared capability, approval, setup, and audit policy.

Acceptance:

- Chat actions create durable ME3 outputs.
- Sensitive changes require approval.
- Outputs link to Mission Control, Email, Calendar, Contacts, or the site editor as appropriate.

### Milestone 8: Retired Global Launcher

Status: retired for now.

Goal: keep the disabled launcher from shaping the assistant roadmap.

Tasks:

- Keep `AGENT_LAUNCHER_UI_ENABLED = false` unless a clear quick-entry use case reappears.
- Do not add new harness features to `AgentChatLauncher.vue`.
- If the code becomes maintenance drag, remove it in a dedicated cleanup after confirming no page
  still depends on `useAgentChat` launcher state.
- Route in-app assistant work through `/assistant`; route portable chat and notifications through
  Soulink.

Acceptance:

- `/assistant` remains the only full-featured in-app agent console.
- Soulink remains the portable assistant channel.
- The disabled launcher does not create duplicate UX, QA, or planning obligations.

## Alignment With Agent Harness Roadmap

This plan changes the UI emphasis, not the harness safety model.

- Phase 1, shared harness:
  - The console must use the same capability, setup, approval, and audit policy as jobs.

- Phase 2, starter job QA:
  - Existing starter jobs still need QA before custom job creation becomes prominent.

- Phase 3, Core chat actions:
  - The new console becomes the visible home for reminders, bookings, drafts, contacts, and site
    proposals.

- Phase 4, operational jobs:
  - The console can run jobs and show status, but Mission Control remains the result/history
    surface.

- Phase 5, context and memory:
  - Attachments, current-page context, and memory review should flow through context manifests.

- Phase 6, plugin-owned capabilities:
  - Plugins can contribute models, tools, attachments, job starters, and action cards later.

## Non-Goals For Phase One

- Full live voice conversation.
- Generic image generation studio.
- Replacing Mission Control capture.
- Replacing Soulink portable chat.
- Letting chat bypass approval rules.
- Building a model marketplace.
- Rewriting all existing job settings UI before the chat builder exists.

## Success Criteria

The new assistant page is working when:

- It feels like the primary ME3 agent interface within the app.
- A user can choose a model, type a prompt, attach files/images, dictate text, and send.
- The Jobs button is still obvious and useful.
- Existing jobs can still be managed manually.
- The chat can become the natural place to create jobs in phase two.
- ME3-native actions show clear draft/result/approval cards.
- Mission Control remains the durable place for tasks, results, approvals, memory, runs, and
  activity.
- The disabled global launcher does not compete with `/assistant` or add duplicate QA scope.
