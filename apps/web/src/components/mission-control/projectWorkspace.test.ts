import { describe, expect, it } from "vitest";
import { projectTaskViewModeFromPreference } from "./projectWorkspace";

describe("projectTaskViewModeFromPreference", () => {
  it("defaults desktop users to board without overriding explicit choices", () => {
    expect(projectTaskViewModeFromPreference(null, true)).toBe("kanban");
    expect(projectTaskViewModeFromPreference(null, false)).toBe("list");
    expect(projectTaskViewModeFromPreference("0", true)).toBe("list");
    expect(projectTaskViewModeFromPreference("1", false)).toBe("kanban");
  });
});
