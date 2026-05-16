import { describe, expect, it } from "vitest";
import {
  approveMissionMemory,
  createMissionMemory,
  deleteMissionMemory,
  listMissionMemory,
  suggestMissionMemory,
} from "./mission-control";
import type { Env } from "./types";

type StoredMemoryRow = {
  id: string;
  user_id: string;
  memory_kind: string;
  scope_kind: string;
  scope_id: string | null;
  title: string | null;
  body: string;
  confidence: number;
  source_kind: string;
  source_ref: string | null;
  review_status: "active" | "needs_review" | "archived";
  created_at: string;
  updated_at: string;
};

function createMemoryEnv() {
  const rows: StoredMemoryRow[] = [];
  let tick = 0;
  const nextDate = () => new Date(Date.UTC(2026, 4, 16, 12, tick++)).toISOString();

  const db = {
    prepare(sql: string) {
      const runStatement = (values: unknown[]) => ({
        async all<T>() {
          if (sql.includes("FROM mission_private_memory")) {
            const [userId, limit] = values;
            const results = rows
              .filter((row) => row.user_id === userId && row.review_status !== "archived")
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .slice(0, Number(limit || 50));
            return { results: results as T[] };
          }
          return { results: [] as T[] };
        },
        async first<T>() {
          if (sql.includes("FROM mission_private_memory")) {
            const [id, userId] = values;
            return (rows.find((row) => row.id === id && row.user_id === userId) as T) || null;
          }
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO mission_private_memory")) {
            const [
              id,
              userId,
              memoryKind,
              scopeKind,
              scopeId,
              title,
              body,
              confidence,
              sourceKind,
              sourceRef,
              reviewStatus,
            ] = values;
            const createdAt = nextDate();
            rows.push({
              id: id as string,
              user_id: userId as string,
              memory_kind: memoryKind as string,
              scope_kind: scopeKind as string,
              scope_id: (scopeId as string | null) || null,
              title: (title as string | null) || null,
              body: body as string,
              confidence: confidence as number,
              source_kind: sourceKind as string,
              source_ref: (sourceRef as string | null) || null,
              review_status: reviewStatus as StoredMemoryRow["review_status"],
              created_at: createdAt,
              updated_at: createdAt,
            });
            return { meta: { changes: 1 } };
          }

          if (sql.includes("SET title = ?, body = ?, review_status = ?")) {
            const [title, body, reviewStatus, id, userId] = values;
            const row = rows.find(
              (entry) =>
                entry.id === id &&
                entry.user_id === userId &&
                entry.review_status !== "archived",
            );
            if (!row) return { meta: { changes: 0 } };
            row.title = (title as string | null) || null;
            row.body = body as string;
            row.review_status = reviewStatus as StoredMemoryRow["review_status"];
            row.updated_at = nextDate();
            return { meta: { changes: 1 } };
          }

          if (sql.includes("SET review_status = 'active'")) {
            const [id, userId] = values;
            const row = rows.find(
              (entry) =>
                entry.id === id &&
                entry.user_id === userId &&
                entry.review_status !== "archived",
            );
            if (!row) return { meta: { changes: 0 } };
            row.review_status = "active";
            row.updated_at = nextDate();
            return { meta: { changes: 1 } };
          }

          if (sql.includes("SET review_status = 'archived'")) {
            const [id, userId] = values;
            const row = rows.find((entry) => entry.id === id && entry.user_id === userId);
            if (!row) return { meta: { changes: 0 } };
            row.review_status = "archived";
            row.updated_at = nextDate();
            return { meta: { changes: 1 } };
          }

          return { meta: { changes: 0 } };
        },
      });

      return {
        bind(...values: unknown[]) {
          return runStatement(values);
        },
        all<T>() {
          return runStatement([]).all<T>();
        },
        first<T>() {
          return runStatement([]).first<T>();
        },
      };
    },
  };

  return {
    env: { DB: db } as unknown as Env,
    rows,
  };
}

describe("Mission Control memory review flows", () => {
  it("stores owner-created memory as active manual memory", async () => {
    const { env } = createMemoryEnv();

    const result = await createMissionMemory(env, "owner", {
      body: "Prefers concise progress updates.",
      memoryKind: "preference",
      sourceRef: "owner-note",
    });

    expect(result.memory).toMatchObject({
      body: "Prefers concise progress updates.",
      memoryKind: "preference",
      reviewStatus: "active",
      sourceKind: "manual",
      sourceRef: "owner-note",
    });
  });

  it("keeps agent-proposed memory in review even when active is requested", async () => {
    const { env } = createMemoryEnv();

    const result = await createMissionMemory(env, "owner", {
      body: "Likes Friday launch reviews.",
      memoryKind: "learning",
      sourceKind: "agent",
      sourceRef: "agent-run-123",
      reviewStatus: "active",
    });

    expect(result.memory).toMatchObject({
      body: "Likes Friday launch reviews.",
      reviewStatus: "needs_review",
      sourceKind: "agent",
      sourceRef: "agent-run-123",
    });
  });

  it("approves suggestions and excludes archived memory from future lists", async () => {
    const { env } = createMemoryEnv();

    const proposed = await suggestMissionMemory(env, "owner", {
      body: "Ask before changing public profile data.",
      memoryKind: "preference",
      sourceRef: "chat:turn-1",
    });

    expect(proposed.memory.reviewStatus).toBe("needs_review");

    const approved = await approveMissionMemory(env, "owner", proposed.memory.id);
    expect(approved.memory).toMatchObject({
      reviewStatus: "active",
      sourceKind: "agent",
      sourceRef: "chat:turn-1",
    });

    expect(await listMissionMemory(env, "owner")).toHaveLength(1);

    await deleteMissionMemory(env, "owner", proposed.memory.id);

    expect(await listMissionMemory(env, "owner")).toEqual([]);
  });
});
