export const JOURNAL_PLUGIN_ID = "me3.journal";

export const JOURNAL_RUNTIME = {
  id: JOURNAL_PLUGIN_ID,
  packageName: "@me3-core/plugin-journal",
  bundled: true,
  runtimeStatus: "journal_workspace",
  defaultRoute: "/journal",
  notes: [
    "Core bundles Journal as an optional first-party private writing workspace.",
    "Journal entries are owner-scoped and plugin-owned.",
    "Assistant actions and operational review stay outside this plugin boundary.",
  ],
} as const;

export type JournalBodyFormat = "plain_text" | "markdown" | "html";

export function normalizeJournalDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : normalized;
}

export function normalizeJournalBodyFormat(
  value: unknown,
): JournalBodyFormat | null {
  if (value === "plain_text" || value === "markdown" || value === "html") {
    return value;
  }
  return null;
}
