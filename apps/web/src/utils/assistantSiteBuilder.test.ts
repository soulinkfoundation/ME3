import { describe, expect, it } from "vitest";
import type { AgentChatActionCard } from "./agentChat";
import {
  ASSISTANT_SITE_BUILDER_STARTER_PROMPT,
  assistantSitePageHasUnpublishedChanges,
  findLatestAssistantSitePreview,
  isAssistantSiteBuilderThread,
} from "./assistantSiteBuilder";

describe("assistant site publication state", () => {
  it("detects a draft saved after the current published revision", () => {
    expect(
      assistantSitePageHasUnpublishedChanges({
        publishedAt: "2026-08-28 12:30:00",
        updatedAt: "2026-08-28 12:34:00",
      }),
    ).toBe(true);
    expect(
      assistantSitePageHasUnpublishedChanges({
        publishedAt: "2026-08-28 12:34:00",
        updatedAt: "2026-08-28 12:34:00",
      }),
    ).toBe(false);
  });
});

describe("assistant site builder mode", () => {
  it("recognizes the completed site-builder starter prompt", () => {
    expect(
      isAssistantSiteBuilderThread([
        {
          role: "user",
          text: `${ASSISTANT_SITE_BUILDER_STARTER_PROMPT}a weekend yoga retreat`,
        },
      ]),
    ).toBe(true);
  });

  it("keeps the short-lived site scope kickoff compatible", () => {
    expect(isAssistantSiteBuilderThread([{ role: "user", text: "@site" }])).toBe(
      true,
    );
  });

  it("recognizes chats created with the previous polished starter prompt", () => {
    expect(
      isAssistantSiteBuilderThread([
        {
          role: "user",
          text: "Build me a polished landing page site for a yoga retreat",
        },
      ]),
    ).toBe(true);
  });

  it("recognizes site-builder chats created with the legacy prompt", () => {
    expect(
      isAssistantSiteBuilderThread([
        {
          role: "user",
          text: "Help me build a new ME3 site. Start by asking what it is for.",
        },
      ]),
    ).toBe(true);
  });

  it("does not treat ordinary scoped site edits as site-builder chats", () => {
    expect(
      isAssistantSiteBuilderThread([
        { role: "user", text: "@site update my existing profile bio" },
      ]),
    ).toBe(false);
  });
});

describe("assistant site builder preview", () => {
  it("uses the latest landing-page preview action", () => {
    const first = landingPageCard("first", "/api/sites/me/pages/first/preview-html");
    const latest = landingPageCard("latest", "/api/sites/me/pages/latest/preview-html");

    expect(
      findLatestAssistantSitePreview([
        { actionCards: [first] },
        { actionCards: [] },
        { id: "message-latest", actionCards: [latest] },
      ]),
    ).toEqual({
      href: "/api/sites/me/pages/latest/preview-html",
      title: "Latest page",
      statusLabel: "Draft",
      siteUsername: "me",
      pageId: "latest",
      editorHref: "/sites/me/pages/latest",
      revision: "message-latest",
    });
  });

  it("changes the preview revision when the same page is updated again", () => {
    const created = landingPageCard("page", "/preview");
    const updated = landingPageCard("page", "/preview");
    updated.id = "landing-page:page:updated";

    expect(
      findLatestAssistantSitePreview([
        { id: "message-created", actionCards: [created] },
        { id: "message-updated", actionCards: [updated] },
      ])?.revision,
    ).toBe("message-updated");
  });

  it("ignores action cards that do not expose a site preview", () => {
    const card = landingPageCard("draft", "/preview");
    card.records = [{ kind: "reminder", id: "reminder-1" }];

    expect(findLatestAssistantSitePreview([{ actionCards: [card] }])).toBeNull();
  });

  it("keeps the former primary editor action as the advanced fallback", () => {
    const card = landingPageCard("legacy", "/preview");
    card.primaryAction = {
      label: "Open draft",
      href: "/sites/me/pages/legacy",
    };
    card.secondaryActions = [{ label: "Preview", href: "/preview" }];

    expect(findLatestAssistantSitePreview([{ actionCards: [card] }])?.editorHref)
      .toBe("/sites/me/pages/legacy");
  });
});

function landingPageCard(id: string, href: string): AgentChatActionCard {
  return {
    id,
    kind: "sites.landing_page_created",
    capabilityId: "core.sites.landing_page.create",
    title: "Landing page created",
    summary: `${id[0]?.toUpperCase()}${id.slice(1)} page`,
    status: "complete",
    statusLabel: "Draft",
    changed: [],
    records: [
      { kind: "site", id: "me" },
      { kind: "landing_page", id },
    ],
    primaryAction: null,
    secondaryActions: [
      { label: "Preview", href },
      { label: "Advanced editor", href: `/sites/me/pages/${id}` },
    ],
  };
}
