# Assistant Job Builder Plan

Last updated: 2026-06-03

Planning source of truth: [`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md).
Detailed capability reference: [`docs/assistant-job-creation-capability.md`](assistant-job-creation-capability.md).
Skill boundary reference: [`docs/assistant-jobs-and-agent-skills.md`](assistant-jobs-and-agent-skills.md).

This document describes the product and implementation plan for making `/assistant` the
chat-guided Assistant Job builder.

## Product Model

Owners should think in jobs.

A job is the thing the owner names, saves, activates, pauses, runs, and reviews. It has a
purpose, trigger, scope, rules, outputs, approval behavior, status, history, and Mission
Control results.

Internally, a job is assembled from:

- Skills: optional instructions or reference material that help the agent do a kind of work.
- Capabilities: safe ME3 or plugin actions the runtime can validate and call.
- Recipes: starter templates for common jobs.
- Tools: concrete host functions behind approved capabilities.
- Policy: setup, approval, event-safety, audit, and retry rules.

For agentic design, "jobs are skills plus tools wired up to repeat automatically" is useful
as a first intuition, but it needs one correction: skills do not grant permission and should
not be treated as tools. A safer phrasing is:

> Jobs are owner-confirmed routines that combine skills for know-how, capabilities/tools for
> action, triggers for repetition, and policy for safety.

This keeps the owner-facing language simple while preserving the internal safety boundary.

## Owner Experience

There are two entry points:

1. The owner clicks **Set up a job** in `/assistant`.
2. The owner types a slash command such as `/job`.

Clicking **Set up a job** should insert a draft prompt in the composer, for example:

```text
/job Every Friday afternoon, review my client projects and tell me what needs carrying forward.
```

The owner can edit the prompt before sending.

The assistant then enters job-builder mode for the current turn or thread. It should help the
owner refine the request into a valid job draft without exposing capability IDs, schema names,
cron syntax, queues, or other backend terms.

## MVP Flow

1. Owner starts with `/job` or **Set up a job**.
2. Assistant maps the request to a known recipe or safe capability bundle.
3. Assistant asks at most one or two clarification questions if needed.
4. Assistant returns a structured draft card in chat.
5. Draft card shows:
   - Job name.
   - One-line purpose.
   - Trigger and schedule.
   - What it reads.
   - What it creates or updates.
   - What requires approval.
   - Setup warnings.
   - Destination.
6. Owner clicks **Save job**.
7. Server saves the draft as `draft`, `needs_setup`, or `active` according to validation and
   the explicit owner action.
8. Chat renders a confirmation card with:
   - One-line saved summary generated from the saved draft.
   - **Activate job** when saved inactive and setup-ready.
   - **Run now** when runnable.
   - **Open job** to inspect settings in the Jobs modal.

Saving and activating are separate owner intents. The MVP may offer **Save and activate** as a
single explicit action, but the assistant must never activate a job simply because the model
produced a valid draft.

## Slash Command Behavior

Initial MVP:

- `/job <request>` starts job-builder mode.
- `/jobs` can remain unclaimed or later open/list jobs.
- A natural-language request such as "set up a weekly inbox summary" may later route into the
  same builder, but `/job` is the first reliable entry point.

The slash command is an affordance, not a separate backend model. It should call the same
draft, validation, save, and run APIs as the button-led flow.

## Structured Response Contract

The chat runtime needs a structured job-builder payload in addition to plain `replyText`.

Suggested response shape:

```ts
type AssistantJobBuilderAction =
  | {
      kind: "job_draft";
      draftId: string;
      draft: AssistantJobDraft;
      explanation: {
        summary: string;
        reads: string[];
        writes: string[];
        approvalRequired: string[];
        setupWarnings: string[];
      };
      validation: AssistantJobDraftValidation;
      availableActions: Array<"save" | "save_and_activate">;
    }
  | {
      kind: "job_saved";
      jobId: string;
      summary: string;
      status: "draft" | "needs_setup" | "active";
      availableActions: Array<"activate" | "run_now" | "open_job">;
    };
```

The UI should render this as an action card. The save buttons must send the structured draft
or server-side draft reference back to the server. They must not scrape or trust prose from the
assistant message.

## Skill Integration

Skills are useful now, but only as prompt and context material.

MVP behavior:

- Add a small registry of available Core skills by ID and metadata.
- Include relevant skill instructions in the job-builder prompt when a recipe or request calls
  for them.
- Let `AssistantJobDraft` keep using `recommendedSkillIds` and `requiredSkillIds`.
- Validate required skills before active save or run.
- Render required/missing skills as setup-style warnings only when owner action is needed.

Non-goals for MVP:

- Running skill scripts.
- Letting skills add permissions.
- Letting arbitrary local skill folders become tools.
- Showing "skills" as a primary end-user noun in the job-builder UI.

The older `me3` profile skill is a good candidate for a later read-only domain skill. It can
teach the agent how to resolve public ME3 profiles and prefer `me.json` over scraping, but any
network lookup, profile write, message send, or memory write still needs an explicit capability
and policy.

## Backend Work

1. Add job-builder fields to the agent chat response type.
2. Add a narrow job-builder turn handler for `/job`.
3. Build draft generation from known recipes first:
   - Weekly Review.
   - Daily Briefing.
   - Inbox Watch.
   - Invoice and Receipt Triage.
4. Use the existing Assistant Jobs validator before returning a draft card.
5. Add explicit save endpoint or reuse `POST /api/assistant/jobs` with a builder-safe payload.
6. Add activate/run follow-up actions using existing Assistant Jobs endpoints.
7. Persist enough draft metadata for retry/idempotency and audit.
8. Ensure model text cannot invent capability IDs that pass validation.

## Frontend Work

1. Add **Set up a job** button in `/assistant`.
2. Insert editable `/job ...` starter text into the composer.
3. Render job draft cards in the message timeline.
4. Wire **Save job**, **Save and activate**, **Activate job**, **Run now**, and **Open job**.
5. Refresh the Jobs modal after save, activation, or archive.
6. Keep manual settings in the Jobs modal.
7. Keep copy owner-facing: jobs, reads, creates, asks before, setup, history.

## Safety Rules

- Never save or activate before explicit owner action.
- Never expose raw capability IDs as choices in the normal UI.
- Never create external sends, publishing, deletes, payments, bookings, credential changes, or
  permission changes during job creation.
- Missing setup may save as `needs_setup` or `draft`, not active.
- Event-triggered jobs must use event-safe capabilities.
- The server must revalidate drafts on save, activate, run, and schedule dispatch.
- Confirmation summaries should be generated from the validated draft and saved job, not from
  model prose.

## MVP Scope

In scope:

- `/job` command.
- **Set up a job** composer prefill.
- Recipe-backed draft generation.
- Draft card rendering.
- Explicit save.
- Optional explicit activate.
- Run-now test path for runnable jobs.
- Jobs modal visibility after save.
- Prompt/context-only skill references.

Out of scope:

- Fully arbitrary custom jobs.
- Plugin-owned capability generation.
- Skill script execution.
- Natural-language editing of every job setting.
- Event trigger UI/filtering beyond existing supported jobs.
- Heartbeat/reconciliation work.
- Rich Weekly Review outcome redesign.
- Inbox Watch approval-first reply design beyond existing rule surface.

## Suggested Implementation Slices

1. **Builder Contract**
   - Extend chat response types with job-builder actions.
   - Add web rendering for a static mocked draft card.
   - Add tests for message rendering and button states.

2. **Recipe Drafting**
   - Implement `/job` detection in the chat runtime.
   - Map plain requests to starter recipes with safe defaults.
   - Validate and return a structured draft card.

3. **Save Path**
   - Wire **Save job** to server-side validation and persistence.
   - Show post-save summary and refresh Jobs modal data.

4. **Activate And Test**
   - Wire **Activate job** and **Run now** where allowed.
   - Handle draft, needs-setup, paused, active, and blocked states.

5. **Skill-Aware Prompting**
   - Add a minimal skill registry.
   - Include relevant skill instructions in builder prompts.
   - Validate required skills before active save/run.

6. **QA Pass**
   - Verify each visible starter can be described, drafted, saved, opened, activated when ready,
     run when ready, and blocked with a clear reason when setup is missing.

## Acceptance Criteria

- The owner can start job setup with `/job` or **Set up a job**.
- The assistant can turn a plain request into a structured job draft.
- The draft card clearly explains what the job will do, when, and what it needs.
- The owner can save the draft only through an explicit action.
- The saved job appears in the Jobs modal.
- Setup-missing jobs do not activate silently.
- Runnable jobs can be run immediately for a test.
- Required permissions, approvals, and setup state come from server validation.

## Open Questions

- Should **Set up a job** prefill a single example or open a small menu of example prompts?
- Should saved jobs default to `draft` unless the owner chooses **Save and activate**, even when
  validation is ready?
- Should `/job` remain visible in the sent message or be visually collapsed into "Set up a job"?
- How much of the draft should be stored before save for idempotency and resume?
- When should natural-language job editing move from follow-up chat into the MVP?
