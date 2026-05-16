import { describe, expect, it } from "vitest";
import {
  buildMe3AgentContextPrompt,
  createMe3AgentContextPacket,
  validateMe3AgentContextPacket,
  type Me3AgentContextSource,
} from "./agent-context";

const ownerSource: Me3AgentContextSource = {
  id: "owner",
  kind: "owner_profile",
  label: "Owner profile",
  visibility: "public",
  reason: "Always include a small owner profile.",
};

const meJsonSource: Me3AgentContextSource = {
  id: "owner-me-json",
  kind: "public_me_json",
  label: "Public me.json",
  visibility: "public",
  reason: "Public identity context for agents.",
};

describe("ME3 agent context contract", () => {
  it("serializes a stable source-labeled context packet", () => {
    const packet = createMe3AgentContextPacket({
      id: "packet-1",
      generatedAt: "2026-05-16T10:00:00.000Z",
      ownerId: "owner",
      purpose: "chat_reply",
      requestSummary: "Help reply to Ada.",
      ownerProfile: {
        displayName: "Kieran",
        username: "kieran",
        bio: "Builds ME3.",
        timezone: "Europe/Dublin",
        source: ownerSource,
      },
      publicIdentity: {
        summary: "Kieran helps people build useful agentic products.",
        meJsonUrl: "https://example.com/.well-known/me.json",
        offers: ["Product strategy"],
        actions: ["book"],
        source: meJsonSource,
      },
      privateMemory: [
        {
          id: "memory-1",
          kind: "preference",
          title: "Email tone",
          body: "Prefers short, warm, practical replies.",
          source: {
            id: "memory-1",
            kind: "private_memory",
            label: "Email tone",
            visibility: "private",
            reason: "Relevant to drafting a reply.",
          },
        },
      ],
      contacts: [
        {
          id: "contact-ada",
          name: "Ada Lovelace",
          relationship: "client",
          summary: "Working on an analytics workflow.",
          source: {
            id: "contact-ada",
            kind: "contact",
            label: "Ada Lovelace",
            visibility: "private",
            reason: "Mentioned by name.",
          },
        },
      ],
      emailThreads: [
        {
          id: "thread-1",
          subject: "Workflow notes",
          participants: ["Ada", "Kieran"],
          summary: "Ada asked for a concise update by Friday.",
          source: {
            id: "thread-1",
            kind: "email_thread",
            label: "Workflow notes",
            visibility: "private",
            reason: "Active reply context.",
          },
        },
      ],
      projects: [
        {
          id: "project-1",
          name: "Analytics Workflow",
          status: "active",
          summary: "Ship a first usable review flow.",
          source: {
            id: "project-1",
            kind: "project",
            label: "Analytics Workflow",
            visibility: "private",
            reason: "Linked to Ada.",
          },
        },
      ],
      tasks: [
        {
          id: "task-1",
          title: "Send Friday update",
          status: "open",
          dueAt: "2026-05-22",
          projectId: "project-1",
          source: {
            id: "task-1",
            kind: "task",
            label: "Send Friday update",
            visibility: "private",
            reason: "Open task for this contact.",
          },
        },
      ],
      calendarEvents: [
        {
          id: "event-1",
          title: "Ada check-in",
          startsAt: "2026-05-18T14:00:00Z",
          timezone: "Europe/Dublin",
          source: {
            id: "event-1",
            kind: "calendar_event",
            label: "Ada check-in",
            visibility: "private",
            reason: "Upcoming related meeting.",
          },
        },
      ],
      recentMessages: [
        {
          id: "message-1",
          role: "user",
          content: "Help me answer Ada.",
          source: {
            id: "message-1",
            kind: "assistant_message",
            label: "Recent chat",
            visibility: "private",
            reason: "Immediate conversation context.",
          },
        },
      ],
      budget: { maxPromptChars: 4000 },
    });

    const prompt = buildMe3AgentContextPrompt(packet);

    expect(prompt.budget.wasTrimmed).toBe(false);
    expect(prompt.text).toMatchInlineSnapshot(`
      "ME3 agent context packet:
      Schema: 2026-05-16.v1
      Purpose: chat_reply
      Owner: owner
      Request: Help reply to Ada.

      Owner profile:
      - Name: Kieran
      - Username: kieran
      - Bio: Builds ME3.
      - Timezone: Europe/Dublin
      Public identity:
      - Summary: Kieran helps people build useful agentic products.
      - me.json: https://example.com/.well-known/me.json
      - Offers: Product strategy
      - Actions: book
      Private memory
      - preference / Email tone: Prefers short, warm, practical replies.
      Contacts
      - Ada Lovelace (client): Working on an analytics workflow.
      Email threads
      - Workflow notes: Ada asked for a concise update by Friday. Participants: Ada, Kieran.
      Projects
      - Analytics Workflow [active]: Ship a first usable review flow.
      Tasks
      - Send Friday update [open] due 2026-05-22
      Calendar
      - Ada check-in starts 2026-05-18T14:00:00Z Europe/Dublin
      Recent assistant messages
      - user: Help me answer Ada.
      Context sources
      - assistant_message:message-1 [private, included] Recent chat - Immediate conversation context.
      - calendar_event:event-1 [private, included] Ada check-in - Upcoming related meeting.
      - contact:contact-ada [private, included] Ada Lovelace - Mentioned by name.
      - email_thread:thread-1 [private, included] Workflow notes - Active reply context.
      - owner_profile:owner [public, included] Owner profile - Always include a small owner profile.
      - private_memory:memory-1 [private, included] Email tone - Relevant to drafting a reply.
      - project:project-1 [private, included] Analytics Workflow - Linked to Ada.
      - public_me_json:owner-me-json [public, included] Public me.json - Public identity context for agents.
      - task:task-1 [private, included] Send Friday update - Open task for this contact."
    `);
  });

  it("trims long prompt output predictably", () => {
    const packet = createMe3AgentContextPacket({
      id: "packet-trim",
      ownerId: "owner",
      purpose: "chat_reply",
      ownerProfile: {
        displayName: "Kieran",
        source: ownerSource,
      },
      privateMemory: [
        {
          id: "memory-long",
          kind: "owner_note",
          body: "A".repeat(1000),
          source: {
            id: "memory-long",
            kind: "private_memory",
            label: "Long note",
            visibility: "private",
          },
        },
      ],
      budget: { maxPromptChars: 240 },
    });

    const prompt = buildMe3AgentContextPrompt(packet);

    expect(prompt.text.length).toBeLessThanOrEqual(240);
    expect(prompt.text).toContain("[Context trimmed to prompt budget]");
    expect(prompt.budget).toMatchObject({
      usedPromptChars: prompt.text.length,
      wasTrimmed: true,
      trimReason: "maxPromptChars",
    });
    expect(validateMe3AgentContextPacket(packet)).toEqual([]);
  });

  it("normalizes private sources away from public visibility", () => {
    const packet = createMe3AgentContextPacket({
      id: "packet-privacy",
      ownerId: "owner",
      purpose: "chat_reply",
      publicIdentity: {
        summary: "Public identity stays public.",
        source: meJsonSource,
      },
      privateMemory: [
        {
          id: "memory-private",
          kind: "learning",
          body: "This is private.",
          source: {
            id: "memory-private",
            kind: "private_memory",
            label: "Private learning",
            visibility: "public",
          },
        },
      ],
      contacts: [
        {
          id: "contact-private",
          name: "Private Contact",
          source: {
            id: "contact-private",
            kind: "contact",
            label: "Private Contact",
            visibility: "public",
          },
        },
      ],
    });

    expect(packet.publicIdentity?.source.visibility).toBe("public");
    expect(packet.privateMemory[0]?.source.visibility).toBe("private");
    expect(packet.contacts[0]?.source.visibility).toBe("private");
    expect(packet.sources.find((source) => source.id === "memory-private")).toMatchObject({
      visibility: "private",
    });
    expect(validateMe3AgentContextPacket(packet)).toEqual([]);
  });
});
