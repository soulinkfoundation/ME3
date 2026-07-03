import { describe, expect, it } from "vitest";
import {
  projectTaskViewModeFromPreference,
  reorderProjectBoardColumnTasks,
} from "./projectWorkspace";
import type { MissionTask } from "./projectWorkspace";

describe("projectTaskViewModeFromPreference", () => {
  it("defaults desktop users to board without overriding explicit choices", () => {
    expect(projectTaskViewModeFromPreference(null, true)).toBe("kanban");
    expect(projectTaskViewModeFromPreference(null, false)).toBe("list");
    expect(projectTaskViewModeFromPreference("0", true)).toBe("list");
    expect(projectTaskViewModeFromPreference("1", false)).toBe("kanban");
  });
});

function task(id: string, position = 0): MissionTask {
  return {
    id,
    title: id,
    description: null,
    status: "backlog",
    columnId: "project:backlog",
    projectId: "project",
    dueAt: null,
    scheduledFor: null,
    sourceKind: "manual",
    sourceRef: null,
    priority: 3,
    position,
    pinnedAt: null,
    createdAt: `2026-07-03T10:0${position || 0}:00Z`,
    updatedAt: `2026-07-03T10:0${position || 0}:00Z`,
    archivedAt: null,
    metadata: {},
  };
}

describe("reorderProjectBoardColumnTasks", () => {
  it("moves a dragged task around the visible column and resequences positions", () => {
    const one = task("one");
    const two = task("two");
    const three = task("three");

    const reordered = reorderProjectBoardColumnTasks(
      [one, two, three],
      one,
      three,
      "after",
    );

    expect(reordered.map((item) => item.id)).toEqual(["two", "three", "one"]);
    expect(reordered.map((item) => item.position)).toEqual([1000, 2000, 3000]);
  });
});
