import { describe, expect, it } from "vitest";
import {
  archiveAssistantJob,
  createAssistantJob,
  duplicateAssistantJob,
  getAssistantJob,
  listAssistantJobIngressEvents,
  listAssistantJobs,
  recordAssistantJobIngressEvent,
  runAssistantJobNow,
  setAssistantJobPaused,
  updateAssistantJobIngressEvent,
} from "./assistant-jobs";
import type { Env } from "./types";

type JobRow = Record<string, unknown> & { id: string; user_id: string; status: string };
type VersionRow = Record<string, unknown> & { id: string; job_id: string; user_id: string };
type RunRow = Record<string, unknown> & { id: string; job_id: string; user_id: string };
type IngressRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  idempotency_key: string;
  status: string;
};

type AssistantJobsDbState = {
  jobs: JobRow[];
  versions: VersionRow[];
  runs: RunRow[];
  events: Record<string, unknown>[];
  ingressEvents: IngressRow[];
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
    expect(run.run.status).toBe("queued");
    expect(run.execution).toBe("not_started");

    await archiveAssistantJob(env, "owner", created.job.id);
    const afterArchive = await listAssistantJobs(env, "owner");
    expect(afterArchive.jobs.map((job) => job.id)).not.toContain(created.job.id);
  });

  it("creates blocked run records for setup-gated jobs", async () => {
    const env = createAssistantJobsEnv();

    const created = await createAssistantJob(env, "owner", { recipeId: "email-watch" });
    expect(created.job.status).toBe("needs_setup");

    const run = await runAssistantJobNow(env, "owner", created.job.id);
    expect(run.run.status).toBe("blocked");
    expect(run.validation.status).toBe("needs_setup");
  });

  it("records assistant job ingress events idempotently", async () => {
    const env = createAssistantJobsEnv();
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
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.event.id).toBe(first.event.id);
    expect(listed.events).toHaveLength(1);
    expect(listed.events[0]?.payload).toEqual({ projectId: "project-1", title: "Weekly packet" });
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
});

function createAssistantJobsEnv(): Env {
  const state: AssistantJobsDbState = {
    jobs: [],
    versions: [],
    runs: [],
    events: [],
    ingressEvents: [],
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

  return { DB: db as unknown as D1Database };
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
        trigger_kind: "manual",
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
