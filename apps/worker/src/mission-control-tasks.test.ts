import { describe, expect, it } from "vitest";
import { listMissionTaskPage } from "./mission-control";
import type { Env } from "./types";

type StoredTaskRow = {
  id: string;
  user_id: string;
  project_id: string | null;
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
});
