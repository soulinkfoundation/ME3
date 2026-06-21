import { describe, expect, it } from "vitest";
import { parseJournalTaskMarkers } from "./journalOrganize";

const projects = [
  { id: "project-me3", name: "ME3", slug: "me3" },
  { id: "project-soulink", name: "Soulink", slug: "soulink" },
];

describe("parseJournalTaskMarkers", () => {
  it("turns #task lines into project task suggestions", () => {
    expect(
      parseJournalTaskMarkers(
        [
          "Follow up on markdown import #task @me3",
          "- Explore onboarding preview #task @soulink",
          "Keep as a note @me3",
        ].join("\n"),
        projects,
      ),
    ).toEqual([
      {
        id: "task-0",
        title: "Follow up on markdown import",
        sourceText: "Follow up on markdown import #task @me3",
        projectId: "project-me3",
        projectName: "ME3",
      },
      {
        id: "task-1",
        title: "Explore onboarding preview",
        sourceText: "- Explore onboarding preview #task @soulink",
        projectId: "project-soulink",
        projectName: "Soulink",
      },
    ]);
  });

  it("uses the first project when no project marker is present", () => {
    expect(parseJournalTaskMarkers("Renew domain #task", projects)).toMatchObject([
      { title: "Renew domain", projectId: "project-me3" },
    ]);
  });
});
