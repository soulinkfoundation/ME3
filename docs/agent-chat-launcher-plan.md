# ME3 Agent Chat Launcher Plan

Planning source of truth: [`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md).

Last updated: 2026-06-02

Tracking: `me3-8it`.

This document captures the product direction for the in-app ME3 agent chat launcher. It is a
brainstorm-to-plan bridge, not a competing harness roadmap. If this document disagrees with the
harness roadmap, the harness roadmap wins.

## Product Thesis

The in-app agent chat should be ME3's command surface for hands-on work inside the owner's
installation.

It should not try to become a generic ChatGPT-style destination, a full replacement for Mission
Control, or the primary portable assistant inbox. Soulink should remain the primary portable chat
surface for quick notes, mobile messages, push notifications, and asynchronous assistant replies.

The side panel's job is different:

- Execute ME3-native actions while the owner is already in the app.
- Configure, run, and inspect Assistant Jobs.
- Turn the current screen into useful agent context.
- Show drafts, approvals, run status, and results without forcing the owner to change pages.
- Route durable work into Mission Control, Account, Plugins, or Assistant Jobs when those surfaces
  are the better long-term home.

The simplest product sentence:

> Soulink is where the owner can message the assistant from anywhere. The in-app launcher is where
> the owner directs the installed ME3 harness while doing hands-on work.

## Primary Function

The primary use case should be "command and supervise the harness", not "chat for its own sake".

The launcher should answer these owner intents:

1. "Do this now."
   - Check bookings.
   - Draft a follow-up email.
   - Create a reminder.
   - Update a contact.
   - Propose a site/profile/content change.

2. "Set this up as a job."
   - Build an Inbox Watch rule.
   - Create a Daily Briefing variant.
   - Configure a Weekly Review.
   - Add a recurring project or local executor routine.

3. "Use what I am looking at."
   - Ask about the current Mission Control project.
   - Summarize this run.
   - Turn this approval/result/email/contact/site page into the next action.
   - Attach the current context packet without the owner manually explaining it.

4. "Show me what needs my attention."
   - Pending approvals.
   - Failed runs.
   - Jobs blocked by setup.
   - Recent assistant activity.

This keeps the side panel useful even when chat quality is not the star of the product. It becomes
the command layer for the app's own capabilities.

## Relationship To Mission Control

Mission Control should remain the canonical workspace for daily capture, tasks, projects, journal,
approvals, runs, memory, sources, and setup status.

The launcher can create and route Mission Control objects, but it should not replace the Today
capture row or project/task views yet.

Recommended split:

- Mission Control Today: fastest visible place for manual capture, daily tasks, reminders, events,
  and journal writing.
- Mission Control Projects: durable project/task organization and local executor task management.
- Agent launcher: conversational creation, editing, triage, and action execution.
- Soulink: portable capture and assistant messaging when the owner is away from the ME3 UI.

This means the side panel may accept "add a task" or "remind me" messages, but those messages should
write through the same Mission Control APIs as the Today capture row. The launcher should be an
additional input path, not a competing task database.

Do not remove the Mission Control task input until the launcher has proven that it can match these
qualities:

- Faster than manual entry for most owner captures.
- Clear about where the item landed.
- Reliable on mobile and desktop.
- Able to edit, undo, and recover from agent misunderstanding.
- Usable when model setup is missing or degraded.

## Recommended Mental Model

Use modes based on intent, not model names.

Suggested owner-facing modes:

- Ask: answer with ME3 context and no side effects.
- Do: perform a one-time action now.
- Job: create or edit a repeatable Assistant Job.
- Review: inspect approvals, runs, blocked jobs, and recent activity.

These can render as a compact segmented control in the composer. The assistant can also infer the
mode from the message and show the selected mode as a soft confirmation.

Avoid exposing internal nouns such as capability, recipe, ingress, run policy, context packet, or
event trigger as primary UI labels. The harness roadmap already defines the owner-facing language:
jobs, results, drafts, approvals, setup, and history.

## Model Selection

Do not make per-message model selection a primary control in the first polished version.

Reasoning:

- ME3's owner-facing value is that the installed system can act safely across email, calendar,
  website, projects, and jobs. Model menus distract from that.
- The harness roadmap already says provider choice for local executor work belongs in local runner
  config, not project UI.
- Most owners want "use the best configured model for this job", not a list of provider SKUs.
- Safety, setup readiness, and capability routing matter more than raw model choice.

Recommended v1:

- Show a small readiness/status affordance: "ME3 ready", "AI setup needed", or "Using Workers AI".
- Keep provider and default model settings in Account or Setup.
- Let advanced owners inspect or change defaults in settings.
- Add per-turn model override only later, behind an advanced menu, and only if real workflows need it.

If a model control is added, prefer plain options such as `Fast`, `Balanced`, and `Deep` over raw
provider/model names in the main panel.

## Image Generation

Image generation should not be a generic launcher feature in v1.

It can become powerful when tied to concrete ME3 work:

- Generate a site hero image for a profile/content page.
- Create a social or newsletter asset for a publishing plugin.
- Produce a thumbnail or cover image for a project/result.
- Attach generated media as an artifact that the owner can approve before publishing.

Recommended stance:

- Do not add a blank "make images" studio to the side panel.
- Add image generation later as a plugin/capability-owned action with artifacts, previews, and
  approval boundaries.
- Keep generated assets connected to a destination: site draft, content item, social post, project,
  or Mission Control result.

## File Attachments

Attachments are important, but the first version should treat them as context sources and artifacts,
not as a generic file dump.

Recommended phases:

1. Current context attachment.
   - Attach the current page, project, run, job, approval, email thread, calendar event, contact, or
     site draft.
   - Show clear chips such as "Current project", "This run", or "Selected email thread".

2. ME3-owned file artifacts.
   - Upload small files as private context artifacts.
   - Store larger files in R2 when needed.
   - Show source labels in the response: "Used context from..."

3. Provider attachments.
   - Let email/calendar/content plugins contribute file references through the shared capability and
     context contracts.

Attachments should flow into context manifests and run records so the owner can audit what the
assistant used.

## Voice Dictation

Voice dictation is a good input method, not a separate product mode.

Recommended stance:

- Add microphone dictation to the composer after the text/action path is solid.
- Treat dictation as text capture first.
- Require the same confirmations for side effects as typed commands.
- Let Soulink or future Telegram/WhatsApp own the strongest mobile voice-note story.

In-app voice is most useful for quick drafting while the owner is already in ME3. Portable voice is
more naturally a Soulink/mobile channel feature.

## Launcher UI Shape

The side panel should feel like a compact operating console, not a marketing chat page.

Recommended structure:

- Header:
  - Close button.
  - Assistant status.
  - Current context indicator.
  - Optional history/settings menu.

- Empty state:
  - A concise prompt such as "Ask ME3 to do something in this installation."
  - Small suggested actions based on setup state and current page.
  - Recent jobs or pending approvals when useful.

- Conversation timeline:
  - Plain assistant/user messages.
  - Structured action cards.
  - Draft cards for jobs, emails, site changes, reminders, and tasks.
  - Approval cards with recipient, destination, preview, and risk summary.
  - Run cards with status, result, failure reason, and "Open in Mission Control".

- Composer:
  - Intent mode: Ask, Do, Job, Review.
  - Text input.
  - Context/attachment button.
  - Dictation button when available.
  - Send button.

- Result routing:
  - Save Job.
  - Create Task.
  - Add Reminder.
  - Open Approval.
  - Open Run.
  - Open in Mission Control.

Suggested placeholder:

```text
Ask, run, or set up a job...
```

Suggested empty helper:

```text
Ask ME3 to check bookings, draft follow-ups, manage reminders, update contacts, or set up jobs.
```

## Key Product Decisions

1. Keep the launcher secondary in the main UI.
   - This matches ME3's hands-on nature.
   - The owner is already in a workspace, so the agent should assist the workspace rather than
     replace it.

2. Make it action-first.
   - The panel should earn its keep through actions, drafts, approvals, and jobs.
   - Pure Q&A is useful, but not the center of gravity.

3. Keep Mission Control canonical.
   - Tasks, projects, journal, approvals, runs, memory, and setup need durable surfaces.
   - The launcher creates and navigates these objects.

4. Treat Soulink as the portable assistant channel.
   - Soulink should handle on-the-go capture, notifications, and asynchronous assistant messaging.
   - The in-app launcher should handle high-context work inside the install.

5. Prefer capability-aware UI over model-aware UI.
   - The most important owner question is "what can ME3 safely do right now?"
   - Model/provider detail can live in setup and advanced settings.

## Alignment With Harness Roadmap

This plan maps directly onto the current phases in
[`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md):

- Phase 1, shared harness:
  - Route launcher actions through the same capability, approval, setup, and audit policy as jobs.
  - Avoid a separate chat-only action path.

- Phase 2, starter job QA:
  - Use the launcher to expose only job starters that have real outcomes.
  - Do not let conversational job creation outrun starter QA.

- Phase 3, Core chat actions:
  - Polish immediate actions for reminders, bookings, email drafts, contacts, and site/profile
    proposals.
  - Render each action as an auditable draft/result card.

- Phase 4, operational jobs:
  - Let the launcher run jobs manually, show active/failed runs, and link to Mission Control.
  - Surface setup-missing and retry states plainly.

- Phase 5, context and memory:
  - Attach current page/project/job/run context to chat turns.
  - Show concise source labels.
  - Keep durable memory owner-visible and approval-aware.

- Phase 6, plugin-owned capabilities:
  - Let plugins contribute actions, context attachments, and job starters.
  - Keep plugin side effects behind the shared approval and audit layer.

## Implementation Plan

### Phase A: Product Shell And State

- Rename/copy the side panel around command use, not generic chat.
- Add the compact header, status state, empty state, timeline, and composer.
- Add intent modes: Ask, Do, Job, Review.
- Show setup state clearly when no live model/provider is available.
- Keep all labels owner-facing.

### Phase B: Immediate ME3 Actions

- Route reminders, booking lookup, email drafts, contact updates, and site/profile proposals through
  the shared chat action path.
- Render action cards with preview, status, destination, and undo/edit paths where possible.
- Require approval for external sends, public publishing, deletes, and other sensitive side effects.
- Persist activity into Mission Control.

### Phase C: Job Builder In The Launcher

- Let the owner say "set this up as a job".
- Use the custom job creation capability reference.
- Render a structured job draft card with trigger, scope, actions, approvals, and destination.
- Save only after explicit confirmation.
- Link saved jobs to `/assistant` and Mission Control activity.

### Phase D: Context And Attachments

- Add current-page context attachment.
- Add explicit context chips.
- Add ME3-owned file artifact upload only after current context is reliable.
- Persist context manifests into run records.

### Phase E: Review And Supervision

- Add "Review" mode for approvals, failed runs, blocked jobs, and recent activity.
- Let owners resolve approvals from the panel when the approval payload is clear enough.
- Link deep details to Mission Control.

### Phase F: Rich Inputs And Media

- Add dictation as a composer input method.
- Add image generation only through destination-aware capabilities.
- Add advanced model controls only if real usage shows owners need them in the panel.

## Acceptance Criteria

The launcher is doing its job when:

- A new owner understands what they can ask it to do without seeing internal harness terms.
- A power owner can run or create useful jobs without leaving their current page.
- Every side effect has a visible destination, status, and audit trail.
- Mission Control remains the durable workspace rather than being duplicated inside chat.
- Soulink remains the obvious portable assistant channel.
- Missing setup produces useful next steps instead of dead chat responses.
- The UI works calmly on desktop and mobile without turning into a full-screen chat app unless the
  viewport requires it.

## Open Questions

- Should the panel be named "Assistant", "Command", "ME3", or something more specific like
  "Harness" only in developer-facing docs?
- Should mobile use a bottom sheet, full-screen drawer, or dedicated route?
- Should the launcher show recent Assistant Jobs by default or only in Job/Review mode?
- How much inline approval resolution belongs in the panel before pushing the owner to Mission
  Control?
- Should the composer infer mode silently, or should the selected mode always be visible before send?
- What is the minimum useful attachment set: current page only, current page plus uploads, or current
  page plus provider objects?
