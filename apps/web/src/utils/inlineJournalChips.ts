export type InlineTextMatch = {
  start: number;
  end: number;
};

function normalizeWithMap(value: string) {
  let normalized = "";
  const map: number[] = [];
  let inSpace = true;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/.test(char)) {
      if (!inSpace && normalized.length > 0) {
        normalized += " ";
        map.push(index);
        inSpace = true;
      }
      continue;
    }

    normalized += char.toLowerCase();
    map.push(index);
    inSpace = false;
  }

  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }

  return { normalized, map };
}

export function findInlineTextMatch(
  text: string,
  sourceText: string,
): InlineTextMatch | null {
  const haystack = normalizeWithMap(text);
  const needle = normalizeWithMap(sourceText);
  if (!needle.normalized) return null;

  const index = haystack.normalized.indexOf(needle.normalized);
  if (index === -1) return null;

  const start = haystack.map[index] ?? 0;
  const endMapIndex = index + needle.normalized.length - 1;
  const end = (haystack.map[endMapIndex] ?? start) + 1;
  return { start, end };
}
