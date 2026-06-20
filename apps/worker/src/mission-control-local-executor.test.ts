import { describe, expect, it } from "vitest";
import { LOCAL_EXECUTOR_PLUGIN_ID } from "@me3-core/plugin-local-executor";
import {
  createMissionProject,
  createMissionTask,
  getMissionTaskLocalExecutorRunInput,
  updateMissionTask,
} from "./mission-control";
import type { Env } from "./types";

type ProjectRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  slug: string;
  source_kind: string;
  source_ref: string | null;
  metadata_json: string;
};
type PolicyRow = Record<string, unknown> & { id: string; user_id: string; path_hint: string };
type TaskRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  archived_at: string | null;
};
type PairingRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  status: string;
};
type RunRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  status: string;
};

describe("Mission Control local projects", () => {
  it("creates a Local Executor policy and resolves task run input", async () => {
    const env = createMissionLocalExecutorEnv();

    const createdProject = await createMissionProject(env, "owner", {
      name: "ME3",
      description: "Core repo",
      projectType: "local",
      localPath: "/Users/kieranbutler/Coding/me3",
    });
    expect(createdProject.project).toMatchObject({
      name: "ME3",
      sourceKind: "daemon_repo",
      metadata: {
        localPath: "/Users/kieranbutler/Coding/me3",
      },
    });
    expect(env.__state.policies).toHaveLength(1);
    expect(env.__state.policies[0]).toMatchObject({
      project_label: "ME3",
      path_hint: "/Users/kieranbutler/Coding/me3",
      provider_preset: "opencode",
    });

    const createdTask = await createMissionTask(env, "owner", {
      title: "Fix login redirect",
      description: "Use the current auth callback.",
      projectId: createdProject.project.id,
    });
    await expect(
      getMissionTaskLocalExecutorRunInput(env, "owner", createdTask.task.id),
    ).resolves.toMatchObject({
      projectPolicyId: env.__state.policies[0]!.id,
      promptSummary: "Fix login redirect",
      sourceKind: "manual",
      ownerDirected: true,
      prompt: expect.stringContaining("Use the current auth callback."),
    });
  });

  it("requires the Local Executor plugin for local projects", async () => {
    const env = createMissionLocalExecutorEnv({ localExecutorEnabled: false });

    await expect(
      createMissionProject(env, "owner", {
        name: "ME3",
        projectType: "local",
        localPath: "/Users/kieranbutler/Coding/me3",
      }),
    ).rejects.toMatchObject({
      message: "Turn on Local Executor before adding a local project",
      status: 409,
    });
  });

  it("queues one local run when a local project task enters Doing", async () => {
    const env = createMissionLocalExecutorEnv({
      pairings: [{ id: "pairing-1", user_id: "owner", status: "active" }],
    });
    const createdProject = await createMissionProject(env, "owner", {
      name: "ME3",
      projectType: "local",
      localPath: "/Users/kieranbutler/Coding/me3",
    });
    const createdTask = await createMissionTask(env, "owner", {
      title: "Fix login redirect",
      projectId: createdProject.project.id,
    });
    expect(env.__state.runs).toHaveLength(0);

    await updateMissionTask(env, "owner", createdTask.task.id, {
      status: "in_progress",
    });
    await updateMissionTask(env, "owner", createdTask.task.id, {
      status: "in_progress",
    });

    expect(env.__state.runs).toHaveLength(1);
    expect(env.__state.missionRuns[0]).toMatchObject({
      task_id: createdTask.task.id,
      project_id: createdProject.project.id,
      status: "queued",
    });
    expect(JSON.parse(env.__state.missionRuns[0]?.result_json as string)).toMatchObject({
      localExecutorRunId: env.__state.runs[0]?.id,
      localExecutorTaskId: createdTask.task.id,
    });
  });

  it("leaves local Doing tasks saveable when no runner is paired", async () => {
    const env = createMissionLocalExecutorEnv();
    const createdProject = await createMissionProject(env, "owner", {
      name: "ME3",
      projectType: "local",
      localPath: "/Users/kieranbutler/Coding/me3",
    });
    const createdTask = await createMissionTask(env, "owner", {
      title: "Fix login redirect",
      projectId: createdProject.project.id,
    });

    const updated = await updateMissionTask(env, "owner", createdTask.task.id, {
      status: "in_progress",
    });

    expect(updated.task).toMatchObject({ status: "in_progress" });
    expect(env.__state.runs).toHaveLength(0);
    expect(env.__state.missionRuns).toHaveLength(0);
  });
});

type MissionLocalExecutorState = {
  localExecutorEnabled: boolean;
  pairings: PairingRow[];
  projects: ProjectRow[];
  policies: PolicyRow[];
  tasks: TaskRow[];
  runs: RunRow[];
  runEvents: Record<string, unknown>[];
  missionRuns: Record<string, unknown>[];
  pluginActivities: Record<string, unknown>[];
  audit: Record<string, unknown>[];
};

type MissionLocalExecutorEnv = Env & { __state: MissionLocalExecutorState };

function createMissionLocalExecutorEnv(
  overrides: Partial<MissionLocalExecutorState> = {},
): MissionLocalExecutorEnv {
  const state: MissionLocalExecutorState = {
    localExecutorEnabled: true,
    pairings: [],
    projects: [],
    policies: [],
    tasks: [],
    runs: [],
    runEvents: [],
    missionRuns: [],
    pluginActivities: [],
    audit: [],
    ...overrides,
  };
  const db = {
    prepare(sql: string) {
      return new FakeMissionLocalExecutorStatement(state, sql);
    },
  };
  return { DB: db as unknown as D1Database, __state: state };
}

class FakeMissionLocalExecutorStatement {
  private values: unknown[] = [];

  constructor(
    private readonly state: MissionLocalExecutorState,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    const { sql, values } = this;

    if (sql.includes("INSERT INTO local_executor_project_policies")) {
      this.state.policies.push({
        id: values[0] as string,
        user_id: values[1] as string,
        project_label: values[2] as string,
        path_hint: values[3] as string,
        resource_kind: values[4] as string,
        status: "active",
        provider_preset: values[5] as string,
        model_hint: values[6] as string | null,
        default_branch: values[7] as string,
        allowed_git_target: values[8] as string,
        landing_policy: values[9] as string,
        direct_main: values[10] as number,
        command_policy_json: values[11] as string,
        quality_gates_json: values[12] as string,
        caps_json: values[13] as string,
        dirty_repo: values[14] as string,
        created_at: values[15] as string,
        updated_at: values[16] as string,
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO local_executor_audit_events")) {
      this.state.audit.push({
        id: values[0],
        user_id: values[1],
        project_policy_id: values[3],
        event_type: values[6],
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO local_executor_runs")) {
      this.state.runs.push({
        id: values[0] as string,
        user_id: values[1] as string,
        assistant_job_id: values[2] as string | null,
        assistant_job_run_id: values[3] as string | null,
        project_policy_id: values[4] as string,
        prompt_summary: values[5] as string,
        prompt_text: values[6] as string,
        source_kind: values[7] as string,
        status: values[8] as string,
        provider: values[9] as string,
        runner_id: null,
        approval_id: values[10] as string | null,
        mission_agent_run_id: values[11] as string,
        started_at: null,
        finished_at: null,
        result_summary: null,
        output_preview: null,
        artifact_manifest_json: "[]",
        changed_files_json: "[]",
        quality_gates_json: "[]",
        error_code: null,
        error_message: null,
        created_at: values[12] as string,
        updated_at: values[13] as string,
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO local_executor_run_events")) {
      this.state.runEvents.push({
        id: values[0],
        run_id: values[1],
        event_type: values[2],
        actor: values[3],
        message: values[4],
        payload_json: values[5],
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO mission_agent_runs")) {
      const existing = this.state.missionRuns.find((run) => run.id === values[0]);
      const row = {
        id: values[0],
        user_id: values[1],
        source: "daemon",
        project_id: values[2],
        task_id: values[3],
        approval_id: values[4],
        title: values[5],
        prompt_summary: values[6],
        status: values[7],
        model: values[8],
        runner_id: values[9],
        started_at: values[10],
        finished_at: values[11],
        result_json: values[12],
        artifact_manifest_json: values[13],
      };
      if (existing) {
        Object.assign(existing, {
          ...row,
          project_id: row.project_id || existing.project_id,
          task_id: row.task_id || existing.task_id,
        });
      } else {
        this.state.missionRuns.push(row);
      }
      return { success: true };
    }

    if (sql.includes("INSERT INTO mission_plugin_activity")) {
      this.state.pluginActivities.push({
        id: values[0],
        user_id: values[1],
        plugin_id: values[2],
        title: values[3],
        summary: values[4],
        status: values[5],
        related_id: values[6],
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO mission_projects")) {
      this.state.projects.push({
        id: values[0] as string,
        user_id: values[1] as string,
        name: values[2] as string,
        slug: values[3] as string,
        description: values[4] as string | null,
        status: "active",
        color: values[5] as string | null,
        icon: values[6] as string | null,
        source_kind: values[7] as string,
        source_ref: values[8] as string | null,
        metadata_json: values[9] as string,
        created_at: "2026-06-01T09:00:00Z",
        updated_at: "2026-06-01T09:00:00Z",
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO mission_tasks")) {
      this.state.tasks.push({
        id: values[0] as string,
        user_id: values[1] as string,
        project_id: values[2] as string | null,
        title: values[3] as string,
        description: values[4] as string | null,
        status: values[5] as string,
        priority: values[6] as number,
        pinned_at: values[7] ? "2026-06-01T09:05:00Z" : null,
        due_at: values[8] as string | null,
        scheduled_for: values[9] as string | null,
        source_kind: "manual",
        source_ref: null,
        approval_id: null,
        metadata_json: "{}",
        created_at: "2026-06-01T09:05:00Z",
        updated_at: "2026-06-01T09:05:00Z",
        archived_at: null,
      });
      return { success: true };
    }

    if (sql.includes("UPDATE mission_tasks")) {
      const task = this.state.tasks.find(
        (candidate) => candidate.id === values[9] && candidate.user_id === values[10],
      );
      if (task) {
        task.project_id = values[0] as string | null;
        task.title = values[1] as string;
        task.description = values[2] as string | null;
        task.status = values[3] as string;
        task.priority = values[4] as number;
        if (values[5]) task.pinned_at = task.pinned_at || "2026-06-01T09:10:00Z";
        if (values[6]) task.pinned_at = null;
        task.due_at = values[7] as string | null;
        task.scheduled_for = values[8] as string | null;
        task.updated_at = "2026-06-01T09:10:00Z";
      }
      return { success: true };
    }

    throw new Error(`Unhandled SQL run: ${sql}`);
  }

  async first<T>() {
    const { sql, values } = this;

    if (sql.includes("FROM plugin_installations")) {
      if (!this.state.localExecutorEnabled || values[0] !== LOCAL_EXECUTOR_PLUGIN_ID) {
        return null as T | null;
      }
      return {
        plugin_id: LOCAL_EXECUTOR_PLUGIN_ID,
        version: "0.1.0",
        enabled: 1,
        status: "installed",
        granted_permissions_json: "[]",
        setup_state_json: "{}",
        installed_at: "2026-06-01T09:00:00Z",
        updated_at: "2026-06-01T09:00:00Z",
      } as T;
    }

    if (sql.includes("FROM local_executor_pairings")) {
      return (
        this.state.pairings.find(
          (pairing) => pairing.user_id === values[0] && pairing.status === "active",
        ) || null
      ) as T | null;
    }

    if (sql.includes("FROM mission_projects") && sql.includes("slug = ?")) {
      return (
        this.state.projects.find(
          (project) => project.user_id === values[0] && project.slug === values[1],
        ) || null
      ) as T | null;
    }

    if (sql.includes("FROM mission_projects") && sql.includes("id = ?")) {
      return (
        this.state.projects.find(
          (project) => project.id === values[0] && project.user_id === values[1],
        ) || null
      ) as T | null;
    }

    if (sql.includes("FROM local_executor_project_policies") && sql.includes("WHERE user_id = ?")) {
      return (
        this.state.policies.find(
          (policy) => policy.user_id === values[0] && policy.status === "active",
        ) || null
      ) as T | null;
    }

    if (sql.includes("FROM local_executor_project_policies")) {
      return (
        this.state.policies.find(
          (policy) => policy.id === values[0] && policy.user_id === values[1],
        ) || null
      ) as T | null;
    }

    if (sql.includes("FROM mission_agent_runs") && sql.includes("task_id = ?")) {
      return (
        this.state.missionRuns.find(
          (run) =>
            run.user_id === values[0] &&
            run.task_id === values[1] &&
            run.source === "daemon" &&
            (run.status === "queued" || run.status === "running"),
        ) || null
      ) as T | null;
    }

    if (sql.includes("FROM mission_agent_runs")) {
      return (
        this.state.missionRuns.find((run) => run.id === values[0] && run.user_id === values[1]) ||
        null
      ) as T | null;
    }

    if (sql.includes("FROM local_executor_runs")) {
      return (
        this.state.runs.find((run) => run.id === values[0] && run.user_id === values[1]) || null
      ) as T | null;
    }

    if (sql.includes("FROM mission_tasks")) {
      return (
        this.state.tasks.find(
          (task) => task.id === values[0] && task.user_id === values[1],
        ) || null
      ) as T | null;
    }

    throw new Error(`Unhandled SQL first: ${sql}`);
  }

  async all<T>() {
    const { sql, values } = this;

    if (sql.includes("FROM local_executor_run_events")) {
      return {
        results: this.state.runEvents.filter((event) => event.run_id === values[0]) as T[],
      };
    }

    throw new Error(`Unhandled SQL all: ${sql}`);
  }
}
