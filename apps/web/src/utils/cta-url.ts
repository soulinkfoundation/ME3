export function normalizeCtaUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (value.startsWith("#")) {
    return value.length > 1 ? value : null;
  }

  if (/^(?:\/|\.\.?\/)(?!\/)/.test(value)) {
    return value;
  }

  if (/^mailto:/i.test(value)) {
    return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) ? value : null;
  }

  if (/^tel:/i.test(value)) {
    return /^tel:\+?[0-9().\s-]{3,}$/i.test(value) ? value : null;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(value)) {
    return normalizeCtaUrl(`https://${value}`);
  }

  return null;
}
