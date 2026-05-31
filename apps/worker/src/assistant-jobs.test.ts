import { describe, expect, it } from "vitest";
import {
  archiveAssistantJob,
  createAssistantJob,
  duplicateAssistantJob,
  executeAssistantJobRun,
  getAssistantJob,
  listAssistantJobIngressEvents,
  listAssistantJobs,
  markAssistantJobIngressQueueMessageFailed,
  processAssistantJobIngressQueueMessage,
  recordAssistantJobIngressEvent,
  runAssistantJobNow,
  setAssistantJobPaused,
  updateAssistantJobIngressEvent,
} from "./assistant-jobs";
import type { Env } from "./types";

type JobRow = Record<string, unknown> & { id: string; user_id: string; status: string };
type VersionRow = Record<string, unknown> & { id: string; job_id: string; user_id: string };
type RunRow = Record<string, unknown> & { id: string; job_id: string; user_id: string };
type ActionResultRow = Record<string, unknown> & {
  id: string;
  run_id: string;
  action_id: string;
  idempotency_key: string;
  status: string;
};
type IngressRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  idempotency_key: string;
  status: string;
};

type AssistantJobsDbState = {
  owner: Record<string, unknown> | null;
  jobs: JobRow[];
  versions: VersionRow[];
  runs: RunRow[];
  actionResults: ActionResultRow[];
  approvals: Record<string, unknown>[];
  missionAgentRuns: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  dailyNotes: Record<string, unknown>[];
  captures: Record<string, unknown>[];
  memory: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  recentMessages: Record<string, unknown>[];
  failMemoryLookup?: boolean;
  events: Record<string, unknown>[];
  ingressEvents: IngressRow[];
  pluginActivities: Record<string, unknown>[];
  queueMessages: unknown[];
};

describe("assistant jobs persistence", () => {
  it("creates, lists, pauses, duplicates, runs, and archives jobs", async () => {
    const env = createAssistantJobsEnv();

    const created = await createAssistantJob(env, "owner", { recipeId: "weekly-review" });
    expect(created.job.status).toBe("active");
    expect(created.validation.status).toBe("valid");

    const listed = await listAssistantJobs(env, "owner");
    expect(listed.jobs).toHaveLength(1);
    expect(listed.jobs[0]?.name).toBe("Weekly Review");
    await expect(
      createAssistantJob(env, "owner", { recipeId: "weekly-review" }),
    ).rejects.toMatchObject({
      message: "That job has already been added.",
      status: 409,
    });

    const detail = await getAssistantJob(env, "owner", created.job.id);
    expect(detail.version?.validationStatus).toBe("valid");

    const paused = await setAssistantJobPaused(env, "owner", created.job.id, true);
    expect(paused.job.status).toBe("paused");

    const resumed = await setAssistantJobPaused(env, "owner", created.job.id, false);
    expect(resumed.job.status).toBe("active");

    const duplicated = await duplicateAssistantJob(env, "owner", created.job.id);
    expect(duplicated.job.status).toBe("draft");
    expect(duplicated.job.name).toBe("Weekly Review copy");

    const run = await runAssistantJobNow(env, "owner", created.job.id);
    expect(run.run.status).toBe("succeeded");
    expect(run.execution).toBe("succeeded");
    expect(run.actionResults).toHaveLength(5);
    expect(env.__state.missionAgentRuns[0]).toMatchObject({
      source: "core",
      status: "succeeded",
      runner_id: "assistant-jobs",
    });
    expect(JSON.parse(env.__state.missionAgentRuns[0]?.result_json as string)).toMatchObject({
      assistantJobRunId: run.run.id,
      contextPacketId: `agent-context:owner:job-run:${run.run.id}`,
      contextManifest: {
        packetId: `agent-context:owner:job-run:${run.run.id}`,
      },
    });
    expect(env.__state.missionAgentRuns[0]?.prompt_summary).toBe(
      "Weekly Review ran successfully and created a Mission Control result.",
    );
    expect(env.__state.missionAgentRuns[0]?.prompt_summary).not.toContain(
      "ME3 agent context packet",
    );

    await archiveAssistantJob(env, "owner", created.job.id);
    const afterArchive = await listAssistantJobs(env, "owner");
    expect(afterArchive.jobs.map((job) => job.id)).not.toContain(created.job.id);
  });

  it("creates blocked run records for setup-gated jobs", async () => {
    const env = createAssistantJobsEnv();

    const created = await createAssistantJob(env, "owner", { recipeId: "email-triage" });
    expect(created.job.status).toBe("needs_setup");

    const run = await runAssistantJobNow(env, "owner", created.job.id);
    expect(run.run.status).toBe("blocked");
    expect(run.validation.status).toBe("needs_setup");
  });

  it("records assistant job ingress events idempotently", async () => {
    const env = createAssistantJobsEnv({ queue: true });
    const body = {
      sourceKind: "mission_control",
      sourceId: "mission-control",
      sourceEventId: "review-packet-123",
      eventType: "review_packet.created",
      payload: { projectId: "project-1", title: "Weekly packet" },
    };

    const first = await recordAssistantJobIngressEvent(env, "owner", body);
    const duplicate = await recordAssistantJobIngressEvent(env, "owner", body);
    const listed = await listAssistantJobIngressEvents(env, "owner");

    expect(first.duplicate).toBe(false);
    expect(first.queued).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.queued).toBe(false);
    expect(duplicate.event.id).toBe(first.event.id);
    expect(listed.events).toHaveLength(1);
    expect(listed.events[0]?.status).toBe("queued");
    expect(env.__state.queueMessages).toEqual([{ eventId: first.event.id, userId: "owner" }]);
    expect(listed.events[0]?.payload).toMatchObject({
      projectId: "project-1",
      title: "Weekly packet",
      queuedAt: expect.any(String),
    });
  });

  it("updates and filters assistant job ingress event status", async () => {
    const env = createAssistantJobsEnv();

    const recorded = await recordAssistantJobIngressEvent(env, "owner", {
      sourceKind: "webhook",
      sourceId: "mailchimp",
      sourceEventId: "evt-1",
      eventType: "campaign.sent",
      idempotencyKey: "custom-key",
      payload: { campaignId: "campaign-1" },
      rawPayloadRef: "r2://assistant-jobs/webhooks/evt-1.json",
    });
    const updated = await updateAssistantJobIngressEvent(env, "owner", recorded.event.id, {
      status: "queued",
    });
    const queued = await listAssistantJobIngressEvents(env, "owner", "queued");

    expect(updated.event.status).toBe("queued");
    expect(updated.event.rawPayloadRef).toBe("r2://assistant-jobs/webhooks/evt-1.json");
    expect(queued.events.map((event) => event.id)).toEqual([recorded.event.id]);
  });

  it("processes queued ingress events through the runner", async () => {
    const env = createAssistantJobsEnv({ queue: true });
    const job = await createAssistantJob(env, "owner", {
      draft: eventJobDraft(),
      status: "active",
    });

    const recorded = await recordAssistantJobIngressEvent(env, "owner", {
      sourceKind: "core",
      sourceId: "mission-control",
      sourceEventId: "evt-2",
      eventType: "capture.created",
      payload: { captureId: "capture-1" },
    });

    const processed = await processAssistantJobIngressQueueMessage(env, {
      eventId: recorded.event.id,
      userId: "owner",
    });
    const repeated = await processAssistantJobIngressQueueMessage(env, {
      eventId: recorded.event.id,
      userId: "owner",
    });
    const detail = await getAssistantJob(env, "owner", job.job.id);

    expect(processed.outcome).toBe("matched");
    expect(processed.runCount).toBe(1);
    expect(processed.executions || []).toHaveLength(1);
    expect(processed.executions?.[0]?.execution).toBe("succeeded");
    expect(processed.event.status).toBe("matched");
    expect(processed.event.payload).toMatchObject({
      captureId: "capture-1",
      matchedRunCount: 1,
      matchedJobIds: [job.job.id],
    });
    expect(repeated.outcome).toBe("already_processed");
    expect(detail.runs).toHaveLength(1);
    expect(detail.runs[0]).toMatchObject({
      jobId: job.job.id,
      triggerKind: "event",
      triggerRef: recorded.event.id,
      status: "succeeded",
    });
  });

  it("creates approval-gated action results without repeating side effects for the same run", async () => {
    const env = createAssistantJobsEnv();
    const created = await createAssistantJob(env, "owner", {
      draft: approvalRequiredJobDraft(),
      status: "active",
    });

    const first = await runAssistantJobNow(env, "owner", created.job.id);
    const second = await executeAssistantJobRun(env, "owner", first.run.id);

    expect(first.run.status).toBe("waiting_for_approval");
    expect(first.execution).toBe("waiting_for_approval");
    expect(first.actionResults).toEqual([
      expect.objectContaining({
        actionId: "activate-memory",
        capabilityId: "mission.memory.activate",
        status: "pending_approval",
        approvalId: expect.any(String),
      }),
    ]);
    expect(second.execution).toBe("already_finished");
    expect(second.actionResults[0]?.approvalId).toBe(first.actionResults[0]?.approvalId);
    expect(env.__state.approvals).toHaveLength(1);
    expect(env.__state.actionResults).toHaveLength(1);
  });

  it("lands safe Assistant Job outputs in Mission Control idempotently", async () => {
    const env = createAssistantJobsEnv();
    const created = await createAssistantJob(env, "owner", {
      draft: missionOutputJobDraft(),
      status: "active",
    });

    const first = await runAssistantJobNow(env, "owner", created.job.id);
    env.__state.runs[0]!.status = "queued";
    const retry = await executeAssistantJobRun(env, "owner", first.run.id);

    expect(first.run.status).toBe("succeeded");
    expect(first.actionResults).toEqual([
      expect.objectContaining({
        actionId: "create-task",
        capabilityId: "mission.task.create",
        status: "succeeded",
        externalRef: `assistant-job-output:${first.run.id}:create-task:task`,
      }),
      expect.objectContaining({
        actionId: "create-capture",
        capabilityId: "mission.capture.create",
        status: "succeeded",
        externalRef: `assistant-job-output:${first.run.id}:create-capture:capture`,
      }),
      expect.objectContaining({
        actionId: "create-activity",
        capabilityId: "mission.activity.create",
        status: "succeeded",
        externalRef: `assistant-job-output:${first.run.id}:create-activity:activity`,
      }),
    ]);
    expect(retry.execution).toBe("succeeded");
    expect(env.__state.tasks).toHaveLength(1);
    expect(env.__state.tasks[0]).toMatchObject({
      title: "Follow up with Ada",
      project_id: "project-1",
      status: "backlog",
      source_kind: "agent",
    });
    expect(env.__state.dailyNotes).toHaveLength(1);
    expect(env.__state.dailyNotes[0]).toMatchObject({
      id: "assistant-job-day:owner:2026-05-23",
      date: "2026-05-23",
    });
    expect(env.__state.captures).toHaveLength(1);
    expect(env.__state.captures[0]).toMatchObject({
      text: "Review launch notes",
      project_id: "project-1",
      type: "task",
      source: "agent",
    });
    expect(env.__state.pluginActivities).toHaveLength(1);
    expect(env.__state.pluginActivities[0]).toMatchObject({
      activity_type: "assistant_job.activity",
      title: "Job finished",
      related_id: first.run.id,
    });
    expect(env.__state.actionResults).toHaveLength(3);
  });

  it("persists scoped context manifests and failed source markers for job runs", async () => {
    const env = createAssistantJobsEnv({
      failMemoryLookup: true,
      projects: [
        projectRow("project-1", "Launch Project"),
        projectRow("project-2", "Unrelated Project"),
      ],
      tasks: [
        taskRow("task-1", "Ship launch notes", "project-1"),
        taskRow("task-2", "Ignore unrelated", "project-2"),
      ],
    });
    const created = await createAssistantJob(env, "owner", {
      draft: { ...eventJobDraft(), projectId: "project-1" },
      projectId: "project-1",
      status: "active",
    });

    const run = await runAssistantJobNow(env, "owner", created.job.id);
    const result = JSON.parse(env.__state.missionAgentRuns[0]?.result_json as string) as {
      contextManifest: {
        sources: Array<{ id: string; kind: string; status: string }>;
      };
    };

    expect(run.run.status).toBe("succeeded");
    expect(result.contextManifest.sources).toContainEqual(
      expect.objectContaining({ id: "project-1", kind: "project", status: "included" }),
    );
    expect(result.contextManifest.sources).toContainEqual(
      expect.objectContaining({ id: "task-1", kind: "task", status: "included" }),
    );
    expect(result.contextManifest.sources).toContainEqual(
      expect.objectContaining({ id: "mission-memory", kind: "private_memory", status: "failed" }),
    );
    expect(result.contextManifest.sources).not.toContainEqual(
      expect.objectContaining({ id: "project-2" }),
    );
    expect(result.contextManifest.sources).not.toContainEqual(
      expect.objectContaining({ id: "task-2" }),
    );
  });

  it("ignores ingress events that do not match active event jobs", async () => {
    const env = createAssistantJobsEnv();

    const recorded = await recordAssistantJobIngressEvent(env, "owner", {
      sourceKind: "core",
      sourceId: "mission-control",
      sourceEventId: "evt-ignored",
      eventType: "capture.created",
    });
    const processed = await processAssistantJobIngressQueueMessage(env, {
      eventId: recorded.event.id,
      userId: "owner",
    });

    expect(processed.outcome).toBe("ignored");
    expect(processed.runCount).toBe(0);
    expect(processed.event.status).toBe("ignored");
    expect(processed.event.payload).toMatchObject({ queueOutcome: "no_matching_jobs" });
  });

  it("marks dead-lettered ingress events as failed", async () => {
    const env = createAssistantJobsEnv();

    const recorded = await recordAssistantJobIngressEvent(env, "owner", {
      sourceKind: "webhook",
      sourceId: "stripe",
      sourceEventId: "evt-3",
      eventType: "invoice.created",
    });

    const failed = await markAssistantJobIngressQueueMessageFailed(
      env,
      { eventId: recorded.event.id, userId: "owner" },
      new Error("boom"),
    );

    expect(failed.outcome).toBe("failed");
    expect(failed.event?.status).toBe("failed");
    expect(failed.event?.payload).toMatchObject({ errorMessage: "boom" });
    expect(env.__state.pluginActivities).toEqual([
      expect.objectContaining({
        plugin_id: "me3.assistant-jobs",
        activity_type: "assistant_job_event_dlq",
        status: "failed",
        related_id: recorded.event.id,
      }),
    ]);
  });
});

function eventJobDraft() {
  return {
    name: "Capture Review",
    purpose: "Review new Mission Control captures.",
    recipeId: null,
    trigger: {
      kind: "event",
      source: "core",
      sourceId: "mission-control",
      eventType: "capture.created",
      filters: [],
    },
    scope: {
      projectId: null,
      sourceIds: [],
      providerAccountIds: [],
      filters: [],
    },
    rules: [],
    actions: [
      {
        id: "create-review-packet",
        capabilityId: "mission.review_packet.create",
        label: "Create review packet",
        inputs: {},
        approvalMode: "review_required",
        onFailure: "request_review",
        idempotencyScope: "run",
      },
    ],
    approvalPolicy: {
      defaultMode: "review_required",
      overrides: [],
      ownerCanApproveFrom: "mission_control",
      approvalExpiresAfterHours: null,
    },
    destination: {
      kind: "mission_control",
      projectId: null,
      landing: "review_packet",
      quietIfNoChanges: true,
    },
    projectId: null,
    recommendedSkillIds: [],
    requiredSkillIds: [],
  };
}

function approvalRequiredJobDraft() {
  return {
    ...eventJobDraft(),
    name: "Approval Memory",
    purpose: "Prepare a gated memory activation.",
    trigger: { kind: "manual" },
    actions: [
      {
        id: "activate-memory",
        capabilityId: "mission.memory.activate",
        label: "Activate memory",
        inputs: { memoryId: "memory-1" },
        approvalMode: "approval_required",
        onFailure: "request_review",
        idempotencyScope: "run",
      },
    ],
    approvalPolicy: {
      defaultMode: "none",
      overrides: [],
      ownerCanApproveFrom: "mission_control",
      approvalExpiresAfterHours: null,
    },
  };
}

function missionOutputJobDraft() {
  return {
    ...eventJobDraft(),
    name: "Mission Outputs",
    purpose: "Land boring outputs in Mission Control.",
    trigger: { kind: "manual" },
    scope: {
      projectId: "project-1",
      sourceIds: [],
      providerAccountIds: [],
      filters: [],
    },
    actions: [
      {
        id: "create-task",
        capabilityId: "mission.task.create",
        label: "Create task",
        inputs: {
          title: "Follow up with Ada",
          description: "Send the context packet.",
          projectId: "project-1",
          priority: 2,
        },
        approvalMode: "none",
        onFailure: "stop",
        idempotencyScope: "run",
      },
      {
        id: "create-capture",
        capabilityId: "mission.capture.create",
        label: "Create capture",
        inputs: {
          text: "Review launch notes",
          type: "task",
          projectId: "project-1",
          date: "2026-05-23",
        },
        approvalMode: "none",
        onFailure: "stop",
        idempotencyScope: "run",
      },
      {
        id: "create-activity",
        capabilityId: "mission.activity.create",
        label: "Create activity",
        inputs: {
          title: "Job finished",
          summary: "Created useful outputs.",
        },
        approvalMode: "none",
        onFailure: "stop",
        idempotencyScope: "run",
      },
    ],
    approvalPolicy: {
      defaultMode: "none",
      overrides: [],
      ownerCanApproveFrom: "mission_control",
      approvalExpiresAfterHours: null,
    },
    destination: {
      kind: "mission_control",
      projectId: "project-1",
      landing: "activity",
      quietIfNoChanges: false,
    },
    projectId: "project-1",
  };
}

type AssistantJobsTestEnv = Env & { __state: AssistantJobsDbState };

type AssistantJobsEnvOptions = Partial<AssistantJobsDbState> & { queue?: boolean };

function createAssistantJobsEnv(options: AssistantJobsEnvOptions = {}): AssistantJobsTestEnv {
  const { queue: useQueue = false, ...stateOverrides } = options;
  const state: AssistantJobsDbState = {
    owner: {
      id: "owner",
      name: "Kieran",
      username: "kieran",
      bio: "Builds useful agentic products.",
      timezone: "Europe/Dublin",
    },
    jobs: [],
    versions: [],
    runs: [],
    actionResults: [],
    approvals: [],
    missionAgentRuns: [],
    projects: [],
    tasks: [],
    dailyNotes: [],
    captures: [],
    memory: [],
    calendarEvents: [],
    recentMessages: [],
    events: [],
    ingressEvents: [],
    pluginActivities: [],
    queueMessages: [],
    ...stateOverrides,
  };

  const db = {
    prepare(sql: string) {
      return new FakeStatement(state, sql);
    },
    async batch(statements: FakeStatement[]) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
  };

  const queue = {
    async send(message: unknown) {
      state.queueMessages.push(message);
    },
  };

  return {
    DB: db as unknown as D1Database,
    ASSISTANT_JOB_EVENTS: useQueue ? (queue as unknown as Queue) : undefined,
    __state: state,
  };
}

function projectRow(id: string, name: string) {
  return {
    id,
    user_id: "owner",
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    description: `${name} description`,
    status: "active",
    source_ref: null,
    updated_at: "2026-05-21T08:00:00.000Z",
  };
}

function taskRow(id: string, title: string, projectId: string) {
  return {
    id,
    user_id: "owner",
    project_id: projectId,
    title,
    description: null,
    status: "todo",
    due_at: null,
    scheduled_for: null,
    source_ref: null,
    updated_at: "2026-05-21T08:00:00.000Z",
  };
}

class FakeStatement {
  private values: unknown[] = [];

  constructor(
    private readonly state: AssistantJobsDbState,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    const sql = this.sql;
    const values = this.values;

    if (sql.includes("INSERT INTO assistant_jobs")) {
      this.state.jobs.push({
        id: values[0] as string,
        user_id: values[1] as string,
        recipe_id: values[2] as string | null,
        name: values[3] as string,
        purpose: values[4] as string,
        status: values[5] as string,
        current_version_id: values[6] as string,
        project_id: values[7] as string | null,
        destination_json: values[8] as string,
        trigger_summary: values[9] as string,
        next_run_at: values[10] as string | null,
        last_run_at: null,
        last_run_status: null,
        failure_count: 0,
        setup_state_json: values[11] as string,
        created_by: "owner",
        created_at: values[12] as string,
        updated_at: values[13] as string,
        archived_at: null,
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO assistant_job_versions")) {
      this.state.versions.push({
        id: values[0] as string,
        job_id: values[1] as string,
        user_id: values[2] as string,
        version_number: values[3] as number,
        name: values[4] as string,
        purpose: values[5] as string,
        trigger_json: values[6] as string,
        scope_json: values[7] as string,
        rules_json: values[8] as string,
        actions_json: values[9] as string,
        approval_policy_json: values[10] as string,
        destination_json: values[11] as string,
        capability_ids_json: values[12] as string,
        permission_summary_json: values[13] as string,
        recommended_skill_ids_json: values[14] as string,
        required_skill_ids_json: values[15] as string,
        validation_status: values[16] as string,
        validation_errors_json: values[17] as string,
        created_at: values[18] as string,
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO assistant_job_runs")) {
      this.state.runs.push({
        id: values[0] as string,
        user_id: values[1] as string,
        job_id: values[2] as string,
        job_version_id: values[3] as string,
        trigger_kind: sql.includes("'event'") ? "event" : "manual",
        trigger_ref: values[4] as string,
        status: values[5] as string,
        started_at: null,
        finished_at: null,
        output_preview: null,
        error_code: values[6] as string | null,
        error_message: values[7] as string | null,
        retry_count: 0,
        next_retry_at: null,
        created_at: values[8] as string,
        updated_at: values[9] as string,
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO assistant_job_run_events")) {
      this.state.events.push({ id: values[0], run_id: values[1], event_type: values[2] });
      return { success: true };
    }

    if (sql.includes("INSERT OR IGNORE INTO assistant_job_action_results")) {
      const exists = this.state.actionResults.some(
        (result) =>
          result.run_id === values[1] &&
          result.action_id === values[2] &&
          result.idempotency_key === values[4],
      );
      if (!exists) {
        this.state.actionResults.push({
          id: values[0] as string,
          run_id: values[1] as string,
          action_id: values[2] as string,
          capability_id: values[3] as string,
          idempotency_key: values[4] as string,
          status: values[5] as string,
          approval_id: values[6] as string | null,
          artifact_id: values[7] as string | null,
          external_ref: values[8] as string | null,
          error_message: values[9] as string | null,
          created_at: values[10] as string,
          updated_at: values[11] as string,
        });
      }
      return { success: true };
    }

    if (sql.includes("INSERT INTO mission_approvals")) {
      this.state.approvals.push({
        id: values[0] as string,
        user_id: values[1] as string,
        plugin_id: values[2] as string,
        action_id: values[3] as string,
        title: values[4] as string,
        summary: values[5] as string,
        payload_json: values[6] as string,
        risk_level: values[7] as string,
        status: "pending",
      });
      return { success: true };
    }

    if (sql.includes("INSERT INTO mission_agent_runs")) {
      const existing = this.state.missionAgentRuns.find((run) => run.id === values[0]);
      const row = {
        id: values[0] as string,
        user_id: values[1] as string,
        source: "core",
        project_id: values[2] as string | null,
        title: values[3] as string,
        prompt_summary: values[4] as string,
        status: values[5] as string,
        model: "structured-assistant-job-runner-v1",
        runner_id: "assistant-jobs",
        started_at: values[6] as string | null,
        finished_at: values[7] as string | null,
        result_json: values[8] as string,
        artifact_manifest_json: "[]",
        created_at: values[9] as string,
        updated_at: values[10] as string,
      };
      if (existing) Object.assign(existing, row);
      else this.state.missionAgentRuns.push(row);
      return { success: true };
    }

    if (sql.includes("INSERT OR IGNORE INTO mission_tasks")) {
      const exists = this.state.tasks.some((task) => task.id === values[0]);
      if (!exists) {
        this.state.tasks.push({
          id: values[0] as string,
          user_id: values[1] as string,
          project_id: values[2] as string | null,
          title: values[3] as string,
          description: values[4] as string | null,
          status: "backlog",
          priority: values[5] as number,
          due_at: values[6] as string | null,
          scheduled_for: values[7] as string | null,
          source_kind: "agent",
          source_ref: values[8] as string,
          approval_id: null,
          metadata_json: values[9] as string,
          created_at: values[10] as string,
          updated_at: values[11] as string,
          archived_at: null,
        });
      }
      return { success: true };
    }

    if (sql.includes("INSERT OR IGNORE INTO mission_daily_notes")) {
      const exists = this.state.dailyNotes.some((note) => note.id === values[0]);
      if (!exists) {
        this.state.dailyNotes.push({
          id: values[0] as string,
          user_id: values[1] as string,
          date: values[2] as string,
          title: values[3] as string,
          journal_text: "",
          created_at: values[4] as string,
          updated_at: values[5] as string,
        });
      }
      return { success: true };
    }

    if (sql.includes("INSERT OR IGNORE INTO mission_capture_items")) {
      const exists = this.state.captures.some((capture) => capture.id === values[0]);
      if (!exists) {
        this.state.captures.push({
          id: values[0] as string,
          user_id: values[1] as string,
          day_id: values[2] as string,
          type: values[3] as string,
          text: values[4] as string,
          project_id: values[5] as string | null,
          status: "open",
          task_id: null,
          calendar_event_id: null,
          reminder_id: null,
          due_at: values[6] as string | null,
          event_start_at: values[7] as string | null,
          event_end_at: values[8] as string | null,
          timezone: values[9] as string | null,
          sync_status: "local",
          sync_error: null,
          source: "agent",
          source_ref: values[10] as string,
          created_at: values[11] as string,
          updated_at: values[12] as string,
        });
      }
      return { success: true };
    }

    if (sql.includes("mission_plugin_activity")) {
      const exists = this.state.pluginActivities.some((activity) => activity.id === values[0]);
      if (!exists) {
        this.state.pluginActivities.push({
          id: values[0] as string,
          user_id: values[1] as string,
          plugin_id: "me3.assistant-jobs",
          activity_type: values[2] as string,
          title: values[3] as string,
          summary: values[4] as string | null,
          status: values[5] as string | null,
          related_id: values[6] as string | null,
          metadata_json: values[7] as string,
        });
      }
      return { success: true };
    }

    if (sql.includes("INSERT OR IGNORE INTO assistant_job_ingress_events")) {
      const exists = this.state.ingressEvents.some(
        (event) => event.user_id === values[1] && event.idempotency_key === values[6],
      );
      if (!exists) {
        this.state.ingressEvents.push({
          id: values[0] as string,
          user_id: values[1] as string,
          source_kind: values[2] as string,
          source_id: values[3] as string,
          source_event_id: values[4] as string,
          event_type: values[5] as string,
          idempotency_key: values[6] as string,
          payload_json: values[7] as string,
          raw_payload_ref: values[8] as string | null,
          status: "received",
          created_at: values[9] as string,
          updated_at: values[10] as string,
        });
      }
      return { success: true };
    }

    if (sql.includes("UPDATE assistant_job_ingress_events")) {
      const event = this.findIngressEvent(values[2], values[3]);
      if (event) {
        event.status = values[0] as string;
        event.payload_json = values[1] as string;
        event.updated_at = new Date().toISOString();
      }
      return { success: true };
    }

    if (sql.includes("UPDATE assistant_job_runs")) {
      const run = this.state.runs.find(
        (candidate) => candidate.id === values[6] && candidate.user_id === values[7],
      );
      if (run) {
        run.status = values[0] as string;
        run.started_at = values[1] as string | null;
        run.finished_at = values[2] as string | null;
        run.output_preview = values[3] as string | null;
        run.error_code = values[4] as string | null;
        run.error_message = values[5] as string | null;
        run.updated_at = new Date().toISOString();
      }
      return { success: true };
    }

    if (sql.includes("SET name = ?")) {
      const job = this.findJob(values[4], values[5]);
      if (job) {
        job.name = values[0] as string;
        job.purpose = values[1] as string;
        job.project_id = values[2] as string | null;
        job.status = values[3] as string;
      }
      return { success: true };
    }

    if (sql.includes("SET status = ?")) {
      const job = this.findJob(values[1], values[2]);
      if (job) job.status = values[0] as string;
      return { success: true };
    }

    if (sql.includes("SET status = 'archived'")) {
      const job = this.findJob(values[0], values[1]);
      if (job) {
        job.status = "archived";
        job.archived_at = new Date().toISOString();
      }
      return { success: true };
    }

    if (sql.includes("SET last_run_at = ?")) {
      const job = this.findJob(values[2], values[3]);
      if (job) {
        job.last_run_at = values[0] as string;
        job.last_run_status = values[1] as string;
      }
      return { success: true };
    }

    throw new Error(`Unhandled SQL run: ${sql}`);
  }

  async first<T>() {
    const sql = this.sql;
    const values = this.values;
    if (sql.includes("FROM owner_profile")) {
      return (this.state.owner?.id === values[0] ? this.state.owner : null) as T | null;
    }
    if (sql.includes("FROM assistant_job_ingress_events") && sql.includes("idempotency_key")) {
      return (
        this.state.ingressEvents.find(
          (event) => event.user_id === values[0] && event.idempotency_key === values[1],
        ) || null
      ) as T | null;
    }
    if (sql.includes("FROM assistant_job_ingress_events")) {
      return this.findIngressEvent(values[0], values[1]) as T | null;
    }
    if (sql.includes("FROM assistant_job_action_results")) {
      return (
        this.state.actionResults.find(
          (result) =>
            result.run_id === values[0] &&
            result.action_id === values[1] &&
            result.idempotency_key === values[2],
        ) || null
      ) as T | null;
    }
    if (sql.includes("FROM assistant_jobs") && sql.includes("recipe_id = ?")) {
      return (
        this.state.jobs.find(
          (job) =>
            job.user_id === values[0] &&
            job.recipe_id === values[1] &&
            job.status !== "archived",
        ) || null
      ) as T | null;
    }
    if (sql.includes("FROM assistant_jobs")) {
      return (this.findJob(values[0], values[1]) || null) as T | null;
    }
    if (sql.includes("FROM assistant_job_versions")) {
      return (
        this.state.versions.find(
          (version) => version.id === values[0] && version.user_id === values[1],
        ) || null
      ) as T | null;
    }
    if (sql.includes("FROM assistant_job_runs")) {
      return (
        this.state.runs.find((run) => run.id === values[0] && run.user_id === values[1]) || null
      ) as T | null;
    }
    throw new Error(`Unhandled SQL first: ${sql}`);
  }

  async all<T>() {
    const sql = this.sql;
    const values = this.values;
    if (sql.includes("FROM mission_projects")) {
      return {
        results: this.state.projects.filter(
          (project) => project.user_id === values[0] && project.status !== "archived",
        ) as T[],
      };
    }
    if (sql.includes("FROM mission_tasks")) {
      return {
        results: this.state.tasks.filter(
          (task) =>
            task.user_id === values[0] &&
            task.archived_at == null &&
            task.status !== "done" &&
            task.status !== "cancelled",
        ) as T[],
      };
    }
    if (sql.includes("FROM mission_private_memory")) {
      if (this.state.failMemoryLookup) throw new Error("mission_private_memory unavailable");
      return {
        results: this.state.memory.filter(
          (memory) => memory.user_id === values[0] && memory.review_status === "active",
        ) as T[],
      };
    }
    if (sql.includes("FROM user_calendar_events")) {
      return {
        results: this.state.calendarEvents.filter((event) => event.user_id === values[0]) as T[],
      };
    }
    if (sql.includes("FROM assistant_messages")) {
      return {
        results: this.state.recentMessages.filter((message) => message.owner_id === values[0]) as T[],
      };
    }
    if (sql.includes("FROM assistant_jobs j")) {
      return {
        results: this.state.jobs
          .filter((job) => job.user_id === values[0] && job.status === "active")
          .flatMap((job) => {
            const version = this.state.versions.find(
              (candidate) =>
                candidate.id === job.current_version_id && candidate.user_id === job.user_id,
            );
            if (!version) return [];
            return [
              {
                ...job,
                version_id: version.id,
                version_number: version.version_number,
                version_name: version.name,
                version_purpose: version.purpose,
                candidate_trigger_json: version.trigger_json,
                candidate_scope_json: version.scope_json,
                candidate_rules_json: version.rules_json,
                candidate_actions_json: version.actions_json,
                candidate_approval_policy_json: version.approval_policy_json,
                candidate_destination_json: version.destination_json,
                candidate_capability_ids_json: version.capability_ids_json,
                candidate_permission_summary_json: version.permission_summary_json,
                candidate_recommended_skill_ids_json: version.recommended_skill_ids_json,
                candidate_required_skill_ids_json: version.required_skill_ids_json,
                candidate_validation_status: version.validation_status,
                candidate_validation_errors_json: version.validation_errors_json,
                version_created_at: version.created_at,
              },
            ];
          }) as T[],
      };
    }
    if (sql.includes("FROM assistant_job_ingress_events") && sql.includes("status = ?")) {
      return {
        results: this.state.ingressEvents.filter(
          (event) => event.user_id === values[0] && event.status === values[1],
        ) as T[],
      };
    }
    if (sql.includes("FROM assistant_job_ingress_events")) {
      return {
        results: this.state.ingressEvents.filter((event) => event.user_id === values[0]) as T[],
      };
    }
    if (sql.includes("FROM assistant_jobs") && sql.includes("status = ?")) {
      return {
        results: this.state.jobs.filter(
          (job) => job.user_id === values[0] && job.status === values[1],
        ) as T[],
      };
    }
    if (sql.includes("FROM assistant_jobs")) {
      return {
        results: this.state.jobs.filter(
          (job) => job.user_id === values[0] && job.status !== "archived",
        ) as T[],
      };
    }
    if (sql.includes("FROM assistant_job_runs") && sql.includes("trigger_ref = ?")) {
      return {
        results: this.state.runs.filter(
          (run) =>
            run.user_id === values[0] &&
            run.trigger_kind === "event" &&
            run.trigger_ref === values[1],
        ) as T[],
      };
    }
    if (sql.includes("FROM assistant_job_action_results")) {
      return {
        results: this.state.actionResults.filter((result) => result.run_id === values[0]) as T[],
      };
    }
    if (sql.includes("FROM assistant_job_runs")) {
      return {
        results: this.state.runs.filter(
          (run) => run.user_id === values[0] && run.job_id === values[1],
        ) as T[],
      };
    }
    throw new Error(`Unhandled SQL all: ${sql}`);
  }

  private findJob(id: unknown, userId: unknown) {
    return this.state.jobs.find((job) => job.id === id && job.user_id === userId) || null;
  }

  private findIngressEvent(id: unknown, userId: unknown) {
    return (
      this.state.ingressEvents.find((event) => event.id === id && event.user_id === userId) ||
      null
    );
  }
}
