# Assistant Jobs and Agent Skills

Last updated: 2026-06-05

Planning source of truth: [`docs/agent-harness-roadmap.md`](agent-harness-roadmap.md).
This document is the detailed boundary reference for skills, recipes, jobs, capabilities,
and runs.

Assistant Jobs and Agent Skills are related, but they should not be the same thing.

Agent Skills are portable instruction bundles for agents. The public Agent Skills format defines a skill as a directory with a required `SKILL.md`, metadata, instructions, and optional `scripts/`, `references/`, and `assets/`. Skills are loaded through progressive disclosure: first metadata, then full instructions when relevant, then resources as needed.

Assistant Jobs are ME3 owner-confirmed routines. A job has a trigger, scope, rules, actions, approval policy, destination, versions, runs, artifacts, and Mission Control outputs.

The boundary:

- Skill: how an agent knows how to do a kind of work.
- Recipe: a starter template for a job.
- Job: a persisted owner-confirmed routine.
- Capability: a safe callable ME3 or plugin action.
- Run: one execution of a job.

Core v1 should keep skills as optional context references. Recipes and jobs may record `recommendedSkillIds` and legacy `requiredSkillIds`, but missing skills should not block a job from being saved, activated, or run. Skills must not grant permissions, bypass capability validation, or run scripts by themselves.

Current Core implementation:

- Assistant skills persist per owner in `assistant_skills`.
- `/api/assistant/skills` can list, install from a URL/repo reference, update, and archive skills.
- Chat context can match active skills by request text and add matched skills to the context packet as `agent_skill` sources.
- Stored `SKILL.md` text can be included as matched instructions, but skill scripts remain inert and unavailable to the runner.
- The Skills modal is intentionally minimal: paste a trusted skill URL/repo, install, then see compact installed skill cards.
- Job drafts already carry skill reference arrays, but the starter recipes currently leave them empty.
- Scheduled job runs do not yet load matched skills into their run context.
- URL/repo install stores the source reference and lightweight metadata; it does not yet fetch, audit, version, or import remote `SKILL.md` files automatically.

Near-term direction:

1. Treat skills as optional know-how that can improve chat and job-builder reasoning.
2. Use skills in custom job creation first: match a request to relevant playbooks, then produce a clearer draft with safer defaults and better questions.
3. Let existing jobs show recommended skills as helpful context, not requirements.
4. Keep all side effects behind ME3 capability registry checks.
5. Treat missing skills as warnings or suggestions only.
6. Treat skill scripts as unavailable until wrapped by an explicit capability and approval policy.

This lets ME3 stay compatible with the Agent Skills concept without making arbitrary skill folders an execution surface.

## Where Skills Help Most

Existing starter jobs:

- Weekly Review is the strongest fit. A Core-owned "Weekly Review Memory Coach" skill could guide the job toward carry-over decisions, task clean-up, and suggested saved memories from review outputs.
- Inbox Watch can benefit later from an "Email Triage And Reply Style" skill, especially once approval-first draft replies are polished.
- Invoice and Receipt Triage can benefit from extraction heuristics, but this should wait until file/reference handling and confidence review are stronger.
- Daily Briefing probably does not need a skill yet. Mission statement, Wheel of Life, tasks, and calendar-style context are more valuable than another playbook.

Custom job creation is the better immediate use case. Skills can help the builder understand the shape of a requested routine, suggest the right trigger, identify needed capabilities, phrase owner-facing setup warnings, and avoid overloading every run with long instructions. The builder can use skill metadata first, then load full `SKILL.md` only when the owner request matches.

## Demo Skill Candidates

- Weekly Review Memory Coach: Core-owned, recommended for Weekly Review, not default-enabled until Weekly Review’s owner-facing review surface is polished.
- Mission Control Project Triage: Core-owned, useful for custom jobs that inspect projects/tasks and create next actions.
- Inbox Watch Reply Style: Core/email-owned, useful after approval-first reply drafts are ready.
- Cloudflare Fast Deploy: plugin-owned, useful for a later Cloudflare deploy spike and only paired with explicit Cloudflare/GitHub or local-runner capabilities.
- ME3 Site Polish: Core/site-owned, useful for owner-approved profile or site update jobs once site write capabilities are explicit.

## Discovery And Import

Remote skill search can be added through a server-side Worker endpoint. The frontend should not call public skill registries directly with secrets. A future endpoint can proxy search/detail/audit requests, store only owner-installed skills, and require owner confirmation before activation.

`skills.sh` looks useful for discovery because it exposes search/detail/file/audit-style APIs and also ships a local package/CLI. The hosted ME3 modal should use its API through the Worker if we adopt it. The package/CLI is more relevant to the local runner path, where ME3 may eventually install or inspect skill bundles in a local workspace.

References:

- Agent Skills overview: https://agentskills.io/home
- Agent Skills specification: https://agentskills.io/specification
- Adding skills support: https://agentskills.io/client-implementation/adding-skills-support
