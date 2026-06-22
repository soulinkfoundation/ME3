export function decodeMimeHeaderValue(value: string): string {
  if (!/=\?[^?]+\?[bq]\?[^?]*\?=/i.test(value)) return value;
  return value
    .replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)\s+(?==\?[^?]+\?[bq]\?)/gi, "$1")
    .replace(
      /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,
      (_match, charset: string, encoding: string, encoded: string) => {
        const bytes =
          encoding.toLowerCase() === "b"
            ? decodeMimeBBytes(encoded)
            : decodeMimeQBytes(encoded);
        try {
          return new TextDecoder(charset).decode(bytes);
        } catch {
          try {
            return new TextDecoder("utf-8").decode(bytes);
          } catch {
            return encoded;
          }
        }
      },
    );
}

export function parseEmailAddressHeader(
  value: unknown,
): { name: string | null; address: string } | null {
  const decoded = decodeMimeHeaderValue(
    typeof value === "string" ? value.trim() : "",
  );
  if (!decoded) return null;
  const angleMatch = decoded.match(/^(.*?)<([^<>\s@]+@[^<>\s@]+)>/);
  if (angleMatch) {
    const name = angleMatch[1].trim().replace(/^"|"$/g, "");
    return {
      name: name || null,
      address: angleMatch[2].trim().toLowerCase(),
    };
  }
  const emailMatch = decoded.match(/[^\s<>@]+@[^\s<>@]+/);
  return emailMatch ? { name: null, address: emailMatch[0].toLowerCase() } : null;
}

function decodeMimeBBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replace(/\s/g, "")), (char) =>
    char.charCodeAt(0),
  );
}

function decodeMimeQBytes(value: string): Uint8Array {
  const decoded = value
    .replace(/_/g, " ")
    .replace(/=([0-9a-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0) & 0xff);
}
