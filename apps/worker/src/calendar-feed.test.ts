import { describe, expect, it } from "vitest";
import { listCalendarMissionTasks } from "./calendar-feed";
import type { Env } from "./types";

type TestTaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  due_at: string | null;
  scheduled_for: string | null;
  source_kind: string;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  project_icon: string | null;
};

describe("calendar task feed", () => {
  it("returns dated project tasks with project display data", async () => {
    const env = createEnv({
      tasks: [
        taskRow({
          id: "task-scheduled",
          title: "Launch checklist",
          scheduled_for: "2026-06-15",
        }),
        taskRow({
          id: "task-due",
          title: "Send invoice",
          scheduled_for: null,
          due_at: "2026-06-20T09:30:00.000Z",
        }),
        taskRow({
          id: "task-outside",
          title: "Next month",
          scheduled_for: "2026-07-03",
        }),
        taskRow({
          id: "task-done",
          title: "Done task",
          status: "done",
          scheduled_for: "2026-06-16",
        }),
        taskRow({
          id: "task-archived",
          title: "Archived task",
          scheduled_for: "2026-06-17",
          archived_at: "2026-06-18T10:00:00.000Z",
        }),
      ],
    });

    const tasks = await listCalendarMissionTasks(env, "owner", {
      start: "2026-06-01T00:00:00.000Z",
      end: "2026-07-01T00:00:00.000Z",
    });

    expect(tasks.map((task) => task.id).sort()).toEqual([
      "task-archived",
      "task-done",
      "task-due",
      "task-scheduled",
    ]);
    expect(tasks.find((task) => task.id === "task-scheduled")).toMatchObject({
      id: "task-scheduled",
      title: "Launch checklist",
      scheduledFor: "2026-06-15",
      dueAt: null,
      startsAt: "2026-06-15T00:00:00.000Z",
      endsAt: "2026-06-16T00:00:00.000Z",
      allDay: true,
      dateSource: "scheduled_for",
      projectId: "project-1",
      projectName: "ME3",
      projectColor: "#26806f",
      projectIcon: "CircleCheck",
    });
    expect(tasks.find((task) => task.id === "task-due")).toMatchObject({
      id: "task-due",
      startsAt: "2026-06-20T09:30:00.000Z",
      endsAt: "2026-06-20T09:30:00.000Z",
      allDay: false,
      dateSource: "due_at",
    });
    expect(tasks.find((task) => task.id === "task-done")).toMatchObject({
      id: "task-done",
      status: "done",
    });
    expect(tasks.find((task) => task.id === "task-archived")).toMatchObject({
      id: "task-archived",
      archivedAt: "2026-06-18T10:00:00.000Z",
    });
  });

  it("serializes date-only tasks in the owner timezone", async () => {
    const env = createEnv({
      timezone: "Europe/Dublin",
      tasks: [
        taskRow({
          id: "task-dublin",
          scheduled_for: "2026-06-15",
        }),
      ],
    });

    const tasks = await listCalendarMissionTasks(env, "owner", {
      start: "2026-05-31T23:00:00.000Z",
      end: "2026-06-30T23:00:00.000Z",
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "task-dublin",
      timezone: "Europe/Dublin",
      startsAt: "2026-06-14T23:00:00.000Z",
      endsAt: "2026-06-15T23:00:00.000Z",
      allDay: true,
    });
  });

  it("shows date-only due tasks on their due date", async () => {
    const env = createEnv({
      timezone: "Europe/Dublin",
      tasks: [
        taskRow({
          id: "task-due-date",
          scheduled_for: null,
          due_at: "2026-07-29",
        }),
      ],
    });

    const tasks = await listCalendarMissionTasks(env, "owner", {
      start: "2026-06-28T23:00:00.000Z",
      end: "2026-08-02T23:00:00.000Z",
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "task-due-date",
      dueAt: "2026-07-29",
      startsAt: "2026-07-28T23:00:00.000Z",
      endsAt: "2026-07-29T23:00:00.000Z",
      allDay: true,
      dateSource: "due_at",
    });
  });

  it("prefers the due date when a task also has a scheduled date", async () => {
    const env = createEnv({
      tasks: [
        taskRow({
          id: "task-due-over-scheduled",
          scheduled_for: "2026-08-15",
          due_at: "2026-07-29",
        }),
      ],
    });

    const tasks = await listCalendarMissionTasks(env, "owner", {
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "task-due-over-scheduled",
      startsAt: "2026-07-29T00:00:00.000Z",
      endsAt: "2026-07-30T00:00:00.000Z",
      dateSource: "due_at",
    });
  });
});

function createEnv(input: {
  timezone?: string | null;
  tasks: TestTaskRow[];
}): Env {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first<T>() {
                if (sql.includes("FROM owner_profile")) {
                  return { timezone: input.timezone ?? "UTC" } as T;
                }
                return null as T | null;
              },
              async all<T>() {
                return { results: input.tasks as T[] };
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
}

function taskRow(overrides: Partial<TestTaskRow> = {}): TestTaskRow {
  return {
    id: "task-1",
    title: "Task",
    description: null,
    status: "backlog",
    priority: 3,
    due_at: null,
    scheduled_for: "2026-06-15",
    source_kind: "manual",
    source_ref: null,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    archived_at: null,
    project_id: "project-1",
    project_name: "ME3",
    project_color: "#26806f",
    project_icon: "CircleCheck",
    ...overrides,
  };
}
