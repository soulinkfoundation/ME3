import {
  createMe3AgentContextManifest,
  createMe3AgentContextPacket,
  summarizeMe3AgentContextManifest,
  type Me3AgentContextBudget,
  type Me3AgentContextManifest,
  type Me3AgentContextProject,
  type Me3AgentContextSource,
} from "@me3/knowledge";

type OwnerSnapshotStatement = {
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
};

export type OwnerSnapshotDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): OwnerSnapshotStatement;
  };
};

export type OwnerSnapshotProfile = {
  id: string;
  name: string | null;
  username: string | null;
  timezone: string | null;
  assistantName: string;
};

export type OwnerSnapshotContext = {
  prompt: string;
  manifest: Me3AgentContextManifest;
  summary: string;
  characterCount: number;
};

type MissionSnapshotRow = {
  mission_statement: string | null;
  settings_json: string | null;
  updated_at: string | null;
};

type WheelSnapshotRow = {
  segments_json: string | null;
  notes_json: string | null;
};

type ProjectSnapshotRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  status: string | null;
  source_ref: string | null;
  updated_at: string | null;
  open_task_count: number | string | null;
};

type MeJsonSnapshotRow = {
  content: unknown;
  path: string;
  updated_at: string | null;
};

const OWNER_SNAPSHOT_PROMPT_BUDGET_CHARS = 8_000;
const MAX_ME_JSON_SNAPSHOT_CHARS = 2_600;
const MAX_PROJECT_DESCRIPTION_CHARS = 240;
const DEFAULT_MISSION_STATEMENT_TEMPLATE_MARKER = "[who/what]";

export async function loadOwnerSnapshotContext(input: {
  db: OwnerSnapshotDb;
  ownerId: string;
  owner: OwnerSnapshotProfile | null;
  meJsonUrl: string | null;
}): Promise<OwnerSnapshotContext> {
  const [missionRow, wheelRow, projectRows, meJsonRow] = await Promise.all([
    loadMissionSnapshot(input.db, input.ownerId),
    loadWheelSnapshot(input.db, input.ownerId),
    loadProjectSnapshots(input.db, input.ownerId),
    loadMeJsonSnapshot(input.db, input.ownerId),
  ]);

  const missionStatement = normalizeMissionStatement(missionRow?.mission_statement);
  const goals = resolveGoals(missionRow?.settings_json, wheelRow);
  const meJson = parseMeJson(meJsonRow?.content);
  const compactMeJson = compactMeJsonForPrompt(meJson);
  const projects = projectRows.map(toContextProject);
  const prompt = buildOwnerSnapshotPrompt({
    owner: input.owner,
    missionStatement,
    goals,
    meJson: compactMeJson,
    meJsonUrl: input.meJsonUrl,
    projects: projectRows,
  });
  const budget = ownerSnapshotBudget(prompt);

  const packet = createMe3AgentContextPacket({
    id: `agent-context:${input.ownerId}:chat_reply`,
    ownerId: input.ownerId,
    purpose: "chat_reply",
    surface: "core",
    ownerProfile: input.owner
      ? {
          displayName: input.owner.name,
          username: input.owner.username,
          timezone: input.owner.timezone,
          source: source({
            id: input.owner.id,
            kind: "owner_profile",
            label: "Owner profile",
            visibility: "public",
            reason: "Stable owner identity for every Assistant turn.",
          }),
        }
      : null,
    missionStatement: missionStatement || goals.length
      ? {
          statement: missionStatement || `Current goal: ${goals.join("; ")}`,
          source: source({
            id: "mission-statement",
            kind: "mission_statement",
            label: "Mission statement and goals",
            visibility: "private",
            reason: "Stable Mission Control orientation for every Assistant turn.",
            sourceRef: "/mission-control",
            updatedAt: missionRow?.updated_at || null,
          }),
        }
      : null,
    publicIdentity: meJson
      ? {
          summary: "The bounded public me.json profile is included in the owner snapshot.",
          meJsonUrl: input.meJsonUrl,
          source: source({
            id: "owner-me-json",
            kind: "public_me_json",
            label: "Public me.json",
            visibility: "public",
            reason: "Public profile facts for every Assistant turn.",
            sourceRef: meJsonRow?.path || "/.well-known/me.json",
            updatedAt: meJsonRow?.updated_at || null,
          }),
        }
      : null,
    projects,
    budget,
  });
  const manifest = createMe3AgentContextManifest(packet, budget);

  return {
    prompt,
    manifest,
    summary: summarizeMe3AgentContextManifest(manifest),
    characterCount: prompt.length,
  };
}

async function loadMissionSnapshot(
  db: OwnerSnapshotDb,
  ownerId: string,
): Promise<MissionSnapshotRow | null> {
  return db.prepare(
    `SELECT mission_statement, settings_json, updated_at
     FROM mission_dashboard_settings
     WHERE user_id = ?`,
  )
    .bind(ownerId)
    .first<MissionSnapshotRow>();
}

async function loadWheelSnapshot(
  db: OwnerSnapshotDb,
  ownerId: string,
): Promise<WheelSnapshotRow | null> {
  return db.prepare(
    `SELECT segments_json, notes_json
     FROM mission_wheel_snapshots
     WHERE user_id = ?
     ORDER BY created_at DESC, id ASC
     LIMIT 1`,
  )
    .bind(ownerId)
    .first<WheelSnapshotRow>();
}

async function loadProjectSnapshots(
  db: OwnerSnapshotDb,
  ownerId: string,
): Promise<ProjectSnapshotRow[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.name, p.slug, p.description, p.status, p.source_ref, p.updated_at,
            COUNT(t.id) AS open_task_count
     FROM mission_projects p
     LEFT JOIN mission_tasks t
       ON t.project_id = p.id
      AND t.user_id = p.user_id
      AND t.archived_at IS NULL
      AND t.status NOT IN ('done', 'cancelled')
     WHERE p.user_id = ? AND p.status != 'archived'
     GROUP BY p.id, p.name, p.slug, p.description, p.status, p.source_ref, p.updated_at
     ORDER BY p.updated_at DESC, p.name ASC
     LIMIT 30`,
  )
    .bind(ownerId)
    .all<ProjectSnapshotRow>();
  return rows.results || [];
}

async function loadMeJsonSnapshot(
  db: OwnerSnapshotDb,
  ownerId: string,
): Promise<MeJsonSnapshotRow | null> {
  return db.prepare(
    `SELECT sf.content, sf.path, sf.updated_at
     FROM sites s
     JOIN site_files sf ON sf.site_id = s.id
     WHERE s.user_id = ?
       AND COALESCE(s.site_type, 'profile') = 'profile'
       AND sf.path IN ('public/me.json', 'src/me.json', 'me.json')
     ORDER BY s.updated_at DESC,
              CASE WHEN sf.path = 'public/me.json' THEN 0 WHEN sf.path = 'src/me.json' THEN 1 ELSE 2 END
     LIMIT 1`,
  )
    .bind(ownerId)
    .first<MeJsonSnapshotRow>();
}

function buildOwnerSnapshotPrompt(input: {
  owner: OwnerSnapshotProfile | null;
  missionStatement: string | null;
  goals: string[];
  meJson: Record<string, unknown> | null;
  meJsonUrl: string | null;
  projects: ProjectSnapshotRow[];
}): string {
  const lines = [
    "ME3 owner snapshot:",
    "This is the complete always-on owner snapshot. Journal entries, task details, and emails are not loaded here; use their tools before making claims about them.",
    `- Name: ${input.owner?.name || input.owner?.username || "Not set"}`,
    `- Timezone: ${input.owner?.timezone || "Not set"}`,
    `- Assistant name: ${input.owner?.assistantName || "ME3"}`,
    "",
    "Mission statement:",
    `- ${input.missionStatement || "Not set"}`,
    "",
    "Goals:",
    ...(input.goals.length ? input.goals.map((goal) => `- ${goal}`) : ["- Not set"]),
    "",
    "Public me.json:",
    input.meJsonUrl ? `- URL: ${input.meJsonUrl}` : "- URL: Not configured",
    input.meJson ? JSON.stringify(input.meJson) : "- Profile data: Not found",
    "",
    "Projects (metadata only):",
    ...(input.projects.length
      ? input.projects.map((project) => {
          const description = summarizeText(
            project.description || "No description.",
            MAX_PROJECT_DESCRIPTION_CHARS,
          );
          return `- ${project.name}: ${description} Open tasks: ${numberValue(project.open_task_count)}.`;
        })
      : ["- No active projects"]),
  ];
  const text = lines.join("\n");
  if (text.length <= OWNER_SNAPSHOT_PROMPT_BUDGET_CHARS) return text;
  const suffix = "\n[Owner snapshot trimmed to prompt budget]";
  return `${text.slice(0, OWNER_SNAPSHOT_PROMPT_BUDGET_CHARS - suffix.length)}${suffix}`;
}

function resolveGoals(
  settingsJson: string | null | undefined,
  wheel: WheelSnapshotRow | null,
): string[] {
  const settings = parseJsonRecord(settingsJson);
  const mainGoal = normalizeText(settings.mainGoal, 600);
  if (mainGoal) return [mainGoal];

  const notes = parseJsonRecord(wheel?.notes_json);
  const segments = parseJsonRecordArray(wheel?.segments_json);
  for (const segment of segments) {
    const id = normalizeText(segment.id, 100);
    const note = id ? normalizeText(notes[id], 600) : null;
    if (note) return [note];
  }
  return [];
}

function normalizeMissionStatement(value: unknown): string | null {
  const statement = normalizeText(value, 2_000);
  if (!statement || statement.includes(DEFAULT_MISSION_STATEMENT_TEMPLATE_MARKER)) return null;
  return statement;
}

function parseMeJson(value: unknown): Record<string, unknown> | null {
  const text = decodeText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function compactMeJsonForPrompt(
  profile: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!profile) return null;
  const priority = [
    "version",
    "name",
    "handle",
    "location",
    "bio",
    "avatar",
    "banner",
    "links",
    "buttons",
    "business",
    "intents",
    "blogEnabled",
    "blogTitle",
    "shopTitle",
    "testimonialsTitle",
    "footer",
  ];
  const orderedKeys = [
    ...priority.filter((key) => key in profile),
    ...Object.keys(profile).filter((key) => !priority.includes(key)),
  ];
  const compact: Record<string, unknown> = {};
  const omitted: string[] = [];
  for (const key of orderedKeys) {
    const nextValue = compactJsonValue(profile[key], 0);
    const candidate = { ...compact, [key]: nextValue };
    if (JSON.stringify(candidate).length <= MAX_ME_JSON_SNAPSHOT_CHARS) {
      compact[key] = nextValue;
    } else {
      omitted.push(key);
    }
  }
  if (omitted.length) compact._omittedFields = omitted;
  return compact;
}

function compactJsonValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return summarizeText(value, 600);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, 8).map((item) => compactJsonValue(item, depth + 1));
    return value.length > 8 ? [...items, { _omittedItems: value.length - 8 }] : items;
  }
  if (isRecord(value)) {
    if (depth >= 4) return "[nested data omitted]";
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 24)
        .map(([key, item]) => [key, compactJsonValue(item, depth + 1)]),
    );
  }
  return String(value ?? "");
}

function toContextProject(row: ProjectSnapshotRow): Me3AgentContextProject {
  const openTaskCount = numberValue(row.open_task_count);
  return {
    id: row.id,
    name: row.name,
    aliases: row.slug ? [row.slug] : [],
    summary: row.description,
    status: row.status,
    source: source({
      id: row.id,
      kind: "project",
      label: row.name,
      visibility: "private",
      reason: `Project metadata; ${openTaskCount} open task${openTaskCount === 1 ? "" : "s"}.`,
      sourceRef: row.source_ref,
      updatedAt: row.updated_at,
    }),
  };
}

function source(input: Me3AgentContextSource): Me3AgentContextSource {
  return input;
}

function ownerSnapshotBudget(prompt: string): Me3AgentContextBudget {
  const wasTrimmed = prompt.endsWith("[Owner snapshot trimmed to prompt budget]");
  return {
    maxPromptChars: OWNER_SNAPSHOT_PROMPT_BUDGET_CHARS,
    reservedResponseChars: 1_200,
    strategy: "stable_order_trim_tail",
    usedPromptChars: prompt.length,
    wasTrimmed,
    trimReason: wasTrimmed ? "maxPromptChars" : null,
  };
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonRecordArray(value: unknown): Record<string, unknown>[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function decodeText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) {
    return new TextDecoder().decode(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  if (Array.isArray(value) && value.every(isByte)) {
    return new TextDecoder().decode(new Uint8Array(value));
  }
  if (value && typeof value === "object") {
    const bytes = Object.values(value);
    if (bytes.every(isByte)) {
      return new TextDecoder().decode(new Uint8Array(bytes as number[]));
    }
  }
  return null;
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text ? summarizeText(text, maxLength) : null;
}

function summarizeText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
