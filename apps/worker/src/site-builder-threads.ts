type SiteBuilderThreadDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[] }>;
    };
  };
};

type SiteBuilderMessageRow = {
  thread_id: string;
  metadata_json: string;
};

export async function listLatestSiteBuilderThreads(
  db: SiteBuilderThreadDb,
  ownerId: string,
  siteUsernames: Iterable<string>,
): Promise<Map<string, string>> {
  const remaining = new Set(siteUsernames);
  const threads = new Map<string, string>();
  if (remaining.size === 0) return threads;

  const result = await db.prepare(
    `SELECT messages.thread_id, messages.metadata_json
     FROM assistant_messages AS messages
     INNER JOIN assistant_threads AS threads
       ON threads.id = messages.thread_id
      AND threads.owner_id = messages.owner_id
     WHERE messages.owner_id = ?
       AND messages.role = 'assistant'
       AND threads.status != 'deleted'
     ORDER BY messages.created_at DESC
     LIMIT 500`,
  )
    .bind(ownerId)
    .all<SiteBuilderMessageRow>();

  for (const row of result.results || []) {
    for (const username of siteUsernamesFromMetadata(row.metadata_json)) {
      if (!remaining.has(username)) continue;
      threads.set(username, row.thread_id);
      remaining.delete(username);
    }
    if (remaining.size === 0) break;
  }

  return threads;
}

export function siteUsernamesFromMetadata(metadataJson: string): string[] {
  try {
    const metadata = JSON.parse(metadataJson) as { actionCards?: unknown };
    if (!Array.isArray(metadata.actionCards)) return [];
    return metadata.actionCards.flatMap((card) => {
      if (!card || typeof card !== "object") return [];
      const records = (card as { records?: unknown }).records;
      if (!Array.isArray(records)) return [];
      return records.flatMap((record) => {
        if (!record || typeof record !== "object") return [];
        const candidate = record as { kind?: unknown; id?: unknown };
        return candidate.kind === "site" && typeof candidate.id === "string"
          ? [candidate.id]
          : [];
      });
    });
  } catch {
    return [];
  }
}
