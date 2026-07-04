# Assistant Resolver Evals

## 2026-07-04 Live Smoke Eval

Ran 20 read-only prompts against the deployed ME3 assistant using real Mission Control projects.

Result: 18/20 resolved to the expected project after waiting for final responses.

Passed:
- Exact project names.
- Natural wrappers like "the writing project".
- `project: writing`.
- Project task-list reads.
- Mission context reads with purpose, mission statement, and tasks.

Failed:
- Spaced handle form: `Kieran of Earth` did not resolve to `KieranOfEarth`.
- Vague semantic reference: `outer technology project` did not resolve to a project.

Follow-up shipped:
- Split camelCase/project-handle labels before token scoring.
- Read public `public/me.json` for audience context, matching the published `.well-known/me.json` path.

Embedding trigger:
- Add semantic search when a real prompt cannot be resolved by exact labels, token overlap, aliases, or project purpose text, and the intended project is still clear to a human.
- Keep exact/token scoring first. Use embeddings as fallback or reranker, not as the primary resolver.
