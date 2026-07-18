import { beforeEach, describe, expect, it, vi } from "vitest";

const socialPublishing = vi.hoisted(() => ({
  searchPostLibrary: vi.fn(),
  createPostingPlan: vi.fn(),
  confirmPostingPlan: vi.fn(),
}));

vi.mock("@me3-core/plugin-social-publishing", async (importOriginal) => ({
  ...await importOriginal<typeof import("@me3-core/plugin-social-publishing")>(),
  ...socialPublishing,
}));

import {
  runCoreAgentToolTurn,
  type AgentToolMessage,
} from "@me3-core/plugin-agent-chat";

const proposedPlan = {
  id: "plan-1",
  siteId: "site-1",
  accountId: "account-1",
  accountLabel: "Kieran on LinkedIn",
  platform: "linkedin" as const,
  status: "suggested" as const,
  windowStart: "2026-07-20T00:00:00.000Z",
  windowEnd: "2026-07-27T00:00:00.000Z",
  timezone: "Europe/Dublin",
  requestedCount: 1,
  minimumGapMinutes: 120,
  minimumRepostDays: 30,
  warnings: [{ code: "stale_post" as const, message: "Review this older Post." }],
  items: [{
    id: "item-1",
    position: 0,
    versionId: "version-1",
    postId: "post-1",
    sourceTitle: "Small useful slices",
    postText: "Ship the smallest useful slice.",
    platform: "linkedin" as const,
    accountId: "account-1",
    scheduledFor: "2026-07-20T08:00:00.000Z",
    timezone: "Europe/Dublin",
    isRepost: false,
    status: "suggested" as const,
    publicationId: null,
    errorMessage: null,
  }],
  expiresAt: "2026-07-19T09:00:00.000Z",
  confirmedAt: null,
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-18T09:00:00.000Z",
};

describe("Social Posting plan Agent tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches the library before proposing a review-only plan", async () => {
    socialPublishing.searchPostLibrary.mockResolvedValue([{
      postId: "post-1",
      versionId: "version-1",
      sourceTitle: "Small useful slices",
    }]);
    const searched = await runTool(
      "search",
      "core_social_library_search",
      {
        query: "small slices",
        approvalStatus: "approved",
        platform: "linkedin",
      },
      "Found 1 matching Social Post Version.",
    );
    expect(searched).toMatchObject({
      specialist: "core.social.library.search",
      replyText: "Found 1 matching Social Post Version.",
    });
    expect(socialPublishing.searchPostLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ DB: expect.anything() }),
      "owner",
      expect.objectContaining({
        query: "small slices",
        approvalStatus: "approved",
        platform: "linkedin",
      }),
    );

    const database = createAgentDb();
    socialPublishing.createPostingPlan.mockResolvedValue(proposedPlan);
    const proposed = await runTool(
      "propose",
      "core_social_posting_plan_create",
      {
        accountId: "account-1",
        versionIds: "version-1",
        windowStart: proposedPlan.windowStart,
        windowEnd: proposedPlan.windowEnd,
        count: 1,
      },
      "Proposed 1 posting time for review. Nothing was scheduled.",
      { database, message: "Propose one approved LinkedIn Post for next week." },
    );
    expect(proposed).toMatchObject({
      specialist: "core.social.posting_plan.create",
      replyText: "Proposed 1 posting time for review. Nothing was scheduled.",
      actionCards: [{
        kind: "social.posting_plan_proposed",
        summary: "Kieran on LinkedIn · LinkedIn",
        status: "pending_approval",
        statusLabel: "Needs confirmation",
        changed: expect.arrayContaining([
          {
            label: "Small useful slices",
            value: expect.stringContaining("20 Jul 2026"),
          },
          { label: "Warning", value: "Review this older Post." },
          { label: "Window starts", value: expect.stringContaining("20 Jul 2026") },
        ]),
        primaryAction: {
          label: "Review Posting plan",
          href: "/social?siteId=site-1&postingPlan=plan-1",
        },
        secondaryActions: [{ label: "Open Calendar", href: "/calendar?siteId=site-1" }],
      }],
    });
    expect(socialPublishing.createPostingPlan).toHaveBeenCalledWith(
      expect.objectContaining({ DB: expect.anything() }),
      "owner",
      expect.objectContaining({ versionIds: ["version-1"] }),
    );
    const storedProposal = database.executions.find(
      (execution) => execution.tool_name === "core_social_posting_plan_create",
    );
    expect(JSON.parse(String(storedProposal?.result_json))).toMatchObject({
      result: {
        scheduled: false,
        ownerConfirmation: {
          status: "pending_owner_confirmation",
          planId: proposedPlan.id,
          expectedUpdatedAt: proposedPlan.updatedAt,
        },
      },
    });
  });

  it("rejects proposing and confirming in the same turn even when the model supplies confirmed=true", async () => {
    const database = createAgentDb();
    socialPublishing.createPostingPlan.mockResolvedValue(proposedPlan);

    const response = await runCoreAgentToolTurn({
      db: database,
      userId: "owner",
      requestId: "request-same-turn",
      turnId: "turn-same-turn",
      ownerTimezone: "Europe/Dublin",
      route: workersRoute([
        {
          tool_calls: [
            {
              id: "propose-same-turn",
              name: "core_social_posting_plan_create",
              arguments: postingPlanProposalArguments(),
            },
            {
              id: "confirm-same-turn",
              name: "core_social_posting_plan_confirm",
              arguments: postingPlanConfirmationArguments(),
            },
          ],
        },
        { response: "I made the Posting plan available for review. Nothing was scheduled." },
      ]) as never,
      messages: baseMessages("Confirm that exact Posting plan after you propose it now."),
    });

    expect(socialPublishing.createPostingPlan).toHaveBeenCalledTimes(1);
    expect(socialPublishing.confirmPostingPlan).not.toHaveBeenCalled();
    expect(response.actionCards).toEqual([
      expect.objectContaining({
        kind: "social.posting_plan_proposed",
        status: "pending_approval",
      }),
    ]);
    expect(database.executions.find(
      (execution) => execution.tool_name === "core_social_posting_plan_confirm",
    )).toMatchObject({
      status: "failed",
      error_message: expect.stringContaining("not waiting for owner confirmation"),
    });
  });

  it("rejects confirmation after a proposal when the later owner message does not explicitly approve it", async () => {
    const database = createAgentDb();
    await recordReviewedPlan(database);

    await runTool(
      "confirm-without-owner-approval",
      "core_social_posting_plan_confirm",
      postingPlanConfirmationArguments(),
      "I kept the Posting plan unchanged.",
      { database, message: "Show me that Posting plan again." },
    );

    expect(socialPublishing.confirmPostingPlan).not.toHaveBeenCalled();
    expect(database.executions.find(
      (execution) => execution.tool_name === "core_social_posting_plan_confirm",
    )).toMatchObject({
      status: "failed",
      error_message: expect.stringContaining("explicitly confirm"),
    });
  });

  it("rejects a later explicit confirmation when the requested plan revision was not reviewed", async () => {
    const database = createAgentDb();
    await recordReviewedPlan(database);

    await runTool(
      "confirm-unreviewed-revision",
      "core_social_posting_plan_confirm",
      {
        ...postingPlanConfirmationArguments(),
        expectedUpdatedAt: "2026-07-18T09:01:00.000Z",
      },
      "I left the Posting plan waiting for a fresh review.",
      { database, message: "Yes, confirm that exact Posting plan as shown." },
    );

    expect(socialPublishing.confirmPostingPlan).not.toHaveBeenCalled();
    expect(database.executions.find(
      (execution) => execution.tool_name === "core_social_posting_plan_confirm",
    )).toMatchObject({
      status: "failed",
      error_message: expect.stringContaining("exact Posting plan revision"),
    });
  });

  it("confirms only after a later explicit owner message and returns site-scoped links", async () => {
    const database = createAgentDb();
    await recordReviewedPlan(database);
    const confirmedPlan = {
      ...proposedPlan,
      status: "confirmed" as const,
      confirmedAt: "2026-07-18T09:05:00.000Z",
      updatedAt: "2026-07-18T09:05:00.000Z",
      items: [{
        ...proposedPlan.items[0],
        status: "scheduled" as const,
        publicationId: "publication-1",
      }],
    };
    socialPublishing.confirmPostingPlan.mockResolvedValue(confirmedPlan);
    const response = await runTool(
      "confirm",
      "core_social_posting_plan_confirm",
      {
        planId: proposedPlan.id,
        expectedUpdatedAt: proposedPlan.updatedAt,
        confirmed: true,
      },
      "Scheduled all 1 Posts in the confirmed Posting plan.",
      {
        database,
        message: "Yes, confirm that exact Posting plan as shown.",
      },
    );

    expect(socialPublishing.confirmPostingPlan).toHaveBeenCalledWith(
      expect.objectContaining({ DB: expect.anything() }),
      "owner",
      "plan-1",
      { expectedUpdatedAt: proposedPlan.updatedAt, confirmed: true },
      { requestedByType: "agent" },
    );
    expect(response).toMatchObject({
      specialist: "core.social.posting_plan.confirm",
      replyText: "Scheduled all 1 Posts in the confirmed Posting plan.",
      actionCards: [{
        kind: "social.posting_plan_confirmed",
        summary: "Kieran on LinkedIn · LinkedIn",
        status: "complete",
        changed: expect.arrayContaining([
          { label: "Scheduled", value: "1" },
          { label: "Blocked", value: "0" },
          {
            label: "Small useful slices",
            value: expect.stringContaining("20 Jul 2026"),
          },
          { label: "Warning", value: "Review this older Post." },
        ]),
        primaryAction: { label: "Open Calendar", href: "/calendar?siteId=site-1" },
        secondaryActions: [{
          label: "Open Social",
          href: "/social?siteId=site-1&postingPlan=plan-1",
        }],
      }],
    });
  });

  it("keeps a needs-attention confirmation result on the confirm capability", async () => {
    const database = createAgentDb();
    await recordReviewedPlan(database);
    const needsAttentionPlan = {
      ...proposedPlan,
      status: "needs_attention" as const,
      warnings: [
        ...proposedPlan.warnings,
        { code: "version_unavailable" as const, message: "One Version needs fresh approval." },
      ],
      items: [
        {
          ...proposedPlan.items[0],
          status: "scheduled" as const,
          publicationId: "publication-1",
        },
        {
          ...proposedPlan.items[0],
          id: "item-2",
          versionId: "version-2",
          postId: "post-2",
          sourceTitle: "A blocked Post",
          status: "blocked" as const,
          publicationId: null,
          errorMessage: "This Version needs fresh approval.",
        },
      ],
    };
    socialPublishing.confirmPostingPlan.mockResolvedValue(needsAttentionPlan);

    const response = await runTool(
      "confirm-needs-attention",
      "core_social_posting_plan_confirm",
      postingPlanConfirmationArguments(),
      "The Posting plan needs attention. No unconfirmed times were filled automatically.",
      { database, message: "Please confirm that exact Posting plan as shown." },
    );

    expect(response.specialist).toBe("core.social.posting_plan.confirm");
    const card = response.actionCards?.[0];
    expect(card).toMatchObject({
      kind: "social.posting_plan_confirmed",
      capabilityId: "core.social.posting_plan.confirm",
      title: "Posting plan needs attention",
      status: "failed",
      statusLabel: "Needs attention",
      changed: expect.arrayContaining([
        { label: "Scheduled", value: "1" },
        { label: "Blocked", value: "1" },
        { label: "Warning 1", value: "Review this older Post." },
        { label: "Warning 2", value: "One Version needs fresh approval." },
        { label: "Window starts", value: expect.stringContaining("20 Jul 2026") },
      ]),
      primaryAction: {
        label: "Review Posting plan",
        href: "/social?siteId=site-1&postingPlan=plan-1",
      },
      secondaryActions: [{ label: "Open Calendar", href: "/calendar?siteId=site-1" }],
    });
    expect(card?.changed.find((field) => field.label === "Window starts")?.value)
      .not.toContain("T00:00:00.000Z");
  });
});

async function runTool(
  callId: string,
  name: string,
  args: Record<string, unknown>,
  reply: string,
  options: {
    database?: ReturnType<typeof createAgentDb>;
    message?: string;
  } = {},
) {
  return runCoreAgentToolTurn({
    db: options.database || createAgentDb(),
    userId: "owner",
    requestId: `request-${callId}`,
    turnId: `turn-${callId}`,
    ownerTimezone: "Europe/Dublin",
    route: workersRoute([
      { tool_calls: [{ id: callId, name, arguments: args }] },
      { response: reply },
    ]) as never,
    messages: baseMessages(options.message || "Help me with my Social Post library."),
  });
}

function createAgentDb() {
  const executions: Array<Record<string, unknown>> = [];
  return {
    executions,
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async first<T>() {
          if (!sql.includes("FROM agent_tool_executions")) return null as T | null;
          const [userId, requestId, toolCallId] = values;
          return (executions.find((row) =>
            row.user_id === userId &&
            row.request_id === requestId &&
            row.tool_call_id === toolCallId
          ) || null) as T | null;
        },
        async all<T>() {
          if (!sql.includes("FROM agent_tool_executions")) {
            return { results: [] as T[] };
          }
          const [userId, toolName, excludedRequestId] = values;
          const results = executions
            .filter((row) =>
              row.user_id === userId &&
              row.tool_name === toolName &&
              row.status === "succeeded" &&
              row.request_id !== excludedRequestId &&
              typeof row.result_json === "string"
            )
            .reverse()
            .slice(0, 50)
            .map((row) => ({
              request_id: row.request_id,
              result_json: row.result_json,
            }));
          return { results: results as T[] };
        },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
            const [id, userId, requestId, toolCallId, toolName] = values;
            executions.push({
              id,
              user_id: userId,
              request_id: requestId,
              tool_call_id: toolCallId,
              tool_name: toolName,
              status: "running",
              result_json: null,
            });
          } else if (sql.includes("UPDATE agent_tool_executions")) {
            const execution = executions.find((row) => row.id === values[1]);
            if (execution && sql.includes("status = 'succeeded'")) {
              Object.assign(execution, {
                status: "succeeded",
                result_json: values[0],
                error_message: null,
              });
            }
            if (execution && sql.includes("status = 'failed'")) {
              Object.assign(execution, { status: "failed", error_message: values[0] });
            }
          }
          return { meta: { changes: 1 } };
        },
      };
    },
    async batch() {
      return [];
    },
  };
}

async function recordReviewedPlan(database: ReturnType<typeof createAgentDb>) {
  socialPublishing.createPostingPlan.mockResolvedValue(proposedPlan);
  await runTool(
    "review-plan",
    "core_social_posting_plan_create",
    postingPlanProposalArguments(),
    "Proposed 1 posting time for review. Nothing was scheduled.",
    {
      database,
      message: "Propose one approved LinkedIn Post for next week.",
    },
  );
}

function postingPlanProposalArguments() {
  return {
    accountId: proposedPlan.accountId,
    versionIds: proposedPlan.items[0].versionId,
    windowStart: proposedPlan.windowStart,
    windowEnd: proposedPlan.windowEnd,
    count: proposedPlan.requestedCount,
  };
}

function postingPlanConfirmationArguments() {
  return {
    planId: proposedPlan.id,
    expectedUpdatedAt: proposedPlan.updatedAt,
    confirmed: true,
  };
}

function baseMessages(message: string): AgentToolMessage[] {
  return [
    { role: "system", content: "You are ME3." },
    { role: "user", content: message },
  ];
}

function workersRoute(payloads: unknown[]) {
  return {
    providerId: "workers-ai" as const,
    model: "workers-test-model",
    backupModel: null,
    apiKey: null,
    ai: { run: vi.fn(async () => payloads.shift()) },
    aiGateway: null,
    configured: true,
  };
}
