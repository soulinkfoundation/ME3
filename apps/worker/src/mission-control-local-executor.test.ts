import { describe, expect, it } from "vitest";
import { LOCAL_EXECUTOR_PLUGIN_ID } from "@me3-core/plugin-local-executor";
import {
  createMissionProject,
  createMissionTask,
  getMissionTaskLocalExecutorRunInput,
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
});

type MissionLocalExecutorState = {
  localExecutorEnabled: boolean;
  projects: ProjectRow[];
  policies: PolicyRow[];
  tasks: TaskRow[];
  audit: Record<string, unknown>[];
};

type MissionLocalExecutorEnv = Env & { __state: MissionLocalExecutorState };

function createMissionLocalExecutorEnv(
  overrides: Partial<MissionLocalExecutorState> = {},
): MissionLocalExecutorEnv {
  const state: MissionLocalExecutorState = {
    localExecutorEnabled: true,
    projects: [],
    policies: [],
    tasks: [],
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
        due_at: values[7] as string | null,
        scheduled_for: values[8] as string | null,
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

    if (sql.includes("FROM local_executor_project_policies")) {
      return (
        this.state.policies.find(
          (policy) => policy.id === values[0] && policy.user_id === values[1],
        ) || null
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
}
