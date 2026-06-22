import { describe, expect, it } from "vitest";
import {
  formatAgentRuntimeDetail,
  formatAgentRuntimeMetadata,
  formatAgentTraceRows,
  normalizeAgentActionCards,
  resolveAgentReplyText,
  resolveAgentSiteActionLink,
} from "./agentChat";

describe("agent chat utils", () => {
  it("hides runtime metadata by default", () => {
    expect(
      formatAgentRuntimeMetadata({
        specialist: "supervisor.reminders.create",
        replyText: "All set",
        model: "gpt-4o-mini",
        source: "openai",
      }),
    ).toBeNull();
  });

  it("formats runtime metadata when explicitly enabled", () => {
    expect(
      formatAgentRuntimeMetadata(
        {
          specialist: "supervisor.reminders.create",
          replyText: "All set",
          model: "gpt-4o-mini",
          source: "openai",
        },
        { showRuntimeMetadata: true },
      ),
    ).toBe("openai · gpt-4o-mini · supervisor.reminders.create");
  });

  it("includes context summaries in development metadata", () => {
    expect(
      formatAgentRuntimeMetadata(
        {
          specialist: "core.agent-chat",
          replyText: "All set",
          model: "gpt-4o-mini",
          source: "openai",
          contextSummary: "Used context from: 1 contact.",
        },
        { showRuntimeMetadata: true },
      ),
    ).toBe("openai · gpt-4o-mini · core.agent-chat · Used context from: 1 contact.");
  });

  it("combines fallback detail when both values exist", () => {
    expect(
      formatAgentRuntimeDetail({
        fallbackReason: "provider_timeout",
        debugError: "gateway unavailable",
      }),
    ).toBe("provider_timeout: gateway unavailable");
  });

  it("returns a friendly fallback when reply text is empty", () => {
    expect(resolveAgentReplyText("   ")).toBe(
      "I couldn't turn that into a useful reply just yet. Please try again.",
    );
  });

  it("formats assistant turn trace rows for the development UI", () => {
    expect(
      formatAgentTraceRows({
        turnId: "turn-1",
        planner: {
          kind: "write_action",
          confidence: 0.94,
          capabilityId: "core.reminders.create",
        },
        route: {
          path: "tool",
          capabilityId: "core.reminders.create",
          approvalRequired: false,
          reason: "direct reminder request",
        },
        selectedModel: null,
        context: {
          status: "loaded",
          sourceCount: 2,
          packetId: "packet-1",
        },
        modelCall: {
          status: "not_attempted",
          attempts: [],
        },
        toolResult: {
          status: "succeeded",
          specialist: "core.reminders.create",
        },
        audit: {
          auditId: "audit-1",
        },
      }),
    ).toEqual([
      { label: "Turn", value: "turn-1" },
      {
        label: "Planner",
        value: "write_action · confidence 0.94 · core.reminders.create",
      },
      { label: "Route", value: "tool · core.reminders.create" },
      { label: "Model", value: "not_attempted" },
      { label: "Context", value: "loaded · 2 sources · packet-1" },
      { label: "Tool", value: "succeeded · core.reminders.create" },
      { label: "Audit", value: "audit-1" },
      { label: "Reason", value: "direct reminder request" },
    ]);
  });

  it("hides assistant turn trace rows when no trace is present", () => {
    expect(formatAgentTraceRows(null)).toEqual([]);
  });

  it("creates review links for assistant site draft actions", () => {
    expect(
      resolveAgentSiteActionLink({
        siteAction: {
          kind: "draft_created",
          url: "http://localhost:4000/sites/test?edit=blog",
          postTitle: "Open Source AI",
          pending: true,
          published: false,
        },
      }),
    ).toEqual({
      href: "http://localhost:4000/sites/test?edit=blog",
      label: "Review blog draft",
    });
  });

  it("creates dashboard links for assistant site publish actions", () => {
    expect(
      resolveAgentSiteActionLink({
        siteAction: {
          kind: "published",
          url: "http://localhost:4000/sites/test",
          postTitle: "Open Source AI",
          pending: false,
          published: true,
        },
      }),
    ).toEqual({
      href: "http://localhost:4000/sites/test",
      label: "Open site dashboard",
    });
  });

  it("normalizes trusted assistant action cards", () => {
    expect(
      normalizeAgentActionCards([
        {
          id: "mailbox-draft:draft-1",
          kind: "mailbox.draft_saved",
          capabilityId: "core.mailbox.draft",
          title: "Email draft saved",
          summary: "Saved to mailbox drafts.",
          status: "pending_approval",
          statusLabel: "Needs review",
          changed: [
            { label: "To", value: "ada@example.com" },
            { label: "Subject", value: "Launch notes" },
          ],
          records: [{ kind: "mailbox_draft", id: "draft-1" }],
          primaryAction: { label: "Review draft", href: "/email" },
          secondaryActions: [{ label: "External", href: "https://example.com" }],
        },
      ]),
    ).toEqual([
      {
        id: "mailbox-draft:draft-1",
        kind: "mailbox.draft_saved",
        capabilityId: "core.mailbox.draft",
        title: "Email draft saved",
        summary: "Saved to mailbox drafts.",
        status: "pending_approval",
        statusLabel: "Needs review",
        changed: [
          { label: "To", value: "ada@example.com" },
          { label: "Subject", value: "Launch notes" },
        ],
        records: [{ kind: "mailbox_draft", id: "draft-1" }],
        primaryAction: { label: "Review draft", href: "/email" },
        secondaryActions: [],
      },
    ]);
  });
});
