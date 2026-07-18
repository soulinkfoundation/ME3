import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SocialPostingPlanInputError,
  blockPostingPlanItem,
  claimPostingPlanForConfirmation,
  confirmPostingPlan,
  createPostVersionPublication,
  createPostingPlan,
  finishPostingPlanConfirmation,
  getPostingPlan,
  getPreferredPostingTimes,
  linkPostingPlanItemPublication,
  reschedulePublication,
  reservePostingPlanItem,
  searchPostLibrary,
  updatePreferredPostingTimes,
  updateSocialPost,
} from "@me3-core/plugin-social-publishing";

describe("Post library and Posting plans", () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.close();
    vi.useRealTimers();
  });

  it("searches Source, Post, platform, account, state, tags, and published dates", async () => {
    seedPost(fixture.db, {
      postId: "post-launch",
      versionId: "version-launch",
      sourceTitle: "Resilient launch notes",
      sourceRef: "journal:launch",
      bodyText: "Small reliable releases compound.",
      tags: ["launch", "ai"],
    });
    seedPublication(fixture.db, {
      id: "publication-launch",
      versionId: "version-launch",
      scheduledFor: null,
      status: "published",
      publishedAt: "2026-06-20T09:00:00.000Z",
    });
    seedPost(fixture.db, {
      postId: "post-draft",
      versionId: "version-draft",
      sourceTitle: "Draft note",
      sourceRef: "journal:draft",
      bodyText: "Unapproved work",
      tags: ["draft"],
      approvalStatus: "draft",
      platform: "x",
      accountId: "account-x",
    });

    const found = await searchPostLibrary(fixture.env, "owner", {
      query: "reliable",
      source: "launch",
      platform: "linkedin",
      accountId: "account-1",
      approvalStatus: "approved",
      deliveryState: "published",
      tag: "launch",
      publishedFrom: "2026-06-01T00:00:00.000Z",
      publishedTo: "2026-07-01T00:00:00.000Z",
    });
    expect(found).toEqual([
      expect.objectContaining({
        postId: "post-launch",
        versionId: "version-launch",
        sourceTitle: "Resilient launch notes",
        tags: ["launch", "ai"],
        publishedCount: 1,
        eligibleForPostingPlan: true,
      }),
    ]);
    await expect(
      searchPostLibrary(fixture.env, "another-owner", { query: "reliable" }),
    ).resolves.toEqual([]);
    await expect(
      searchPostLibrary(fixture.env, "owner", { platform: "x", approvalStatus: "draft" }),
    ).resolves.toEqual([
      expect.objectContaining({ versionId: "version-draft", eligibleForPostingPlan: false }),
    ]);
  });

  it("does not expose or enable an account outside the Post owner's site", async () => {
    fixture.db.run("INSERT INTO owner_profile (id) VALUES ('another-owner')");
    fixture.db.run("INSERT INTO sites (id, user_id) VALUES ('site-other', 'another-owner')");
    fixture.db.run(
      `INSERT INTO social_accounts (
         id, user_id, site_id, platform, platform_account_id, display_name, status,
         scopes_json, metadata_json, created_at, updated_at
       ) VALUES (
         'account-other', 'another-owner', 'site-other', 'linkedin', 'li-other',
         'Another owner', 'active', '[]', '{}', datetime('now'), datetime('now')
       )`,
    );
    seedPost(fixture.db, {
      postId: "post-cross-owner-account",
      versionId: "version-cross-owner-account",
      sourceTitle: "Owner-scoped Source",
      bodyText: "This Version must not reveal another owner's account.",
      accountId: "account-other",
    });

    await expect(
      searchPostLibrary(fixture.env, "owner", { query: "must not reveal" }),
    ).resolves.toEqual([
      expect.objectContaining({
        versionId: "version-cross-owner-account",
        accountId: null,
        accountLabel: "linkedin",
        eligibleForPostingPlan: false,
      }),
    ]);
  });

  it("keeps tags owner-writable through the canonical Post API with stale-write protection", async () => {
    seedPost(fixture.db, {
      postId: "post-tags",
      versionId: "version-tags",
      sourceTitle: "Tagged Source",
      bodyText: "Tag this Post",
      tags: ["old"],
    });
    const updated = await updateSocialPost(fixture.env, "owner", "post-tags", {
      tags: ["Launch", "AI", "launch"],
      expectedUpdatedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(updated?.post.tags).toEqual(["launch", "ai"]);
    await expect(
      updateSocialPost(fixture.env, "owner", "post-tags", {
        tags: ["stale"],
        expectedUpdatedAt: "2026-06-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      searchPostLibrary(fixture.env, "owner", { tag: "ai" }),
    ).resolves.toEqual([expect.objectContaining({ postId: "post-tags" })]);
  });

  it("persists validated Preferred posting times per owned account", async () => {
    const saved = await updatePreferredPostingTimes(fixture.env, "owner", "account-1", {
      timezone: "Europe/Dublin",
      times: [
        { day: "friday", localTime: "16:00" },
        { day: "monday", localTime: "09:30" },
        { day: "monday", localTime: "09:30" },
      ],
      minimumGapMinutes: 120,
      minimumRepostDays: 30,
    });
    expect(saved).toMatchObject({
      timezone: "Europe/Dublin",
      times: [
        { day: "monday", localTime: "09:30" },
        { day: "friday", localTime: "16:00" },
      ],
      minimumGapMinutes: 120,
      minimumRepostDays: 30,
    });
    await expect(getPreferredPostingTimes(fixture.env, "owner", "account-1"))
      .resolves.toEqual(saved);
    await expect(getPreferredPostingTimes(fixture.env, "another-owner", "account-1"))
      .resolves.toBeNull();
    await expect(
      updatePreferredPostingTimes(fixture.env, "owner", "account-1", {
        timezone: "Not/A_Timezone",
        times: [{ day: "monday", localTime: "09:30" }],
      }),
    ).rejects.toMatchObject({ message: "Choose a valid timezone" });
  });

  it("rejects confirmed=false without reserving or scheduling anything", async () => {
    seedPost(fixture.db, {
      postId: "post-not-confirmed",
      versionId: "version-not-confirmed",
      sourceTitle: "Not confirmed",
      bodyText: "Nothing should be scheduled.",
    });
    const plan = seedPostingPlan(
      fixture.db,
      "plan-not-confirmed",
      "item-not-confirmed",
      "version-not-confirmed",
      "2099-08-01T09:00:00.000Z",
    );
    await expect(
      claimPostingPlanForConfirmation(fixture.env, "owner", plan.id, {
        confirmed: false,
        expectedUpdatedAt: plan.updatedAt,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fixture.db.scalar(
      "SELECT status FROM social_posting_plans WHERE id = 'plan-not-confirmed'",
    )).toBe("suggested");
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_posting_reservations")).toBe("0");
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_publications")).toBe("0");
  });

  it("uses half-open proposal boundaries in the account timezone", async () => {
    seedPost(fixture.db, {
      postId: "post-boundary",
      versionId: "version-boundary",
      sourceTitle: "Boundary Source",
      bodyText: "Boundary Post",
    });
    await savePreference(fixture, {
      timezone: "UTC",
      times: [{ day: "monday", localTime: "09:00" }],
      minimumGapMinutes: 0,
    });
    const endingAtSlot = await createPostingPlan(fixture.env, "owner", {
      accountId: "account-1",
      windowStart: "2026-07-06T08:59:00.000Z",
      windowEnd: "2026-07-06T09:00:00.000Z",
      count: 1,
    });
    expect(endingAtSlot.items).toHaveLength(0);
    const startingAtSlot = await createPostingPlan(fixture.env, "owner", {
      accountId: "account-1",
      windowStart: "2026-07-06T09:00:00.000Z",
      windowEnd: "2026-07-06T09:01:00.000Z",
      count: 1,
    });
    expect(startingAtSlot.items[0]?.scheduledFor).toBe("2026-07-06T09:00:00.000Z");
  });

  it("skips nonexistent Preferred times and chooses the earlier repeated instant with warnings", async () => {
    seedPost(fixture.db, {
      postId: "post-dst",
      versionId: "version-dst",
      sourceTitle: "DST Source",
      bodyText: "DST Post",
    });
    await savePreference(fixture, {
      timezone: "Europe/Dublin",
      times: [{ day: "sunday", localTime: "01:30" }],
      minimumGapMinutes: 0,
    });
    const repeated = await createPostingPlan(fixture.env, "owner", {
      accountId: "account-1",
      windowStart: "2026-10-25T00:00:00.000Z",
      windowEnd: "2026-10-25T03:00:00.000Z",
      count: 1,
    });
    expect(repeated.items[0]?.scheduledFor).toBe("2026-10-25T00:30:00.000Z");
    expect(repeated.warnings).toContainEqual(
      expect.objectContaining({ code: "ambiguous_local_time" }),
    );

    const missing = await createPostingPlan(fixture.env, "owner", {
      accountId: "account-1",
      windowStart: "2027-03-28T00:00:00.000Z",
      windowEnd: "2027-03-28T03:00:00.000Z",
      count: 1,
    });
    expect(missing.items).toHaveLength(0);
    expect(missing.warnings).toContainEqual(
      expect.objectContaining({ code: "nonexistent_local_time" }),
    );
  });

  it.each([
    [119, false],
    [120, true],
    [121, true],
  ])("treats %i minutes against a 120-minute minimum gap as available=%s", async (minutes, available) => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const first = seedPostingPlan(fixture.db, "plan-a", "item-a", "version-1", "2099-08-01T09:00:00.000Z");
    const secondTime = new Date(Date.parse("2099-08-01T09:00:00.000Z") + minutes * 60_000).toISOString();
    const second = seedPostingPlan(fixture.db, "plan-b", "item-b", "version-2", secondTime);
    const firstClaim = await claimPlan(fixture, first);
    const secondClaim = await claimPlan(fixture, second);
    await reservePostingPlanItem(fixture.env, "owner", "plan-a", "item-a", firstClaim.token!);
    const attempt = reservePostingPlanItem(
      fixture.env,
      "owner",
      "plan-b",
      "item-b",
      secondClaim.token!,
    );
    if (available) await expect(attempt).resolves.toMatchObject({ planItemId: "item-b" });
    else await expect(attempt).rejects.toBeInstanceOf(SocialPostingPlanInputError);
  });

  it("serializes concurrent different-Version plan reservations", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const first = seedPostingPlan(fixture.db, "plan-a", "item-a", "version-1", "2099-08-01T09:00:00.000Z");
    const second = seedPostingPlan(fixture.db, "plan-b", "item-b", "version-2", "2099-08-01T09:00:00.000Z");
    const [firstClaim, secondClaim] = await Promise.all([claimPlan(fixture, first), claimPlan(fixture, second)]);
    const results = await Promise.allSettled([
      reservePostingPlanItem(fixture.env, "owner", "plan-a", "item-a", firstClaim.token!),
      reservePostingPlanItem(fixture.env, "owner", "plan-b", "item-b", secondClaim.token!),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_posting_reservations WHERE status = 'reserved'"))
      .toBe("1");
  });

  it("does not let a stale confirmation token fulfill, release, or finalize reservations", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const plan = seedPostingPlan(fixture.db, "plan-stale", "item-stale", "version-1", "2099-08-01T09:00:00.000Z");
    const claim = await claimPlan(fixture, plan);
    await reservePostingPlanItem(fixture.env, "owner", plan.id, "item-stale", claim.token!);
    await linkPostingPlanItemPublication(
      fixture.env,
      "owner",
      plan.id,
      "item-stale",
      "wrong-token",
      "publication-wrong",
    );
    await blockPostingPlanItem(
      fixture.env,
      "owner",
      plan.id,
      "item-stale",
      "wrong-token",
      "wrong confirmer",
    );
    expect(fixture.db.scalar("SELECT status FROM social_posting_reservations WHERE plan_item_id = 'item-stale'"))
      .toBe("reserved");
    expect(fixture.db.scalar("SELECT status FROM social_posting_plan_items WHERE id = 'item-stale'"))
      .toBe("reserved");
    await expect(
      finishPostingPlanConfirmation(fixture.env, "owner", plan.id, "wrong-token"),
    ).rejects.toMatchObject({ status: 409 });
    expect(fixture.db.scalar("SELECT status FROM social_posting_plans WHERE id = 'plan-stale'"))
      .toBe("confirming");
  });

  it("guards both plan-reservation/manual-schedule writer orderings", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const planFirst = seedPostingPlan(fixture.db, "plan-first", "item-first", "version-1", "2099-08-01T09:00:00.000Z");
    const claim = await claimPlan(fixture, planFirst);
    await reservePostingPlanItem(fixture.env, "owner", planFirst.id, "item-first", claim.token!);
    await expect(
      createPostVersionPublication(fixture.env, "owner", "version-2", {
        scheduledFor: "2099-08-01T10:00:00.000Z",
        timezone: "UTC",
      }),
    ).rejects.toMatchObject({ status: 409, message: "This account has another Posting plan too close to that time" });

    fixture.close();
    fixture = createFixture();
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    await createPostVersionPublication(fixture.env, "owner", "version-1", {
      scheduledFor: "2099-08-01T09:00:00.000Z",
      timezone: "UTC",
    });
    const manualFirst = seedPostingPlan(fixture.db, "plan-second", "item-second", "version-2", "2099-08-01T10:00:00.000Z");
    const manualFirstClaim = await claimPlan(fixture, manualFirst);
    await expect(
      reservePostingPlanItem(
        fixture.env,
        "owner",
        manualFirst.id,
        "item-second",
        manualFirstClaim.token!,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("guards both plan-reservation/Calendar-reschedule writer orderings", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const existing = await createPostVersionPublication(fixture.env, "owner", "version-2", {
      scheduledFor: "2099-08-01T06:00:00.000Z",
      timezone: "UTC",
    });
    const planFirst = seedPostingPlan(fixture.db, "plan-reschedule-a", "item-reschedule-a", "version-1", "2099-08-01T09:00:00.000Z");
    const claim = await claimPlan(fixture, planFirst);
    await reservePostingPlanItem(fixture.env, "owner", planFirst.id, "item-reschedule-a", claim.token!);
    await expect(
      reschedulePublication(fixture.env, "owner", existing!.id, {
        scheduledFor: "2099-08-01T10:00:00.000Z",
        timezone: "UTC",
        expectedUpdatedAt: existing!.updatedAt,
      }),
    ).rejects.toMatchObject({ status: 409, message: "This account has another Posting plan too close to that time" });

    fixture.close();
    fixture = createFixture();
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const manualFirst = await createPostVersionPublication(fixture.env, "owner", "version-2", {
      scheduledFor: "2099-08-01T06:00:00.000Z",
      timezone: "UTC",
    });
    await reschedulePublication(fixture.env, "owner", manualFirst!.id, {
      scheduledFor: "2099-08-01T10:00:00.000Z",
      timezone: "UTC",
      expectedUpdatedAt: manualFirst!.updatedAt,
    });
    const planSecond = seedPostingPlan(fixture.db, "plan-reschedule-b", "item-reschedule-b", "version-1", "2099-08-01T09:00:00.000Z");
    const secondClaim = await claimPlan(fixture, planSecond);
    await expect(
      reservePostingPlanItem(
        fixture.env,
        "owner",
        planSecond.id,
        "item-reschedule-b",
        secondClaim.token!,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("keeps partial confirmation visible and only confirms after every item links", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 0 });
    const plan = seedPostingPlan(
      fixture.db,
      "plan-partial",
      "item-one",
      "version-1",
      "2099-08-01T09:00:00.000Z",
    );
    seedPostingPlanItem(
      fixture.db,
      plan.id,
      "item-two",
      1,
      "version-2",
      "2099-08-01T12:00:00.000Z",
    );
    fixture.db.run("UPDATE social_variants SET approval_status = 'draft' WHERE id = 'version-2'");
    const result = await confirmPostingPlan(fixture.env, "owner", plan.id, {
      confirmed: true,
      expectedUpdatedAt: plan.updatedAt,
    });
    expect(result?.status).toBe("needs_attention");
    expect(result?.items).toEqual([
      expect.objectContaining({ status: "scheduled", publicationId: expect.any(String) }),
      expect.objectContaining({ status: "blocked", publicationId: null }),
    ]);
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_publications")).toBe("1");
  });

  it("revives a released deterministic reservation when a plan is retried", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const plan = seedPostingPlan(fixture.db, "plan-retry", "item-retry", "version-1", "2099-08-01T09:00:00.000Z");
    const firstClaim = await claimPlan(fixture, plan);
    await reservePostingPlanItem(fixture.env, "owner", plan.id, "item-retry", firstClaim.token!);
    await blockPostingPlanItem(
      fixture.env,
      "owner",
      plan.id,
      "item-retry",
      firstClaim.token!,
      "Temporary conflict",
    );
    const needsAttention = await finishPostingPlanConfirmation(
      fixture.env,
      "owner",
      plan.id,
      firstClaim.token!,
    );
    expect(fixture.db.scalar("SELECT status FROM social_posting_reservations WHERE plan_item_id = 'item-retry'"))
      .toBe("released");
    const secondClaim = await claimPlan(fixture, {
      id: plan.id,
      updatedAt: needsAttention.updatedAt,
    });
    await expect(
      reservePostingPlanItem(fixture.env, "owner", plan.id, "item-retry", secondClaim.token!),
    ).resolves.toMatchObject({ planItemId: "item-retry" });
    expect(fixture.db.scalar("SELECT status FROM social_posting_reservations WHERE plan_item_id = 'item-retry'"))
      .toBe("reserved");
  });

  it("reconciles an exact Publication created before plan-item linking", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const plan = seedPostingPlan(fixture.db, "plan-orphan", "item-orphan", "version-1", "2099-08-01T09:00:00.000Z");
    const firstClaim = await claimPlan(fixture, plan);
    await reservePostingPlanItem(fixture.env, "owner", plan.id, "item-orphan", firstClaim.token!);
    seedPublication(fixture.db, {
      id: "social-publication-item-orphan",
      versionId: "version-1",
      scheduledFor: "2099-08-01T09:00:00.000Z",
      status: "scheduled",
    });
    await blockPostingPlanItem(
      fixture.env,
      "owner",
      plan.id,
      "item-orphan",
      firstClaim.token!,
      "Simulated event-write failure",
    );
    expect(fixture.db.scalar("SELECT status FROM social_posting_reservations WHERE plan_item_id = 'item-orphan'"))
      .toBe("reserved");
    const needsAttention = await finishPostingPlanConfirmation(
      fixture.env,
      "owner",
      plan.id,
      firstClaim.token!,
    );
    const recovered = await confirmPostingPlan(fixture.env, "owner", plan.id, {
      confirmed: true,
      expectedUpdatedAt: needsAttention.updatedAt,
    });
    expect(recovered?.status).toBe("confirmed");
    expect(recovered?.items[0]).toMatchObject({
      status: "scheduled",
      publicationId: "social-publication-item-orphan",
    });
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_publications")).toBe("1");
  });

  it("expires abandoned confirmations and releases only reservations without a Publication", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const releasable = seedPostingPlan(fixture.db, "plan-expire-a", "item-expire-a", "version-1", "2099-08-01T09:00:00.000Z");
    const held = seedPostingPlan(fixture.db, "plan-expire-b", "item-expire-b", "version-2", "2099-08-02T09:00:00.000Z");
    const releasableClaim = await claimPlan(fixture, releasable);
    const heldClaim = await claimPlan(fixture, held);
    await reservePostingPlanItem(fixture.env, "owner", releasable.id, "item-expire-a", releasableClaim.token!);
    await reservePostingPlanItem(fixture.env, "owner", held.id, "item-expire-b", heldClaim.token!);
    seedPublication(fixture.db, {
      id: "social-publication-item-expire-b",
      versionId: "version-2",
      scheduledFor: "2099-08-02T09:00:00.000Z",
      status: "scheduled",
    });
    fixture.db.run(
      "UPDATE social_posting_plans SET expires_at = '2026-06-30T00:00:00.000Z' WHERE id IN ('plan-expire-a', 'plan-expire-b')",
    );
    await expect(getPostingPlan(fixture.env, "owner", releasable.id))
      .resolves.toMatchObject({ status: "expired" });
    await expect(getPostingPlan(fixture.env, "owner", held.id))
      .resolves.toMatchObject({ status: "expired" });
    expect(fixture.db.query<{ plan_item_id: string; status: string }>(
      "SELECT plan_item_id, status FROM social_posting_reservations ORDER BY plan_item_id",
    )).toEqual([
      { plan_item_id: "item-expire-a", status: "released" },
      { plan_item_id: "item-expire-b", status: "reserved" },
    ]);
  });

  it("rejects an edited and reapproved Version after the plan was reviewed", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const plan = seedPostingPlan(fixture.db, "plan-version-snapshot", "item-version-snapshot", "version-1", "2099-08-01T09:00:00.000Z");
    fixture.db.run(
      `UPDATE social_variants
       SET body_text = 'Changed and reapproved copy', approval_status = 'approved',
           approved_at = '2026-07-01T12:01:00.000Z', updated_at = '2026-07-01T12:01:00.000Z'
       WHERE id = 'version-1'`,
    );
    const claim = await claimPlan(fixture, plan);
    await expect(
      reservePostingPlanItem(
        fixture.env,
        "owner",
        plan.id,
        "item-version-snapshot",
        claim.token!,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "A Version changed after this Posting plan was reviewed. Make a fresh plan.",
    });
    expect(fixture.db.scalar("SELECT status FROM social_posting_plan_items WHERE id = 'item-version-snapshot'"))
      .toBe("blocked");
  });

  it.each(["cancelled", "failed"] as const)(
    "does not adopt a deterministic %s Publication as successfully scheduled",
    async (terminalStatus) => {
      seedTwoApprovedPosts(fixture.db);
      await savePreference(fixture, { minimumGapMinutes: 120 });
      const plan = seedPostingPlan(fixture.db, `plan-${terminalStatus}`, `item-${terminalStatus}`, "version-1", "2099-08-01T09:00:00.000Z");
      const claim = await claimPlan(fixture, plan);
      await reservePostingPlanItem(fixture.env, "owner", plan.id, `item-${terminalStatus}`, claim.token!);
      seedPublication(fixture.db, {
        id: `social-publication-item-${terminalStatus}`,
        versionId: "version-1",
        scheduledFor: "2099-08-01T09:00:00.000Z",
        status: terminalStatus,
      });
      await blockPostingPlanItem(
        fixture.env,
        "owner",
        plan.id,
        `item-${terminalStatus}`,
        claim.token!,
        "Simulated interrupted confirmation",
      );
      const needsAttention = await finishPostingPlanConfirmation(
        fixture.env,
        "owner",
        plan.id,
        claim.token!,
      );
      const retried = await confirmPostingPlan(fixture.env, "owner", plan.id, {
        confirmed: true,
        expectedUpdatedAt: needsAttention.updatedAt,
      });
      expect(retried?.status).toBe("needs_attention");
      expect(retried?.items[0]).toMatchObject({ status: "blocked", publicationId: null });
      expect(fixture.db.scalar(`SELECT status FROM social_posting_reservations WHERE plan_item_id = 'item-${terminalStatus}'`))
        .toBe("reserved");
    },
  );

  it("applies both published date bounds to one published Publication", async () => {
    seedPost(fixture.db, {
      postId: "post-date-range",
      versionId: "version-date-range",
      sourceTitle: "Date range Source",
      bodyText: "Date range Post",
    });
    seedPublication(fixture.db, {
      id: "publication-before",
      versionId: "version-date-range",
      scheduledFor: null,
      status: "published",
      publishedAt: "2026-05-01T09:00:00.000Z",
    });
    seedPublication(fixture.db, {
      id: "publication-after",
      versionId: "version-date-range",
      scheduledFor: null,
      status: "published",
      publishedAt: "2026-08-01T09:00:00.000Z",
    });
    await expect(
      searchPostLibrary(fixture.env, "owner", {
        publishedFrom: "2026-06-01T00:00:00.000Z",
        publishedTo: "2026-07-01T00:00:00.000Z",
      }),
    ).resolves.toEqual([]);
    await expect(
      searchPostLibrary(fixture.env, "owner", {
        publishedFrom: "2026-07-01T00:00:00.000Z",
        publishedTo: "2026-06-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ message: "publishedFrom must be before publishedTo" });
  });

  it("uses the reviewed minimum gap even if account preferences change later", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    const first = seedPostingPlan(fixture.db, "plan-gap-snapshot-a", "item-gap-snapshot-a", "version-1", "2099-08-01T09:00:00.000Z");
    const second = seedPostingPlan(fixture.db, "plan-gap-snapshot-b", "item-gap-snapshot-b", "version-2", "2099-08-01T10:59:00.000Z");
    await savePreference(fixture, { minimumGapMinutes: 0 });
    const firstClaim = await claimPlan(fixture, first);
    const secondClaim = await claimPlan(fixture, second);
    await reservePostingPlanItem(fixture.env, "owner", first.id, "item-gap-snapshot-a", firstClaim.token!);
    await expect(
      reservePostingPlanItem(
        fixture.env,
        "owner",
        second.id,
        "item-gap-snapshot-b",
        secondClaim.token!,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("honours an older plan's wider reservation after a later plan reviews a smaller gap", async () => {
    seedTwoApprovedPosts(fixture.db);
    const wide = seedPostingPlan(
      fixture.db,
      "plan-wide-reservation",
      "item-wide-reservation",
      "version-1",
      "2099-08-01T09:00:00.000Z",
    );
    const narrow = seedPostingPlan(
      fixture.db,
      "plan-narrow-reservation",
      "item-narrow-reservation",
      "version-2",
      "2099-08-01T10:00:00.000Z",
    );
    fixture.db.run(
      `UPDATE social_posting_plans
       SET request_json = json_set(request_json, '$.minimumGapMinutes', 0)
       WHERE id = 'plan-narrow-reservation'`,
    );
    const wideClaim = await claimPlan(fixture, wide);
    const narrowClaim = await claimPlan(fixture, narrow);
    await reservePostingPlanItem(
      fixture.env,
      "owner",
      wide.id,
      "item-wide-reservation",
      wideClaim.token!,
    );
    await expect(
      reservePostingPlanItem(
        fixture.env,
        "owner",
        narrow.id,
        "item-narrow-reservation",
        narrowClaim.token!,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(fixture.db.scalar(
      "SELECT COUNT(*) FROM social_posting_reservations WHERE status = 'reserved'",
    )).toBe("1");
  });

  it("treats recent published activity as an account-wide minimum-gap collision", async () => {
    seedTwoApprovedPosts(fixture.db);
    await savePreference(fixture, { minimumGapMinutes: 120 });
    seedPublication(fixture.db, {
      id: "publication-recent-account-activity",
      versionId: "version-1",
      scheduledFor: null,
      status: "published",
      publishedAt: "2099-08-01T09:00:00.000Z",
    });
    const plan = seedPostingPlan(fixture.db, "plan-published-gap", "item-published-gap", "version-2", "2099-08-01T10:00:00.000Z");
    const claim = await claimPlan(fixture, plan);
    await expect(
      reservePostingPlanItem(fixture.env, "owner", plan.id, "item-published-gap", claim.token!),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("advances the Post tag revision monotonically even within one clock tick", async () => {
    seedPost(fixture.db, {
      postId: "post-monotonic",
      versionId: "version-monotonic",
      sourceTitle: "Monotonic Source",
      bodyText: "Monotonic Post",
    });
    fixture.db.run(
      "UPDATE social_packages SET updated_at = '2026-07-01T12:00:00.000Z' WHERE id = 'post-monotonic'",
    );
    const updated = await updateSocialPost(fixture.env, "owner", "post-monotonic", {
      tags: ["revision"],
      expectedUpdatedAt: "2026-07-01T12:00:00.000Z",
    });
    expect(updated?.post.updatedAt).toBe("2026-07-01T12:00:00.001Z");
  });
});

function createFixture() {
  const db = new TestD1Database();
  db.exec(baseSchemaSql);
  db.exec(readFileSync(
    fileURLToPath(new URL("../migrations/0025_social_posting_plans.sql", import.meta.url)),
    "utf8",
  ));
  db.run("INSERT INTO owner_profile (id) VALUES ('owner')");
  db.run("INSERT INTO plugin_installations (plugin_id, enabled, status) VALUES ('me3.social-publishing', 1, 'installed')");
  db.run("INSERT INTO sites (id, user_id) VALUES ('site-1', 'owner')");
  db.run(
    `INSERT INTO social_accounts (
       id, user_id, site_id, platform, platform_account_id, display_name, status,
       scopes_json, metadata_json, created_at, updated_at
     ) VALUES
       ('account-1', 'owner', 'site-1', 'linkedin', 'li-1', 'LinkedIn', 'active', '[]', '{}', datetime('now'), datetime('now')),
       ('account-x', 'owner', 'site-1', 'x', 'x-1', 'X', 'active', '[]', '{}', datetime('now'), datetime('now'))`,
  );
  return { db, env: { DB: db }, close: () => db.close() };
}

function seedPost(
  db: TestD1Database,
  input: {
    postId: string;
    versionId: string;
    sourceTitle: string;
    sourceRef?: string;
    bodyText: string;
    tags?: string[];
    platform?: "linkedin" | "x";
    accountId?: string;
    approvalStatus?: "approved" | "draft";
  },
) {
  const platform = input.platform || "linkedin";
  const approvalStatus = input.approvalStatus || "approved";
  db.run(
    `INSERT INTO social_packages (
       id, site_id, post_slug, post_title_snapshot, source_hash, status, created_by,
       source_type, source_ref, source_snapshot, source_text, idea_text, tags_json,
       created_at, updated_at
     ) VALUES (?, 'site-1', ?, ?, 'hash', 'ready', 'user', 'journal', ?, '{}',
               ?, ?, ?, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`,
    input.postId,
    input.postId,
    input.sourceTitle,
    input.sourceRef || `journal:${input.postId}`,
    input.sourceTitle,
    input.bodyText,
    JSON.stringify(input.tags || []),
  );
  db.run(
    `INSERT INTO social_variants (
       id, package_id, platform, target_account_id, format, body_text,
       asset_manifest_json, approval_status, approved_at, approved_by_user_id,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'post', ?, '[]', ?, ?, ?,
               '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`,
    input.versionId,
    input.postId,
    platform,
    input.accountId || "account-1",
    input.bodyText,
    approvalStatus,
    approvalStatus === "approved" ? "2026-06-01T00:00:00.000Z" : null,
    approvalStatus === "approved" ? "owner" : null,
  );
}

function seedTwoApprovedPosts(db: TestD1Database) {
  seedPost(db, { postId: "post-1", versionId: "version-1", sourceTitle: "One", bodyText: "One" });
  seedPost(db, { postId: "post-2", versionId: "version-2", sourceTitle: "Two", bodyText: "Two" });
}

function seedPublication(
  db: TestD1Database,
  input: {
    id: string;
    versionId: string;
    scheduledFor: string | null;
    status: "scheduled" | "published" | "failed" | "cancelled";
    publishedAt?: string | null;
  },
) {
  db.run(
    `INSERT INTO social_publications (
       id, variant_id, site_id, platform, status, scheduled_for, timezone,
       target_account_id_snapshot, format_snapshot, body_text_snapshot,
       asset_manifest_json_snapshot, approval_status_snapshot, requested_by_type,
       requested_by_user_id, request_context_json, published_at, created_at, updated_at
     ) VALUES (?, ?, 'site-1', 'linkedin', ?, ?, 'UTC', 'account-1', 'post', 'Body',
               '[]', 'approved', 'owner', 'owner', '{}', ?,
               '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`,
    input.id,
    input.versionId,
    input.status,
    input.scheduledFor,
    input.publishedAt || null,
  );
}

async function savePreference(
  fixture: ReturnType<typeof createFixture>,
  overrides: {
    timezone?: string;
    times?: Array<{ day: string; localTime: string }>;
    minimumGapMinutes?: number;
  } = {},
) {
  return updatePreferredPostingTimes(fixture.env, "owner", "account-1", {
    timezone: overrides.timezone || "UTC",
    times: overrides.times || [{ day: "monday", localTime: "09:00" }],
    minimumGapMinutes: overrides.minimumGapMinutes ?? 120,
    minimumRepostDays: null,
  });
}

function seedPostingPlan(
  db: TestD1Database,
  planId: string,
  itemId: string,
  versionId: string,
  scheduledFor: string,
) {
  const updatedAt = "2026-07-01T12:00:00.000Z";
  db.run(
    `INSERT INTO social_posting_plans (
       id, user_id, site_id, account_id, status, request_json, warnings_json,
       expires_at, created_at, updated_at
     ) VALUES (?, 'owner', 'site-1', 'account-1', 'suggested',
               '{"windowStart":"2099-08-01T00:00:00.000Z","windowEnd":"2099-08-02T00:00:00.000Z","requestedCount":1,"minimumGapMinutes":120,"minimumRepostDays":null,"timezone":"UTC","versionIds":[]}',
               '[]', '2099-08-02T00:00:00.000Z', ?, ?)`,
    planId,
    updatedAt,
    updatedAt,
  );
  seedPostingPlanItem(db, planId, itemId, 0, versionId, scheduledFor);
  return { id: planId, updatedAt };
}

function seedPostingPlanItem(
  db: TestD1Database,
  planId: string,
  itemId: string,
  position: number,
  versionId: string,
  scheduledFor: string,
) {
  const version = db.query<{
    platform: string;
    target_account_id: string;
    format: string;
    body_text: string;
    asset_manifest_json: string;
    approval_status: string;
    approved_at: string | null;
    updated_at: string;
  }>(`SELECT platform, target_account_id, format, body_text, asset_manifest_json,
             approval_status, approved_at, updated_at
      FROM social_variants WHERE id = '${versionId.replaceAll("'", "''")}'`)[0]!;
  const fingerprint = createHash("sha256").update(JSON.stringify({
    platform: version.platform,
    accountId: version.target_account_id,
    format: version.format,
    bodyText: version.body_text,
    assetManifest: version.asset_manifest_json,
    approvalStatus: version.approval_status,
    approvedAt: version.approved_at,
  })).digest("hex");
  db.run(
    `INSERT INTO social_posting_plan_items (
       id, plan_id, position, variant_id, version_updated_at_snapshot,
       approval_status_snapshot, version_fingerprint, scheduled_for, timezone,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, 'UTC', 'suggested',
               '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z')`,
    itemId,
    planId,
    position,
    versionId,
    version.updated_at,
    fingerprint,
    scheduledFor,
  );
}

async function claimPlan(
  fixture: ReturnType<typeof createFixture>,
  plan: { id: string; updatedAt: string },
) {
  const claim = await claimPostingPlanForConfirmation(fixture.env, "owner", plan.id, {
    confirmed: true,
    expectedUpdatedAt: plan.updatedAt,
  });
  if (!claim) throw new Error("Missing fixture Posting plan");
  return claim;
}

class TestD1Database {
  private readonly directory = mkdtempSync(join(tmpdir(), "me3-social-posting-plan-"));
  private readonly database = join(this.directory, "fixture.sqlite");

  exec(sql: string) {
    execFileSync("sqlite3", [this.database], { input: sql, encoding: "utf8" });
  }

  prepare(sql: string) {
    return new TestD1Statement(this.database, sql);
  }

  async batch(statements: TestD1Statement[]) {
    this.exec(`BEGIN IMMEDIATE;\n${statements.map((statement) => `${statement.boundSql()};`).join("\n")}\nCOMMIT;`);
    return [];
  }

  run(sql: string, ...values: unknown[]) {
    return this.prepare(sql).bind(...values).runSync();
  }

  scalar(sql: string): string {
    return execFileSync("sqlite3", [this.database, sql], { encoding: "utf8" }).trim();
  }

  query<T>(sql: string): T[] {
    return sqliteRows<T>(this.database, sql);
  }

  close() {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

class TestD1Statement {
  private values: unknown[] = [];

  constructor(private readonly database: string, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return sqliteRows<T>(this.database, this.boundSql())[0] || null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: sqliteRows<T>(this.database, this.boundSql()) };
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    execFileSync("sqlite3", [this.database], { input: this.boundSql(), encoding: "utf8" });
    return { success: true };
  }

  boundSql() {
    return bindSql(this.sql, this.values);
  }
}

function sqliteRows<T>(database: string, sql: string): T[] {
  const output = execFileSync("sqlite3", ["-json", database], { input: sql, encoding: "utf8" }).trim();
  return output ? JSON.parse(output) as T[] : [];
}

function bindSql(sql: string, values: unknown[]): string {
  let index = 0;
  let quote = "";
  let output = "";
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position] || "";
    if (quote) {
      output += character;
      if (character === quote) {
        if (sql[position + 1] === quote) {
          output += quote;
          position += 1;
        } else quote = "";
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
    } else if (character === "?") {
      output += sqliteLiteral(values[index]);
      index += 1;
    } else output += character;
  }
  if (index !== values.length) throw new Error(`SQLite binding mismatch: used ${index} of ${values.length}`);
  return output;
}

function sqliteLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const baseSchemaSql = `
  CREATE TABLE owner_profile (id TEXT PRIMARY KEY);
  CREATE TABLE plugin_installations (plugin_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, status TEXT NOT NULL);
  CREATE TABLE sites (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
  CREATE TABLE social_accounts (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, site_id TEXT NOT NULL, platform TEXT NOT NULL,
    platform_account_id TEXT NOT NULL, platform_handle TEXT, display_name TEXT, status TEXT NOT NULL,
    scopes_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE social_packages (
    id TEXT PRIMARY KEY, site_id TEXT NOT NULL, post_slug TEXT NOT NULL,
    post_title_snapshot TEXT NOT NULL, source_hash TEXT NOT NULL, goal TEXT,
    status TEXT NOT NULL, created_by TEXT NOT NULL, source_type TEXT NOT NULL,
    source_ref TEXT, source_snapshot TEXT NOT NULL DEFAULT '', source_text TEXT NOT NULL DEFAULT '',
    idea_text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(site_id, post_slug)
  );
  CREATE TABLE social_variants (
    id TEXT PRIMARY KEY, package_id TEXT NOT NULL, platform TEXT NOT NULL,
    target_account_id TEXT, format TEXT NOT NULL, body_text TEXT NOT NULL,
    asset_manifest_json TEXT NOT NULL DEFAULT '[]', carousel_render_set_id TEXT,
    source_excerpt TEXT,
    approval_status TEXT NOT NULL, approved_at TEXT, approved_by_user_id TEXT,
    scheduled_for TEXT, timezone TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(package_id, platform)
  );
  CREATE TABLE social_publications (
    id TEXT PRIMARY KEY, variant_id TEXT NOT NULL, site_id TEXT NOT NULL, platform TEXT NOT NULL,
    status TEXT NOT NULL, scheduled_for TEXT, timezone TEXT, target_account_id_snapshot TEXT,
    format_snapshot TEXT, body_text_snapshot TEXT, asset_manifest_json_snapshot TEXT,
    approval_status_snapshot TEXT, approved_at_snapshot TEXT, approved_by_user_id_snapshot TEXT,
    requested_by_type TEXT, requested_by_user_id TEXT, request_context_json TEXT NOT NULL DEFAULT '{}',
    platform_post_id TEXT, platform_post_url TEXT, error_code TEXT, error_message TEXT,
    provider_response_json TEXT, queued_at TEXT, published_at TEXT, last_polled_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE social_publication_events (
    id TEXT PRIMARY KEY, publication_id TEXT, variant_id TEXT NOT NULL,
    event_type TEXT NOT NULL, payload_json TEXT, created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_social_publications_same_time_scheduled
    ON social_publications(variant_id, scheduled_for)
    WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;
`;
