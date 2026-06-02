# ME3 Local Executor Assistant Job

Last updated: 2026-06-01

Planning source of truth: [`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md).
This document is the detailed reference for the Local Executor plugin. Use the progress
section below to distinguish the current MVP from follow-up daemon/job work.

The goal is an optional first-party plugin that lets an owner ask ME3 to run bounded work
on an always-on local computer. ME3 remains the owner-facing orchestrator and approval
surface. The local daemon owns actual local process execution.

The first useful proof should be a coding-project starter job, but the plugin should stay
generic enough to support other local executor use cases later.

## Product Shape

Plugin id: `me3.local-executor`

Owner-facing name: `Local Executor`

Default install state: available but off. The owner activates it from Account and Plugins.

Primary surfaces:

- `/assistant`: shows a Local Executor job starter when the plugin is active.
- `/account`: the Local Executor plugin row shows the setup/configure flow.
- `/mission-control`: shows approvals, run history, audit, and results.
- Soulink assistant chat: can create owner-directed manual runs and receive concise
  result notifications, but does not become the durable run record.

Core product language should use plain words:

- Use `local computer`, `local runner`, `project`, `run`, `approval`, `result`, and `history`.
- Avoid exposing capability ids, queues, daemon tokens, shell policies, or provider adapter
  internals in normal owner UI.

## Ownership

Core owns:

- Plugin registry, activation, permission grants, and setup requirement display.
- Assistant Jobs schema, job validation, run spine, shared approval policy, and channel
  dispatch from chat/Soulink.
- The capability registry entry for plugin-provided capabilities once the shared registry
  is unified.

Local Executor plugin owns:

- Daemon pairing and token exchange.
- Provider presets and local execution policy.
- Executor run queue, daemon claim/heartbeat contracts, executor-specific audit, and
  local-executor setup readiness.
- The `local_executor.run` capability and Local Executor starter recipes.

Mission Control owns:

- The canonical owner-facing view for results, approvals, run history, and audit.
- Linked `mission_agent_runs`, `mission_agent_run_events`, `mission_approvals`, and
  `mission_plugin_activity` records created by Local Executor runs.
- Display of executor results and activity supplied by the Local Executor plugin.

Local daemon owns:

- Local config and token storage.
- Repo/path validation.
- CLI process execution, local logs, artifact capture, command allow/deny enforcement,
  timeout enforcement, and changed-file detection.
- Polling Core for approved runs. Core never needs inbound access to the user's machine.

MVP note: the local runner is currently the `packages/local-executor/bin/me3-local-executor.mjs`
script inside a ME3 Core checkout. Pairing stores the daemon token and API URL in
`~/.me3/local-executor/token.json`. The `once` command claims one approved run and exits;
the `run` command keeps polling until the owner stops it.

## MVP Progress

Landed in the current Core line:

- Local Executor plugin activation and Account row Configure modal.
- Pairing code creation, daemon token exchange, heartbeat, one-shot claim, polling run mode,
  and completion.
- Local project creation from Mission Control Projects. Local projects store a folder path
  and create a conservative Local Executor project policy behind the scenes.
- Project task `Run locally` action for tasks inside local projects.
- Linked Local Executor runs write Mission Control run/activity records.
- Local runner config lives on the user's computer at
  `~/.me3/local-executor/config.json`; provider choice is not project-specific UI.

Still follow-up:

- Richer result panels, changed-file detection, quality-gate execution, and artifacts.
- Assistant starter recipe and scheduled/event-triggered job approvals.
- Friendlier local runner packaging outside a source checkout.

## Capability Contract

V1 should expose one public capability:

| ID | Purpose | Side effect | Approval | Event safe | Manual safe |
| --- | --- | --- | --- | --- | --- |
| `local_executor.run` | Queue one bounded run on a paired local runner. | `local_shell` | `approval_required` except owner-directed manual runs | No | Yes |

Capability metadata:

- Owner: `plugin`
- Plugin id: `me3.local-executor`
- Category: `local`
- Requires setup: `local_executor`
- Audit event kind: `local_executor_run_requested`
- User-facing read summary: reads the configured project policy and the owner-provided task.
- User-facing write summary: runs a configured local executor command and records results.

Manual direction rule:

- A direct owner request in chat or a Run button click can approve one bounded run when the
  run matches an active local executor policy.
- Scheduled or event-triggered executor jobs must create a Mission Control approval before
  the daemon can claim the run.
- Any policy widening still requires an explicit owner action; the model cannot silently
  create standing execution permission.

Do not expose generic raw `daemon.file.write` or `daemon.shell.run` capabilities in v1.
Keep raw local read/write/shell primitives internal or later. The first public surface is
the safer executor job envelope.

## Starter Job

Starter recipe: `local-coding-task`

User-facing name: `Run a coding task`

Outcome: run a bounded local coding agent on an approved project and produce a Mission
Control result with status, summary, changed files, quality gates, and artifacts.

Default draft:

- Trigger: manual.
- Scope: one configured project/repo policy.
- Actions:
  - `mission.project.read`
  - `local_executor.run`
  - `mission.activity.create`
  - optional `message.owner.notify`
- Destination: Mission Control result/activity, linked to a project when known.
- Default landing policy: report-only. The executor may change local files if the policy
  allows it, but it should not commit or push unless the repo policy explicitly enables that.

The starter should appear in `/assistant` only when the plugin is active. If no local runner
is paired or no project policy exists, the job can be saved as `needs_setup` and should point
the owner to the Local Executor plugin row in Account.

## Data Model

This is a design sketch, not a migration file.

Local Executor should have plugin-owned tables for:

- `local_executor_pairings`: runner id, display name, token hash, status, version, platform,
  last seen, health summary, paired/revoked timestamps.
- `local_executor_project_policies`: owner-visible project/repo label, path hint, policy
  status, provider preset, default branch, landing policy, command policy, timeout/output caps.
- `local_executor_runs`: job/run linkage, project policy id, prompt summary, status, provider,
  runner id, approval id, started/finished timestamps, result summary, artifact manifest,
  changed file summary, error code/message.
- `local_executor_run_events`: structured run timeline from Core and daemon.
- `local_executor_audit_events`: pairing, policy changes, run claims, denials, command
  execution, completion, failures, and health changes.

Mission Control should receive linked display records, but the executor plugin should keep
the executor-specific source of truth. Existing `mission_daemon_*` tables and docs should be
treated as the older local bridge scaffold. Future implementation should either migrate that
scaffold into Local Executor or keep Mission Control as a compatibility display facade, but
should not create two separate local execution authorities.

## Route Contracts

Owner routes under `/api/local-executor/*`:

- `GET /api/local-executor/status`: plugin setup status, paired daemon summaries, project
  policies, recent runs, and next setup action.
- `POST /api/local-executor/pairing/start`: create a short-lived one-use pairing code and
  install command.
- `GET /api/local-executor/policies`: list project/repo policies.
- `POST /api/local-executor/policies`: add a project/repo policy.
- `PATCH /api/local-executor/policies/:id`: update status, provider preset, landing policy,
  command allowlist, and caps.
- `DELETE /api/local-executor/policies/:id`: revoke or archive a policy.
- `POST /api/local-executor/runs`: create an owner-directed manual run or approval-backed run.
- `GET /api/local-executor/runs/:id`: run detail, events, artifacts, and linked Mission Control ids.
- `GET /api/local-executor/audit`: recent audit events.

Daemon routes under `/api/local-executor/daemon/*`:

- `POST /pairing/complete`: exchange a pairing code for a scoped daemon token.
- `POST /heartbeat`: report version, platform, health, active policy summaries, and current
  run state.
- `POST /runs/claim`: claim the next approved queued run for this runner.
- `POST /runs/:id/events`: append progress, command, policy, and artifact events.
- `POST /runs/:id/complete`: submit final status, concise summary, changed file manifest,
  quality gate results, cost/usage if available, and artifact manifest.

All daemon routes require the daemon token. Responses must never return other owners' data,
raw secrets, or broad local path listings.

## Daemon Config

Default config path:

```json
{
  "defaultProviderPreset": "opencode"
}
```

The local runner keeps pairing state and logs next to that config by default:
`~/.me3/local-executor/token.json` and `~/.me3/local-executor/runs/`. Provider presets are
configured locally, not per project in the Mission Control UI. OpenCode is the default because
it can route to multiple model providers; users who prefer Codex or Claude can set
`defaultProviderPreset` in `~/.me3/local-executor/config.json` or pass `once --provider codex`
for a one-off run. The daemon must still validate the final command against the active project
policy before spawning a process.

The daemon should store full local logs only under the local log directory. Core receives
bounded summaries, structured events, and selected artifacts only when the run policy allows it.

## Project Policy

Each project policy should include:

- Project label and path hint.
- Resource kind: `repo` first; directories can come later.
- Internal provider preset default. Owner-facing provider selection belongs in the local
  runner config, not in each project form.
- Default branch and allowed git target: `none`, `branch`, or `main`.
- Landing policy:
  - `report_only` by default.
  - Optional `commit` after quality gates pass.
  - Optional `push` after commit.
  - Optional `direct_main` only when the owner explicitly allows it for that repo.
- Max runtime, max output characters, max artifact bytes, and max changed file count.
- Quality gates, such as `pnpm build`, `pnpm test`, `bd sync`, or repo-specific scripts.
- Dirty-repo behavior: default is block if uncommitted changes exist unless the policy
  explicitly allows working with them.

Hard denials:

- Force push.
- Destructive reset or checkout that would discard user work.
- Broad home-directory scans.
- Secret-printing commands and known credential file reads.
- Paths outside the allowlisted repo/directory.
- Editing daemon token/config files unless the owner is in local setup mode.

## Run Lifecycle

1. Owner activates Local Executor.
2. Owner pairs a daemon from an always-on machine.
3. Owner adds one project policy.
4. Owner creates or runs the Local Coding Task job from `/assistant`, chat, or Soulink.
5. Core validates the job, policy, setup, and approval state.
6. Core creates a Local Executor run and linked Mission Control run.
7. Daemon polls, claims an approved run, and marks it running.
8. Daemon validates local repo state and command policy.
9. Daemon runs the configured provider command with the assembled prompt.
10. Daemon streams bounded events and stores full logs locally.
11. Daemon completes the run with summary, changed files, quality gates, artifacts, and errors.
12. Core updates Local Executor and Mission Control records.
13. Owner receives a concise notification through the active owner channel when configured.

Scheduled or event-triggered runs stop after step 5 until a Mission Control approval is resolved.

## Result Shape

Executor completion payload:

```ts
type LocalExecutorRunResult = {
  status: "succeeded" | "failed" | "cancelled" | "blocked";
  summary: string;
  provider: "opencode" | "codex" | "claude" | string;
  runnerId: string;
  branch: string | null;
  changedFiles: Array<{ path: string; status: string }>;
  qualityGates: Array<{ command: string; status: "passed" | "failed" | "skipped"; exitCode: number | null }>;
  artifacts: Array<{ kind: "log" | "patch" | "summary" | "file"; label: string; localRef?: string; coreRef?: string }>;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  error?: { code: string; message: string };
};
```

Mission Control should show the concise result first: what was requested, what happened,
what changed, whether gates passed, where the local logs are, and what approval or follow-up
is needed.

## Safety And Audit

The safety defaults are deliberately conservative:

- Pairing is off until the owner starts setup.
- Pairing codes are short-lived and one-use.
- Daemon tokens are hashed in Core and stored locally outside repo-tracked files.
- New project policies start at report-only.
- Scheduled/event-triggered execution requires approval before local execution.
- Manual owner direction approves one bounded run, not future runs.
- Policy changes are audited and require owner action.
- The daemon fails closed on unknown policy, missing repo, dirty repo, denied command, timeout,
  output cap, artifact cap, or token revocation.

Audit must record:

- Pairing start/complete/revoke.
- Policy create/change/revoke.
- Run requested, approved, claimed, started, completed, failed, blocked, or cancelled.
- Command families invoked and exit codes.
- Changed file counts and quality gate outcomes.
- Denials and health degradation/recovery.

## Implementation Order

1. Done: Add this doc and link it from the harness roadmap.
2. Done: Register `me3.local-executor` as an optional first-party plugin.
3. Done: Add plugin-owned types/constants for provider presets, project policies, runs, and result shape.
4. Done: Add D1 migration and owner/daemon route skeletons.
5. Done: Build the source-checkout local runner CLI with pair, config, run-once, and provider render commands.
6. Done: Add Account plugin Configure flow, Mission Control local projects, and task-level Run locally.
7. Done: Add a long-running poll mode and owner retry/cancel recovery for stale runs.
8. Next: Add local runner packaging.
9. Next: Add Local Coding Task starter recipe and scheduled/event-triggered approval flow.
10. Next: Add richer Mission Control result panels for artifacts, changed files, gates, and local logs.
11. Next: Add Soulink/chat manual-run handoff and concise result notification.

## Test Plan

- Plugin activation makes Local Executor visible in `/assistant`; missing daemon setup marks
  the job `needs_setup`.
- Pairing flow creates a one-use code, completes with a daemon token, and heartbeats status
  into setup.
- Manual owner-directed run is claimable by daemon and lands a Mission Control run plus a
  concise owner notification.
- Scheduled/event run creates an approval instead of being claimable immediately.
- Policy tests cover disallowed repo, disallowed command, timeout, dirty repo handling,
  output cap, no-push default, and enabled commit/push policy.
- Provider adapter tests verify OpenCode default and Codex/Claude command rendering without
  exposing secrets.
- Daemon route tests prove token rejection, revoked runner rejection, idempotent completion,
  artifact caps, and no cross-owner data leakage.

## External CLI References

- OpenCode CLI: https://opencode.ai/docs/cli
- Codex non-interactive mode: https://developers.openai.com/codex/noninteractive
- Claude Code CLI reference: https://docs.anthropic.com/en/docs/claude-code/cli-usage
