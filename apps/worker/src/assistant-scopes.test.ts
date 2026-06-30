import { describe, expect, it } from "vitest";
import { parseAssistantScopes } from "./assistant-scopes";

describe("parseAssistantScopes", () => {
  it("strips a leading standalone site scope", () => {
    expect(parseAssistantScopes("@site update my bio")).toEqual({
      cleanMessageText: "update my bio",
      scopes: ["site"],
      scopeTokens: ["@site"],
    });
  });

  it("keeps usernames after the site scope available to downstream routing", () => {
    expect(parseAssistantScopes("@site update @owner bio")).toEqual({
      cleanMessageText: "update @owner bio",
      scopes: ["site"],
      scopeTokens: ["@site"],
    });
  });

  it("does not treat non-leading or non-standalone mentions as scopes", () => {
    expect(parseAssistantScopes("update @site bio")).toMatchObject({
      cleanMessageText: "update @site bio",
      scopes: [],
      scopeTokens: [],
    });
    expect(parseAssistantScopes("@sitewide update bio")).toMatchObject({
      cleanMessageText: "@sitewide update bio",
      scopes: [],
      scopeTokens: [],
    });
  });

  it("accepts explicit site scopes for future UI affordances", () => {
    expect(parseAssistantScopes("update my bio", ["site", "mail", " SITE "])).toMatchObject({
      cleanMessageText: "update my bio",
      scopes: ["site"],
      scopeTokens: [],
    });
  });
});
