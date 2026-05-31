# Assistant Jobs and Agent Skills

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

Core v1 should keep skills as optional context references. Recipes and jobs may record `recommendedSkillIds` and `requiredSkillIds`, but skills must not grant permissions, bypass capability validation, or run scripts by themselves.

The safe integration path:

1. Add skill reference fields to recipes and job drafts.
2. Validate that required skills are available before a job can run active.
3. Use activated skills later as prompt/context material for the runner.
4. Keep all side effects behind ME3 capability registry checks.
5. Treat skill scripts as unavailable until wrapped by an explicit capability and approval policy.

This lets ME3 stay compatible with the Agent Skills concept without making arbitrary skill folders an execution surface.

References:

- Agent Skills overview: https://agentskills.io/home
- Agent Skills specification: https://agentskills.io/specification
- Adding skills support: https://agentskills.io/client-implementation/adding-skills-support
