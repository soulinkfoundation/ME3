import { describe, expect, it } from "vitest";
import {
  getMailboxDraftDeliveryStatus,
  MAILBOX_DELIVERY_UNKNOWN_AFTER_MS,
  markMailboxDraftSentByOwner,
  prepareMailboxDraftRetryAnyway,
} from "./mailbox-delivery";

describe("mailbox delivery recovery", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("keeps a recent approved draft sending and makes a stale one explicitly resolvable", async () => {
    const fresh = deliveryDb({
      message_kind: "draft",
      status: "approved",
      approved_at: new Date(now.getTime() - MAILBOX_DELIVERY_UNKNOWN_AFTER_MS + 1).toISOString(),
    });
    await expect(
      getMailboxDraftDeliveryStatus({ DB: fresh.db } as never, "owner", "draft-1", now),
    ).resolves.toMatchObject({
      state: "sending",
      canMarkSent: false,
      canRetryAnyway: false,
    });
    expect(fresh.runCalls).toBe(0);

    const stale = deliveryDb({
      message_kind: "draft",
      status: "approved",
      approved_at: new Date(now.getTime() - MAILBOX_DELIVERY_UNKNOWN_AFTER_MS).toISOString(),
    });
    await expect(
      getMailboxDraftDeliveryStatus({ DB: stale.db } as never, "owner", "draft-1", now),
    ).resolves.toMatchObject({
      state: "delivery_unknown",
      canMarkSent: true,
      canRetryAnyway: true,
    });
    expect(stale.runCalls).toBe(0);
  });

  it("marks an unknown delivery sent without letting an earlier attempt block it", async () => {
    const fake = deliveryDb({}, 1);
    await expect(
      markMailboxDraftSentByOwner({ DB: fake.db } as never, "owner", "draft-1", now),
    ).resolves.toEqual({ ok: true, id: "draft-1", sentAt: now.toISOString() });

    expect(fake.runCalls).toBe(1);
    expect(fake.calls.at(-1)?.sql).toContain("provider_id = COALESCE(provider_id, 'owner-confirmed')");
    expect(fake.calls.at(-1)?.sql).toContain("NOT EXISTS");
    expect(fake.calls.at(-1)?.sql).toContain(
      "a.requested_at >= COALESCE(\n             mailbox_messages.approved_at",
    );
    expect(fake.calls.at(-1)?.values).toEqual([
      now.toISOString(),
      now.toISOString(),
      "draft-1",
      "owner",
      "2026-07-16T11:55:00.000Z",
      "owner",
    ]);
  });

  it("allows retry-anyway past earlier audits and rejects current-attempt races", async () => {
    const retry = deliveryDb({}, 1);
    await expect(
      prepareMailboxDraftRetryAnyway({ DB: retry.db } as never, "owner", "draft-1", now),
    ).resolves.toEqual({ ok: true });
    expect(retry.calls.at(-1)?.sql).toContain("Owner chose Retry anyway");
    expect(retry.calls.at(-1)?.sql).toContain("NOT EXISTS");
    expect(retry.calls.at(-1)?.sql).toContain(
      "a.requested_at >= COALESCE(\n             mailbox_messages.approved_at",
    );

    const raced = deliveryDb({}, 0);
    await expect(
      prepareMailboxDraftRetryAnyway({ DB: raced.db } as never, "owner", "draft-1", now),
    ).resolves.toEqual({
      error: "Draft delivery is not awaiting confirmation",
      status: 409,
    });
  });
});

function deliveryDb(
  overrides: Partial<{
    id: string;
    message_kind: "email" | "draft" | "system";
    status: string;
    approved_at: string | null;
    updated_at: string;
    created_at: string;
  }> = {},
  changes = 0,
) {
  const row = {
    id: "draft-1",
    message_kind: "draft" as const,
    status: "approved",
    approved_at: "2026-07-16T11:50:00.000Z",
    updated_at: "2026-07-16T11:50:00.000Z",
    created_at: "2026-07-16T11:45:00.000Z",
    ...overrides,
  };
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  let runCalls = 0;
  return {
    calls,
    get runCalls() {
      return runCalls;
    },
    db: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            calls.push({ sql, values });
            return {
              async first() {
                return row;
              },
              async run() {
                runCalls += 1;
                return { meta: { changes } };
              },
            };
          },
        };
      },
    } as D1Database,
  };
}
