export function isContextFreeLiteralResponseRequest(input: string): boolean {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text || text.length > 160) return false;

  const match = text.match(
    /^(?:reply|respond|answer)(?:\s+to\s+(?:this|me))?\s+(?:with\s+)?(?:exactly|only)\s+(.+)$/i,
  );
  if (!match) return false;

  const literal = match[1]?.trim() || "";
  return (
    /^"[^"\n]{1,80}"[.!]?$/.test(literal) ||
    /^'[^'\n]{1,80}'[.!]?$/.test(literal) ||
    /^`[^`\n]{1,80}`[.!]?$/.test(literal) ||
    /^[A-Z0-9][A-Z0-9 _.,!?-]{0,39}$/.test(literal)
  );
}
