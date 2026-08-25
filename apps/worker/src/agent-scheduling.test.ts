import { describe, expect, it, vi } from "vitest";
import {
  intersectAgentSchedulingSlots,
  isAgentSchedulingSlotAuthorized,
  parseAgentSchedulingRelayMessage,
  resolveAgentSchedulingDefaults,
} from "./agent-scheduling";
import {
  runCoreAgentToolTurn,
  type AgentToolMessage,
  type CoreSchedulingToolServices,
} from "@me3-core/plugin-agent-chat";
import type { SchedulingRequestSlot } from "./scheduling";

describe("ME3 agent scheduling", () => {
  it("defaults an underspecified booking request to 30 minutes and seven local days", () => {
    expect(
      resolveAgentSchedulingDefaults(
        {},
        "Europe/Dublin",
        new Date("2026-08-19T12:00:00.000Z"),
      ),
    ).toEqual({
      durationMinutes: 30,
      dateRange: { start: "2026-08-19", end: "2026-08-25" },
      usedDefaultDuration: true,
      usedDefaultDateRange: true,
    });
  });

  it("keeps an explicit duration and completes a partial date window", () => {
    expect(
      resolveAgentSchedulingDefaults(
        { durationMinutes: 45, dateFrom: "2026-09-01" },
        "Europe/Dublin",
        new Date("2026-08-19T12:00:00.000Z"),
      ),
    ).toEqual({
      durationMinutes: 45,
      dateRange: { start: "2026-09-01", end: "2026-09-07" },
      usedDefaultDuration: false,
      usedDefaultDateRange: true,
    });
  });

  it("shares only exact mutual availability", () => {
    const first = slot("2026-08-20T09:00:00.000Z", "2026-08-20T09:30:00.000Z");
    const second = slot("2026-08-20T10:00:00.000Z", "2026-08-20T10:30:00.000Z");
    expect(intersectAgentSchedulingSlots([first, second], [second])).toEqual([second]);
  });

  it("books only an exact slot from the recipient-authorized set", () => {
    const authorized = slot("2026-08-20T09:00:00.000Z", "2026-08-20T09:30:00.000Z");
    const changed = slot("2026-08-20T09:15:00.000Z", "2026-08-20T09:45:00.000Z");
    expect(isAgentSchedulingSlotAuthorized(authorized, [authorized])).toBe(true);
    expect(isAgentSchedulingSlotAuthorized(changed, [authorized])).toBe(false);
  });

  it("rejects scheduling envelopes without a verified shape", () => {
    expect(parseAgentSchedulingRelayMessage({
      version: "2026-08-19",
      kind: "schedule.request",
      requestId: "request-1",
      sourceNodeId: "source",
      sourceName: "Source",
      targetNodeId: "target",
      durationMinutes: 30,
      dateRange: { start: "2026-08-20", end: "2026-08-26" },
      reason: null,
      candidateSlots: [],
      selectedSlot: null,
    })).toBeNull();
  });

  it("requires bounded timestamps on the current scheduling envelope", () => {
    const candidate = slot("2026-08-25T09:00:00.000Z", "2026-08-25T09:30:00.000Z");
    const envelope = {
      version: "2026-08-24",
      kind: "schedule.request",
      requestId: "request-2",
      sourceNodeId: "source",
      sourceName: "Source",
      targetNodeId: "target",
      durationMinutes: 30,
      dateRange: { start: "2026-08-25", end: "2026-08-31" },
      reason: null,
      candidateSlots: [candidate],
      selectedSlot: null,
    };

    expect(parseAgentSchedulingRelayMessage(envelope)).toBeNull();
    expect(parseAgentSchedulingRelayMessage({
      ...envelope,
      issuedAt: "2026-08-24T12:00:00.000Z",
      expiresAt: "2026-08-26T12:00:00.000Z",
    })).toMatchObject({
      version: "2026-08-24",
      kind: "schedule.request",
      requestId: "request-2",
      issuedAt: "2026-08-24T12:00:00.000Z",
      expiresAt: "2026-08-26T12:00:00.000Z",
    });
  });

  it("accepts a current decline envelope without exposing candidate slots", () => {
    expect(parseAgentSchedulingRelayMessage({
      version: "2026-08-24",
      kind: "schedule.decline",
      requestId: "request-3",
      sourceNodeId: "source",
      sourceName: "Source",
      targetNodeId: "target",
      durationMinutes: 30,
      dateRange: { start: "2026-08-25", end: "2026-08-31" },
      reason: "Not this week",
      candidateSlots: [],
      selectedSlot: null,
      meetingUrl: "https://soulinkfoundation.org/calls/@source",
      issuedAt: "2026-08-24T12:00:00.000Z",
      expiresAt: "2026-08-26T12:00:00.000Z",
    })).toMatchObject({
      kind: "schedule.decline",
      candidateSlots: [],
      selectedSlot: null,
      meetingUrl: "https://soulinkfoundation.org/calls/@source",
    });
  });

  it("accepts only a grant-backed free one-to-one network relay", () => {
    const candidate = slot("2026-08-25T09:00:00.000Z", "2026-08-25T09:30:00.000Z");
    const envelope = {
      version: "2026-08-25",
      kind: "schedule.request",
      requestId: "network-request",
      sourceNodeId: "source",
      sourceName: "Source",
      targetNodeId: "target",
      durationMinutes: 30,
      dateRange: { start: "2026-08-25", end: "2026-08-31" },
      reason: null,
      candidateSlots: [candidate],
      selectedSlot: null,
      meetingUrl: "https://soulinkfoundation.org/calls/@source",
      target: { kind: "public_profile", id: "profile-target" },
      request: { kind: "meeting", participantMode: "one_to_one", paymentMode: "free" },
      access: {
        path: "public_profile",
        profileId: "profile-target",
        grantId: "network-grant",
      },
      issuedAt: "2026-08-24T12:00:00.000Z",
      expiresAt: "2026-08-26T12:00:00.000Z",
    };

    expect(parseAgentSchedulingRelayMessage(envelope)).toMatchObject({
      version: "2026-08-25",
      target: { kind: "public_profile", id: "profile-target" },
      access: { profileId: "profile-target", grantId: "network-grant" },
    });
    expect(parseAgentSchedulingRelayMessage({
      ...envelope,
      access: { ...envelope.access, profileId: "another-profile" },
    })).toBeNull();
  });

  it("lets the model request scheduling without asking for duration or dates", async () => {
    const database = createExecutionDb();
    const request = vi.fn<CoreSchedulingToolServices["request"]>(async (input) => ({
      contactName: input.contact,
      durationMinutes: 30,
      dateRange: { start: "2026-08-19", end: "2026-08-25" },
      usedDefaultDuration: true,
      usedDefaultDateRange: true,
      status: "options_ready",
      options: [{
        option: 1,
        label: "Thu, 20 Aug, 10:00–10:30 Europe/Dublin",
        startsAt: "2026-08-20T09:00:00.000Z",
        endsAt: "2026-08-20T09:30:00.000Z",
      }],
    }));
    const services: CoreSchedulingToolServices = {
      async searchContacts() {
        return { contacts: [], total: 0 };
      },
      request,
      async approve() {
        throw new Error("not used");
      },
      async decline() {
        throw new Error("not used");
      },
    };
    const aiRun = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [{
          id: "schedule-1",
          name: "core_scheduling_request",
          arguments: { contact: "Sarah" },
        }],
      })
      .mockResolvedValueOnce({
        response: "I found one mutual option with Sarah. Nothing is booked yet.",
      });

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "schedule-request",
      turnId: "schedule-turn",
      ownerTimezone: "Europe/Dublin",
      route: {
        providerId: "workers-ai",
        model: "workers-test-model",
        backupModel: null,
        apiKey: null,
        ai: { run: aiRun },
        aiGateway: null,
        configured: true,
      } as never,
      messages: baseMessages("Arrange a catch-up with Sarah."),
      schedulingServices: services,
    });

    expect(request).toHaveBeenCalledWith(
      {
        contact: "Sarah",
        durationMinutes: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        reason: undefined,
      },
      expect.any(String),
    );
    expect(aiRun.mock.calls[0]?.[1]).toMatchObject({
      tools: [{ function: { name: "core_scheduling_request" } }],
      tool_choice: {
        type: "function",
        function: { name: "core_scheduling_request" },
      },
    });
    expect(response).toMatchObject({
      specialist: "core.scheduling.request",
      replyText: "I found one mutual option with Sarah. Nothing is booked yet.",
    });
  });

  it("uses the stable directory profile identity for an explicit network request", async () => {
    const database = createExecutionDb();
    const requestNetwork = vi.fn<NonNullable<CoreSchedulingToolServices["requestNetwork"]>>(
      async () => ({
        contactName: "Aoife Lens",
        durationMinutes: 30,
        dateRange: { start: "2026-08-25", end: "2026-08-31" },
        usedDefaultDuration: true,
        usedDefaultDateRange: true,
        status: "waiting_for_target_review",
        options: [],
      }),
    );
    const services: CoreSchedulingToolServices = {
      async searchContacts() {
        return { contacts: [], total: 0 };
      },
      async request() {
        throw new Error("contact flow must not be used");
      },
      requestNetwork,
      async approve() {
        throw new Error("not used");
      },
      async decline() {
        throw new Error("not used");
      },
    };
    const aiRun = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [{
          id: "network-schedule-1",
          name: "core_network_scheduling_request",
          arguments: { profileId: "profile-aoife", confirmed: true },
        }],
      })
      .mockResolvedValueOnce({
        response: "I sent Aoife a meeting request without adding her as a contact.",
      });

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "network-schedule-request",
      turnId: "network-schedule-turn",
      ownerTimezone: "Europe/Dublin",
      route: {
        providerId: "workers-ai",
        model: "workers-test-model",
        backupModel: null,
        apiKey: null,
        ai: { run: aiRun },
        aiGateway: null,
        configured: true,
      } as never,
      messages: [
        { role: "system", content: "You are ME3." },
        {
          role: "assistant",
          content: "2. Aoife Lens\nME3 profile reference: profile-aoife",
        },
        { role: "user", content: "Schedule a meeting with the second result." },
      ],
      schedulingServices: services,
    });

    expect(requestNetwork).toHaveBeenCalledWith({
      target: { kind: "public_profile", profileId: "profile-aoife" },
      request: { kind: "meeting", participantMode: "one_to_one", paymentMode: "free" },
      durationMinutes: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      reason: undefined,
    }, expect.any(String));
    expect(aiRun.mock.calls[0]?.[1]).toMatchObject({
      tools: [{ function: { name: "core_network_scheduling_request" } }],
      tool_choice: {
        type: "function",
        function: { name: "core_network_scheduling_request" },
      },
    });
    expect(response).toMatchObject({
      specialist: "core.network.scheduling.request",
    });
  });

  it("forces an explicit scheduling approval after an incoming Soulink request", async () => {
    const database = createExecutionDb();
    const approve = vi.fn<CoreSchedulingToolServices["approve"]>(async () => ({
      contactName: "Sarah",
      status: "availability_shared",
      selectedOption: null,
    }));
    const services: CoreSchedulingToolServices = {
      async searchContacts() {
        return { contacts: [], total: 0 };
      },
      async request() {
        throw new Error("not used");
      },
      approve,
      async decline() {
        throw new Error("not used");
      },
    };
    const aiRun = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [{
          id: "approve-1",
          name: "core_scheduling_approve",
          arguments: { contact: "Sarah", confirmed: true },
        }],
      })
      .mockResolvedValueOnce({
        response: "I approved sharing availability with Sarah.",
      });

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "schedule-approval",
      turnId: "schedule-approval-turn",
      ownerTimezone: "Europe/Dublin",
      route: {
        providerId: "workers-ai",
        model: "workers-test-model",
        backupModel: null,
        apiKey: null,
        ai: { run: aiRun },
        aiGateway: null,
        configured: true,
      } as never,
      messages: [
        { role: "system", content: "You are ME3." },
        {
          role: "assistant",
          content:
            "Sarah's ME3 assistant asked to compare availability. Reply “approve availability” to share only mutual free slots, or “decline” to refuse.",
        },
        { role: "user", content: "Approve availability." },
      ],
      schedulingServices: services,
    });

    expect(approve).toHaveBeenCalledWith(
      { contact: "Sarah", option: undefined, confirmed: true },
      expect.any(String),
    );
    expect(aiRun.mock.calls[0]?.[1]).toMatchObject({
      tools: [{ function: { name: "core_scheduling_approve" } }],
      tool_choice: {
        type: "function",
        function: { name: "core_scheduling_approve" },
      },
    });
    expect(response).toMatchObject({
      specialist: "core.scheduling.approve",
      replyText: "I approved sharing availability with Sarah.",
    });
  });
});

function slot(startsAt: string, endsAt: string): SchedulingRequestSlot {
  return {
    startsAt,
    endsAt,
    timezone: "Europe/Dublin",
    localDate: startsAt.slice(0, 10),
    localStartTime: startsAt.slice(11, 16),
    localEndDate: endsAt.slice(0, 10),
    localEndTime: endsAt.slice(11, 16),
  };
}

function baseMessages(message: string): AgentToolMessage[] {
  return [
    { role: "system", content: "You are ME3." },
    { role: "user", content: message },
  ];
}

function createExecutionDb() {
  const executions: Array<{
    id: string;
    user_id: string;
    request_id: string;
    tool_call_id: string;
    tool_name: string;
    status: "running" | "succeeded" | "failed";
    result_json: string | null;
    error_message: string | null;
  }> = [];
  return {
    db: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first<T>() {
                if (!sql.includes("FROM agent_tool_executions")) return null as T;
                return (executions.find((item) =>
                  item.user_id === values[0] &&
                  item.request_id === values[1] &&
                  item.tool_call_id === values[2]) || null) as T;
              },
              async all<T>() {
                return { results: [] as T[] };
              },
              async run() {
                if (sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
                  executions.push({
                    id: values[0] as string,
                    user_id: values[1] as string,
                    request_id: values[2] as string,
                    tool_call_id: values[3] as string,
                    tool_name: values[4] as string,
                    status: "running",
                    result_json: null,
                    error_message: null,
                  });
                }
                if (sql.includes("UPDATE agent_tool_executions")) {
                  const execution = executions.find((item) => item.id === values[1]);
                  if (execution && sql.includes("status = 'succeeded'")) {
                    execution.status = "succeeded";
                    execution.result_json = values[0] as string;
                  }
                  if (execution && sql.includes("status = 'failed'")) {
                    execution.status = "failed";
                    execution.error_message = values[0] as string;
                  }
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
    executions,
  };
}
