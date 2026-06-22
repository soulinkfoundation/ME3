import { describe, expect, it } from "vitest";
import {
  createMissionTaskFromJournal,
  deleteJournalProjectLink,
  listMissionTaskPage,
} from "./mission-control";
import type { Env } from "./types";

type StoredTaskRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  column_id: string | null;
  title: string;
  description: string | null;
  status: "backlog" | "in_progress" | "review" | "done" | "cancelled";
  priority: number;
  pinned_at: string | null;
  due_at: string | null;
  scheduled_for: string | null;
  source_kind: "manual" | "capture" | "agent" | "beads" | "daemon";
  source_ref: string | null;
  approval_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

function taskRow(
  id: string,
  projectId: string,
  priority: number,
  sortDate: string,
): StoredTaskRow {
  return {
    id,
    user_id: "owner",
    project_id: projectId,
    column_id: `${projectId}:backlog`,
    title: `Task ${id}`,
    description: null,
    status: "backlog",
    priority,
    pinned_at: null,
    due_at: null,
    scheduled_for: sortDate,
    source_kind: "manual",
    source_ref: null,
    approval_id: null,
    metadata_json: "{}",
    created_at: `${sortDate}T09:00:00Z`,
    updated_at: `${sortDate}T09:00:00Z`,
    archived_at: null,
  };
}

function archivedTaskRow(
  id: string,
  projectId: string,
  archivedAt: string,
  updatedAt: string,
): StoredTaskRow {
  return {
    ...taskRow(id, projectId, 3, updatedAt.slice(0, 10)),
    status: "done",
    updated_at: updatedAt,
    archived_at: archivedAt,
  };
}

function createTaskEnv(rows: StoredTaskRow[]) {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async all<T>() {
              let valueIndex = 0;
              const userId = values[valueIndex++] as string;
              let results = rows.filter((row) => row.user_id === userId);

              const archivedQuery = sql.includes("archived_at IS NOT NULL");
              if (archivedQuery) {
                results = results.filter((row) => row.archived_at !== null);
              } else {
                results = results.filter((row) => row.archived_at === null);
              }

              if (sql.includes("project_id = ?")) {
                const projectId = values[valueIndex++] as string;
                results = results.filter((row) => row.project_id === projectId);
              }

              if (sql.includes("COALESCE(pinned_at, '') < ?")) {
                const pinnedRank = Number(values[valueIndex]);
                const pinnedAt = String(values[valueIndex + 2]);
                const priority = Number(values[valueIndex + 5]);
                const sortValue = String(values[valueIndex + 9]);
                const id = String(values[valueIndex + 14]);
                valueIndex += 15;
                results = results.filter((row) => {
                  const rowPinnedRank = row.pinned_at ? 0 : 1;
                  const rowPinnedAt = row.pinned_at || "";
                  const rowSortValue = row.due_at || row.scheduled_for || row.created_at;
                  return (
                    rowPinnedRank > pinnedRank ||
                    (rowPinnedRank === pinnedRank && rowPinnedAt < pinnedAt) ||
                    (rowPinnedRank === pinnedRank &&
                      rowPinnedAt === pinnedAt &&
                      row.priority > priority) ||
                    (rowPinnedRank === pinnedRank &&
                      rowPinnedAt === pinnedAt &&
                      row.priority === priority &&
                      rowSortValue > sortValue) ||
                    (rowPinnedRank === pinnedRank &&
                      rowPinnedAt === pinnedAt &&
                      row.priority === priority &&
                      rowSortValue === sortValue &&
                      row.id > id)
                  );
                });
              }

              if (sql.includes("archived_at < ?")) {
                const archivedAt = String(values[valueIndex]);
                const updatedAt = String(values[valueIndex + 2]);
                const id = String(values[valueIndex + 5]);
                valueIndex += 6;
                results = results.filter((row) => {
                  const rowArchivedAt = row.archived_at || row.updated_at;
                  return (
                    rowArchivedAt < archivedAt ||
                    (rowArchivedAt === archivedAt && row.updated_at < updatedAt) ||
                    (rowArchivedAt === archivedAt && row.updated_at === updatedAt && row.id > id)
                  );
                });
              }

              const limit = Number(values[values.length - 1]);
              results = results.sort((a, b) => {
                if (archivedQuery) {
                  const archivedDelta = (b.archived_at || b.updated_at).localeCompare(
                    a.archived_at || a.updated_at,
                  );
                  if (archivedDelta !== 0) return archivedDelta;
                  const updatedDelta = b.updated_at.localeCompare(a.updated_at);
                  if (updatedDelta !== 0) return updatedDelta;
                  return a.id.localeCompare(b.id);
                }
                const aPinnedRank = a.pinned_at ? 0 : 1;
                const bPinnedRank = b.pinned_at ? 0 : 1;
                const pinnedRankDelta = aPinnedRank - bPinnedRank;
                if (pinnedRankDelta !== 0) return pinnedRankDelta;
                const pinnedAtDelta = (b.pinned_at || "").localeCompare(
                  a.pinned_at || "",
                );
                if (pinnedAtDelta !== 0) return pinnedAtDelta;
                const priorityDelta = a.priority - b.priority;
                if (priorityDelta !== 0) return priorityDelta;
                const aSort = a.due_at || a.scheduled_for || a.created_at;
                const bSort = b.due_at || b.scheduled_for || b.created_at;
                const sortDelta = aSort.localeCompare(bSort);
                if (sortDelta !== 0) return sortDelta;
                return a.id.localeCompare(b.id);
              });

              return { results: results.slice(0, limit) as T[] };
            },
          };
        },
      };
    },
  };

  return { DB: db } as unknown as Env;
}

describe("Mission Control task pagination", () => {
  it("pages active tasks within the selected project", async () => {
    const env = createTaskEnv([
      taskRow("task-c", "project-1", 2, "2026-05-03"),
      taskRow("task-a", "project-1", 1, "2026-05-01"),
      taskRow("task-b", "project-1", 2, "2026-05-02"),
      taskRow("task-other", "project-2", 1, "2026-05-01"),
    ]);

    const firstPage = await listMissionTaskPage(env, "owner", {
      projectId: "project-1",
      limit: 2,
    });

    expect(firstPage.tasks.map((task) => task.id)).toEqual(["task-a", "task-b"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.limit).toBe(2);

    const secondPage = await listMissionTaskPage(env, "owner", {
      projectId: "project-1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.tasks.map((task) => task.id)).toEqual(["task-c"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("pages archived project tasks newest first", async () => {
    const env = createTaskEnv([
      archivedTaskRow(
        "old",
        "project-1",
        "2026-05-01T09:00:00Z",
        "2026-05-01T09:00:00Z",
      ),
      archivedTaskRow(
        "new",
        "project-1",
        "2026-05-03T09:00:00Z",
        "2026-05-03T09:00:00Z",
      ),
      archivedTaskRow(
        "other",
        "project-2",
        "2026-05-04T09:00:00Z",
        "2026-05-04T09:00:00Z",
      ),
    ]);

    const firstPage = await listMissionTaskPage(env, "owner", {
      archived: true,
      projectId: "project-1",
      limit: 1,
    });

    expect(firstPage.tasks.map((task) => task.id)).toEqual(["new"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await listMissionTaskPage(env, "owner", {
      archived: true,
      projectId: "project-1",
      limit: 1,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.tasks.map((task) => task.id)).toEqual(["old"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("orders pinned active tasks before regular tasks across projects", async () => {
    const pinnedOlder = taskRow("pinned-older", "project-1", 3, "2026-05-03");
    pinnedOlder.pinned_at = "2026-05-03T10:00:00Z";
    const pinnedNewer = taskRow("pinned-newer", "project-2", 3, "2026-05-04");
    pinnedNewer.pinned_at = "2026-05-04T10:00:00Z";
    const env = createTaskEnv([
      taskRow("regular", "project-1", 1, "2026-05-01"),
      pinnedOlder,
      pinnedNewer,
    ]);

    const page = await listMissionTaskPage(env, "owner", {
      activeOnly: true,
      limit: 3,
    });

    expect(page.tasks.map((task) => task.id)).toEqual([
      "pinned-newer",
      "pinned-older",
      "regular",
    ]);
  });

  it("rejects invalid task cursors", async () => {
    const env = createTaskEnv([]);

    await expect(
      listMissionTaskPage(env, "owner", { cursor: "not-a-valid-cursor" }),
    ).rejects.toThrow("Task cursor is invalid");
  });

  it("creates a task with a journal source link", async () => {
    const tasks: StoredTaskRow[] = [];
    const links: Array<{
      id: string;
      user_id: string;
      journal_entry_id: string;
      project_id: string;
      source_text: string | null;
      created_task_id: string | null;
      created_reminder_id: string | null;
      created_at: string;
    }> = [];
    const project = {
      id: "project-1",
      user_id: "owner",
      name: "ME3",
      slug: "me3",
      description: null,
      status: "active",
      color: null,
      icon: null,
      source_kind: "manual",
      source_ref: null,
      metadata_json: "{}",
      created_at: "2026-06-21T09:00:00Z",
      updated_at: "2026-06-21T09:00:00Z",
    };
    const columns = [
      {
        id: "project-1:backlog",
        user_id: "owner",
        project_id: "project-1",
        name: "Backlog",
        status: "backlog",
        position: 0,
        archived_at: null,
        created_at: "2026-06-21T09:00:00Z",
        updated_at: "2026-06-21T09:00:00Z",
      },
    ];
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind(...values: unknown[]) {
              return {
                async first<T>() {
                  if (sql.includes("FROM journal_entries")) {
                    return { id: "journal-1" } as T;
                  }
                  if (sql.includes("FROM mission_projects")) {
                    return project as T;
                  }
                  if (sql.includes("FROM mission_tasks")) {
                    const [taskId] = values;
                    return tasks.find((task) => task.id === taskId) as T;
                  }
                  if (sql.includes("FROM journal_project_links")) {
                    const [linkId] = values;
                    const link = links.find((item) => item.id === linkId);
                    return {
                      ...link,
                      entry_date: "2026-06-21",
                      entry_title: "Today",
                      task_title: tasks.find((task) => task.id === link?.created_task_id)
                        ?.title || null,
                    } as T;
                  }
                  return null as T;
                },
                async all<T>() {
                  if (sql.includes("FROM mission_project_columns")) {
                    return { results: columns as T[] };
                  }
                  return { results: [] as T[] };
                },
                async run() {
                  if (sql.includes("INSERT INTO mission_tasks")) {
                    const [
                      id,
                      userId,
                      projectId,
                      columnId,
                      title,
                      description,
                      sourceRef,
                      metadataJson,
                    ] = values as string[];
                    tasks.push({
                      id,
                      user_id: userId,
                      project_id: projectId,
                      column_id: columnId,
                      title,
                      description: description || null,
                      status: "backlog",
                      priority: 3,
                      pinned_at: null,
                      due_at: null,
                      scheduled_for: null,
                      source_kind: "capture",
                      source_ref: sourceRef,
                      approval_id: null,
                      metadata_json: metadataJson,
                      created_at: "2026-06-21T10:00:00Z",
                      updated_at: "2026-06-21T10:00:00Z",
                      archived_at: null,
                    });
                  }
                  if (sql.includes("INSERT INTO journal_project_links")) {
                    const [id, userId, journalEntryId, projectId, sourceText, taskId] =
                      values as string[];
                    links.push({
                      id,
                      user_id: userId,
                      journal_entry_id: journalEntryId,
                      project_id: projectId,
                      source_text: sourceText,
                      created_task_id: taskId,
                      created_reminder_id: null,
                      created_at: "2026-06-21T10:00:00Z",
                    });
                  }
                  return {};
                },
              };
            },
          };
        },
      },
    } as unknown as Env;

    const result = await createMissionTaskFromJournal(env, "owner", {
      journalEntryId: "journal-1",
      projectId: "project-1",
      sourceText: "Follow up on markdown import",
    });

    expect(result.task).toMatchObject({
      projectId: "project-1",
      sourceKind: "capture",
      sourceRef: "journal-1",
      title: "Follow up on markdown import",
      metadata: {
        journalSource: {
          journalEntryId: "journal-1",
          quote: "Follow up on markdown import",
        },
      },
    });
    expect(result.link).toMatchObject({
      journalEntryId: "journal-1",
      projectId: "project-1",
      createdTaskId: result.task.id,
    });
  });

  it("deletes a journal project link without touching tasks", async () => {
    const links = [{ id: "link-1", user_id: "owner" }];
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind(...values: unknown[]) {
              return {
                async run() {
                  if (!sql.includes("DELETE FROM journal_project_links")) {
                    return { meta: { changes: 0 } };
                  }
                  const [linkId, userId] = values;
                  const index = links.findIndex(
                    (link) => link.id === linkId && link.user_id === userId,
                  );
                  if (index < 0) return { meta: { changes: 0 } };
                  links.splice(index, 1);
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
    } as unknown as Env;

    await expect(deleteJournalProjectLink(env, "owner", "link-1")).resolves.toEqual({
      ok: true,
    });
    expect(links).toEqual([]);
    await expect(
      deleteJournalProjectLink(env, "owner", "missing"),
    ).rejects.toThrow("Journal link not found");
  });
});
