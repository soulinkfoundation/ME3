import { describe, expect, it } from "vitest";
import {
  listLatestSiteBuilderThreads,
  siteUsernamesFromMetadata,
} from "./site-builder-threads";

describe("site builder thread lookup", () => {
  it("reads site records from assistant action-card metadata", () => {
    expect(siteUsernamesFromMetadata(JSON.stringify({
      actionCards: [
        { records: [{ kind: "site", id: "studio" }, { kind: "landing_page", id: "page-1" }] },
      ],
    }))).toEqual(["studio"]);
    expect(siteUsernamesFromMetadata("not json")).toEqual([]);
  });

  it("keeps the newest non-deleted builder thread for each requested site", async () => {
    const rows = [
      row("new-thread", "studio"),
      row("community-thread", "community"),
      row("old-thread", "studio"),
    ];
    let preparedSql = "";
    let boundOwner = "";
    const db = {
      prepare(sql: string) {
        preparedSql = sql;
        return {
          bind(ownerId: unknown) {
            boundOwner = String(ownerId);
            return {
              async all<T>() {
                return { results: rows as T[] };
              },
            };
          },
        };
      },
    };

    const result = await listLatestSiteBuilderThreads(
      db,
      "owner",
      ["studio", "community"],
    );

    expect([...result]).toEqual([
      ["studio", "new-thread"],
      ["community", "community-thread"],
    ]);
    expect(boundOwner).toBe("owner");
    expect(preparedSql).toContain("threads.status != 'deleted'");
  });
});

function row(threadId: string, username: string) {
  return {
    thread_id: threadId,
    metadata_json: JSON.stringify({
      actionCards: [{ records: [{ kind: "site", id: username }] }],
    }),
  };
}
