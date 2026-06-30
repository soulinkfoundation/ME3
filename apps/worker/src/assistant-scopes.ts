export const ASSISTANT_SITE_SCOPE = "site" as const;

export type AssistantScope = typeof ASSISTANT_SITE_SCOPE;

export type AssistantScopeParseResult = {
  cleanMessageText: string;
  scopes: AssistantScope[];
  scopeTokens: string[];
};

export function parseAssistantScopes(
  messageText: string,
  explicitScopes?: unknown,
): AssistantScopeParseResult {
  let cleanMessageText = messageText.trim();
  const scopeTokens: string[] = [];
  const parsedScopes: AssistantScope[] = [];

  while (true) {
    const match = cleanMessageText.match(/^@site(?=$|\s)/i);
    if (!match) break;
    scopeTokens.push(match[0]);
    parsedScopes.push(ASSISTANT_SITE_SCOPE);
    cleanMessageText = cleanMessageText.slice(match[0].length).trimStart();
  }

  const scopes = uniqueAssistantScopes([
    ...parsedScopes,
    ...normalizeExplicitAssistantScopes(explicitScopes),
  ]);

  return {
    cleanMessageText: cleanMessageText.trim(),
    scopes,
    scopeTokens,
  };
}

export function assistantScopesIncludeSite(scopes: AssistantScope[]) {
  return scopes.includes(ASSISTANT_SITE_SCOPE);
}

function normalizeExplicitAssistantScopes(value: unknown): AssistantScope[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((scope) => (typeof scope === "string" ? scope.trim().toLowerCase() : ""))
    .filter((scope): scope is AssistantScope => scope === ASSISTANT_SITE_SCOPE);
}

function uniqueAssistantScopes(scopes: AssistantScope[]): AssistantScope[] {
  return [...new Set(scopes)];
}
