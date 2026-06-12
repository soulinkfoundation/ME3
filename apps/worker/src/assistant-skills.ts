import { ME3_BUNDLED_AGENT_SKILLS } from "@me3/knowledge";
import type { Env } from "./types";

export class AssistantSkillsInputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AssistantSkillsInputError";
  }
}

export type AssistantSkillStatus = "active" | "disabled" | "invalid" | "archived";
export type AssistantSkillSourceKind = "url" | "repo" | "upload" | "core" | "plugin";
export type AssistantSkillTrustLevel = "core" | "plugin" | "user";

type AssistantSkillRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_kind: AssistantSkillSourceKind;
  source_ref: string | null;
  status: AssistantSkillStatus;
  trust_level: AssistantSkillTrustLevel;
  trigger_hints_json: string;
  skill_md: string | null;
  metadata_json: string;
  validation_errors_json: string;
  scripts_available: number;
  created_at: string;
  updated_at: string;
  installed_at: string;
};

export type AssistantSkill = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  sourceKind: AssistantSkillSourceKind;
  sourceRef: string | null;
  status: Exclude<AssistantSkillStatus, "archived">;
  trustLevel: AssistantSkillTrustLevel;
  triggerHints: string[];
  hasSkillMarkdown: boolean;
  metadata: Record<string, unknown>;
  validationErrors: string[];
  scriptsAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  installedAt: string;
};

export type AssistantSkillMatch = Pick<
  AssistantSkill,
  | "id"
  | "name"
  | "description"
  | "sourceKind"
  | "sourceRef"
  | "trustLevel"
  | "triggerHints"
  | "updatedAt"
> & {
  reason: string;
  instructions: string | null;
};

const MAX_SKILL_MD_CHARS = 24_000;
const MAX_DESCRIPTION_CHARS = 600;
const MAX_TRIGGER_HINTS = 12;
const MAX_MATCHED_SKILLS = 4;
const MAX_REMOTE_SKILLS_PER_INSTALL = 50;

export async function listAssistantSkills(env: Env, userId: string, limitInput = 100) {
  const limit = Math.max(1, Math.min(limitInput, 100));
  const rows = await env.DB.prepare(
    `SELECT id, user_id, name, description, source_kind, source_ref, status,
            trust_level, trigger_hints_json, skill_md, metadata_json,
            validation_errors_json, scripts_available, created_at, updated_at,
            installed_at
     FROM assistant_skills
     WHERE user_id = ? AND status != 'archived'
     ORDER BY status = 'active' DESC, updated_at DESC, name ASC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<AssistantSkillRow>();
  return mergeBundledAssistantSkills(
    userId,
    (rows.results || []).map(serializeAssistantSkill),
  ).slice(0, limit);
}

export async function createAssistantSkill(env: Env, userId: string, input: unknown) {
  const body = isRecord(input) ? input : {};
  const sourceRef = normalizeNullableText(body.sourceRef);
  let rawSkillMd = normalizeSkillMarkdown(body.skillMd);
  if (!sourceRef && !rawSkillMd) {
    throw new AssistantSkillsInputError("Skill URL or SKILL.md is required");
  }

  const sourceKind = normalizeSourceKind(body.sourceKind, sourceRef);
  const remoteSkills =
    sourceRef && !rawSkillMd
      ? await fetchRemoteSkillMarkdown(sourceRef)
      : [];
  if (remoteSkills.length === 1) {
    rawSkillMd = remoteSkills[0]?.skillMd || rawSkillMd;
  }

  if (remoteSkills.length > 1) {
    const installedSkills: AssistantSkill[] = [];
    let duplicateCount = 0;
    for (const remoteSkill of remoteSkills) {
      try {
        installedSkills.push(
          await insertAssistantSkill(env, userId, {
            body,
            sourceRef: remoteSkill.sourceRef,
            sourceKind: "repo",
            rawSkillMd: remoteSkill.skillMd,
            metadataFallback: {
              installMode: "remote_skill_md",
              remoteSourceRef: sourceRef,
              remotePath: remoteSkill.path,
              scriptsInert: true,
            },
          }),
        );
      } catch (error) {
        if (isDuplicateSourceError(error)) {
          duplicateCount += 1;
          continue;
        }
        throw error;
      }
    }
    if (!installedSkills.length) {
      throw new AssistantSkillsInputError(
        duplicateCount
          ? "Those skills are already installed"
          : "No installable SKILL.md files were found",
        duplicateCount ? 409 : 400,
      );
    }
    return { skill: installedSkills[0], skills: installedSkills };
  }

  const skill = await insertAssistantSkill(env, userId, {
    body,
    sourceRef,
    sourceKind,
    rawSkillMd,
    metadataFallback: {
      installMode: rawSkillMd ? "skill_md" : "source_ref",
      scriptsInert: true,
    },
  });
  return { skill, skills: [skill] };
}

async function insertAssistantSkill(
  env: Env,
  userId: string,
  input: {
    body: Record<string, unknown>;
    sourceRef: string | null;
    sourceKind: AssistantSkillSourceKind;
    rawSkillMd: string | null;
    metadataFallback: Record<string, unknown>;
  },
) {
  const { body, sourceRef, sourceKind, rawSkillMd } = input;
  const validation = validateSkillInput(sourceKind, sourceRef, rawSkillMd);
  if (validation.errors.length) {
    throw new AssistantSkillsInputError(validation.errors[0] || "Skill is invalid");
  }
  const name =
    normalizeNullableText(body.name) ||
    inferSkillName(rawSkillMd) ||
    inferSkillNameFromSource(sourceRef) ||
    "Imported skill";
  const description =
    truncateText(
      normalizeNullableText(body.description) || inferSkillDescription(rawSkillMd),
      MAX_DESCRIPTION_CHARS,
    ) || null;
  const triggerHints = normalizeTriggerHints(body.triggerHints, name, description, sourceRef);
  const metadata = normalizeMetadata(body.metadata, input.metadataFallback);
  const skillMd = rawSkillMd ? truncateText(rawSkillMd, MAX_SKILL_MD_CHARS) : null;
  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(
      `INSERT INTO assistant_skills
         (id, user_id, name, description, source_kind, source_ref, status,
          trust_level, trigger_hints_json, skill_md, metadata_json,
          validation_errors_json, scripts_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
      .bind(
        id,
        userId,
        name,
        description,
        sourceKind,
        sourceRef,
        "active",
        normalizeTrustLevel(body.trustLevel, sourceKind),
        JSON.stringify(triggerHints),
        skillMd,
        JSON.stringify(metadata),
        JSON.stringify(validation.errors),
      )
      .run();
  } catch (error) {
    if (isDuplicateSourceError(error)) {
      throw new AssistantSkillsInputError("That skill source is already installed", 409);
    }
    throw error;
  }

  const skill = await getAssistantSkill(env, userId, id);
  return serializeAssistantSkill(skill as AssistantSkillRow);
}

export async function updateAssistantSkill(
  env: Env,
  userId: string,
  skillId: string,
  input: unknown,
) {
  const existing = await getAssistantSkill(env, userId, skillId);
  if (!existing || existing.status === "archived") {
    throw new AssistantSkillsInputError("Skill not found", 404);
  }
  const body = isRecord(input) ? input : {};
  const status = normalizeStatus(body.status) || existing.status;

  await env.DB.prepare(
    `UPDATE assistant_skills
     SET name = ?, description = ?, status = ?, trigger_hints_json = ?,
         metadata_json = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND status != 'archived'`,
  )
    .bind(
      normalizeNullableText(body.name) || existing.name,
      body.description === undefined
        ? existing.description
        : truncateText(normalizeNullableText(body.description), MAX_DESCRIPTION_CHARS),
      status,
      body.triggerHints === undefined
        ? existing.trigger_hints_json
        : JSON.stringify(normalizeTriggerHints(body.triggerHints)),
      body.metadata === undefined
        ? existing.metadata_json
        : JSON.stringify(normalizeMetadata(body.metadata, parseJsonRecord(existing.metadata_json))),
      skillId,
      userId,
    )
    .run();

  const skill = await getAssistantSkill(env, userId, skillId);
  return { skill: serializeAssistantSkill(skill as AssistantSkillRow) };
}

export async function deleteAssistantSkill(env: Env, userId: string, skillId: string) {
  const result = await env.DB.prepare(
    `UPDATE assistant_skills
     SET status = 'archived', updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND status != 'archived'`,
  )
    .bind(skillId, userId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    throw new AssistantSkillsInputError("Skill not found", 404);
  }
  return { ok: true };
}

export async function matchAssistantSkills(
  env: Pick<Env, "DB">,
  userId: string,
  requestText: string,
  limit = MAX_MATCHED_SKILLS,
): Promise<AssistantSkillMatch[]> {
  const queryTokens = tokenize(requestText);
  if (queryTokens.length === 0) return [];
  const rows = await env.DB.prepare(
    `SELECT id, user_id, name, description, source_kind, source_ref, status,
            trust_level, trigger_hints_json, skill_md, metadata_json,
            validation_errors_json, scripts_available, created_at, updated_at,
            installed_at
     FROM assistant_skills
     WHERE user_id = ? AND status = 'active'
     ORDER BY updated_at DESC, name ASC
     LIMIT 100`,
  )
    .bind(userId)
    .all<AssistantSkillRow>();

  const bundledSourceRefs = new Set(ME3_BUNDLED_AGENT_SKILLS.map((skill) => skill.sourceRef));
  const bundledMatches: AssistantSkillMatch[] = ME3_BUNDLED_AGENT_SKILLS
    .map((skill) => {
      const score = scoreSkillMatch(
        queryTokens,
        tokenize([skill.name, skill.description, skill.sourceRef, ...skill.triggerHints].join(" ")),
        skill.triggerHints,
      );
      return { skill, score };
    })
    .filter((item) => item.score > 0)
    .map(({ skill, score }) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      sourceKind: "core",
      sourceRef: skill.sourceRef,
      trustLevel: "core",
      triggerHints: skill.triggerHints,
      updatedAt: skill.updatedAt,
      reason:
        score >= 4
          ? "Bundled core skill strongly matched the request."
          : "Bundled core skill metadata matched the request.",
      instructions: truncateText(skill.instructions, MAX_SKILL_MD_CHARS),
    }));

  const storedMatches = (rows.results || [])
    .filter((row) => !row.source_ref || !bundledSourceRefs.has(row.source_ref))
    .map((row) => {
      const skill = serializeAssistantSkill(row);
      const hints = skill.triggerHints;
      const haystack = tokenize([skill.name, skill.description, skill.sourceRef, ...hints].join(" "));
      const score = scoreSkillMatch(queryTokens, haystack, hints);
      return { row, skill, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
    .slice(0, Math.max(1, Math.min(limit, MAX_MATCHED_SKILLS)))
    .map(({ row, skill, score }) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      sourceKind: skill.sourceKind,
      sourceRef: skill.sourceRef,
      trustLevel: skill.trustLevel,
      triggerHints: skill.triggerHints,
      updatedAt: skill.updatedAt,
      reason: score >= 4 ? "Skill trigger strongly matched the request." : "Skill metadata matched the request.",
      instructions: row.skill_md ? truncateText(row.skill_md, MAX_SKILL_MD_CHARS) : null,
    }));

  return [...bundledMatches, ...storedMatches]
    .sort((a, b) => {
      const coreRank = Number(b.sourceKind === "core") - Number(a.sourceKind === "core");
      return coreRank || a.name.localeCompare(b.name);
    })
    .slice(0, Math.max(1, Math.min(limit, MAX_MATCHED_SKILLS)));
}

async function getAssistantSkill(env: Pick<Env, "DB">, userId: string, skillId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, name, description, source_kind, source_ref, status,
            trust_level, trigger_hints_json, skill_md, metadata_json,
            validation_errors_json, scripts_available, created_at, updated_at,
            installed_at
     FROM assistant_skills
     WHERE id = ? AND user_id = ?`,
  )
    .bind(skillId, userId)
    .first<AssistantSkillRow>();
}

function serializeAssistantSkill(row: AssistantSkillRow): AssistantSkill {
  if (row.status === "archived") {
    throw new AssistantSkillsInputError("Cannot serialize archived skill", 500);
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    status: row.status,
    trustLevel: row.trust_level,
    triggerHints: parseJsonStringArray(row.trigger_hints_json),
    hasSkillMarkdown: Boolean(row.skill_md),
    metadata: parseJsonRecord(row.metadata_json),
    validationErrors: parseJsonStringArray(row.validation_errors_json),
    scriptsAvailable: row.scripts_available === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    installedAt: row.installed_at,
  };
}

function mergeBundledAssistantSkills(userId: string, storedSkills: AssistantSkill[]) {
  const storedSourceRefs = new Set(
    storedSkills.map((skill) => skill.sourceRef).filter(Boolean),
  );
  const bundledSkills = ME3_BUNDLED_AGENT_SKILLS
    .filter((skill) => !storedSourceRefs.has(skill.sourceRef))
    .map((skill): AssistantSkill => ({
      id: skill.id,
      userId,
      name: skill.name,
      description: skill.description,
      sourceKind: "core",
      sourceRef: skill.sourceRef,
      status: "active",
      trustLevel: "core",
      triggerHints: skill.triggerHints,
      hasSkillMarkdown: true,
      metadata: { bundled: true, removable: false },
      validationErrors: [],
      scriptsAvailable: false,
      createdAt: skill.updatedAt,
      updatedAt: skill.updatedAt,
      installedAt: skill.updatedAt,
    }));
  return [...bundledSkills, ...storedSkills];
}

function validateSkillInput(
  sourceKind: AssistantSkillSourceKind,
  sourceRef: string | null,
  skillMd: string | null,
) {
  const errors: string[] = [];
  if (sourceRef && sourceKind !== "upload" && !isSafeSkillSourceRef(sourceRef)) {
    errors.push("Skill source must be an http(s) URL or GitHub-style repository path.");
  }
  if (skillMd && !/^#\s+/m.test(skillMd.trim())) {
    errors.push("SKILL.md must start with a Markdown heading.");
  }
  return { errors };
}

function normalizeSourceKind(
  value: unknown,
  sourceRef: string | null,
): AssistantSkillSourceKind {
  if (value === "upload" || value === "core" || value === "plugin") return value;
  if (value === "repo" || looksLikeRepoRef(sourceRef)) return "repo";
  return "url";
}

function normalizeTrustLevel(
  value: unknown,
  sourceKind: AssistantSkillSourceKind,
): AssistantSkillTrustLevel {
  if (value === "core" || sourceKind === "core") return "core";
  if (value === "plugin" || sourceKind === "plugin") return "plugin";
  return "user";
}

function normalizeStatus(value: unknown): AssistantSkillStatus | null {
  return value === "active" || value === "disabled" || value === "invalid"
    ? value
    : null;
}

function normalizeTriggerHints(
  value: unknown,
  ...fallbackParts: Array<string | null | undefined>
) {
  const raw = Array.isArray(value)
    ? value
    : fallbackParts.join(" ").split(/[\s/_.:-]+/);
  return Array.from(
    new Set(
      raw
        .map((item) => normalizeNullableText(item))
        .filter(
          (item): item is string => typeof item === "string" && item.length > 2,
        )
        .map((item) => item.toLowerCase())
        .slice(0, MAX_TRIGGER_HINTS),
    ),
  );
}

function scoreSkillMatch(queryTokens: string[], haystackTokens: string[], hints: string[]) {
  const haystack = new Set(haystackTokens);
  const hintSet = new Set(hints.map((hint) => hint.toLowerCase()));
  return queryTokens.reduce((score, token) => {
    if (hintSet.has(token)) return score + 3;
    if (haystack.has(token)) return score + 1;
    return score;
  }, 0);
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2),
    ),
  );
}

function inferSkillName(skillMd: string | null) {
  const heading = skillMd?.match(/^#\s+(.+)$/m)?.[1];
  return truncateText(
    normalizeNullableText(heading) || parseSkillFrontMatter(skillMd).name,
    80,
  );
}

function inferSkillDescription(skillMd: string | null) {
  const frontMatterDescription = parseSkillFrontMatter(skillMd).description;
  if (frontMatterDescription) {
    return truncateText(frontMatterDescription, MAX_DESCRIPTION_CHARS);
  }
  const lines = skillMd
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("---") &&
        !/^[a-z][\w-]*:\s*/i.test(line),
    );
  return truncateText(lines?.[0] || null, MAX_DESCRIPTION_CHARS);
}

function parseSkillFrontMatter(skillMd: string | null) {
  const metadata: { name: string | null; description: string | null } = {
    name: null,
    description: null,
  };
  const frontMatter = skillMd?.match(/^---\n([\s\S]*?)\n---/);
  if (!frontMatter?.[1]) return metadata;
  for (const line of frontMatter[1].split(/\r?\n/)) {
    const match = line.match(/^([a-z][\w-]*):\s*(.+)$/i);
    if (!match) continue;
    const key = match[1]?.toLowerCase();
    const value = normalizeNullableText(match[2]);
    if (key === "name") metadata.name = value;
    if (key === "description") metadata.description = value;
  }
  return metadata;
}

function inferSkillNameFromSource(sourceRef: string | null) {
  if (!sourceRef) return null;
  const withoutGit = sourceRef.replace(/\.git$/i, "");
  const parts = withoutGit.split(/[/:]/).filter(Boolean);
  return truncateText(parts.at(-1)?.replace(/[-_]+/g, " ") || null, 80);
}

function isSafeSkillSourceRef(value: string) {
  return /^https?:\/\/[^\s]+$/i.test(value) || looksLikeRepoRef(value);
}

function looksLikeRepoRef(value: string | null) {
  return Boolean(value && /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?$/.test(value));
}

type RemoteSkillMarkdown = {
  sourceRef: string;
  path: string;
  skillMd: string;
};

async function fetchRemoteSkillMarkdown(sourceRef: string): Promise<RemoteSkillMarkdown[]> {
  const direct = parseDirectSkillMarkdownUrl(sourceRef);
  if (direct) {
    return [
      {
        sourceRef: direct.sourceRef,
        path: direct.path,
        skillMd: await fetchMarkdownText(direct.rawUrl),
      },
    ];
  }

  const repo = parseGithubRepoSource(sourceRef);
  if (!repo) return [];
  const treeUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(
    repo.branch || "HEAD",
  )}?recursive=1`;
  const treeResponse = await fetchJson(treeUrl);
  const tree = Array.isArray(treeResponse.tree) ? treeResponse.tree : [];
  const basePath = repo.path ? `${repo.path.replace(/^\/+|\/+$/g, "")}/` : "";
  const skillPaths = tree
    .map((item) => (isRecord(item) ? normalizeNullableText(item.path) : null))
    .filter((path): path is string => Boolean(path && /(^|\/)SKILL\.md$/i.test(path)))
    .filter((path) => !basePath || path === basePath.slice(0, -1) || path.startsWith(basePath))
    .slice(0, MAX_REMOTE_SKILLS_PER_INSTALL);

  if (!skillPaths.length) {
    throw new AssistantSkillsInputError("No SKILL.md files were found in that repository");
  }

  const skills: RemoteSkillMarkdown[] = [];
  for (const path of skillPaths) {
    const rawUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${encodeURIComponent(
      repo.branch || "HEAD",
    )}/${path
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
    skills.push({
      sourceRef: `https://github.com/${repo.owner}/${repo.repo}/tree/${repo.branch || "HEAD"}/${path.replace(
        /\/?SKILL\.md$/i,
        "",
      )}`,
      path,
      skillMd: await fetchMarkdownText(rawUrl),
    });
  }
  return skills;
}

function parseDirectSkillMarkdownUrl(sourceRef: string) {
  const rawMatch = sourceRef.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+\/)?SKILL\.md$/i,
  );
  if (rawMatch) {
    const [, owner, repo, branch, prefix = ""] = rawMatch;
    const path = `${prefix}SKILL.md`;
    return {
      rawUrl: sourceRef,
      sourceRef: `https://github.com/${owner}/${repo}/tree/${branch}/${prefix.replace(/\/$/g, "")}`,
      path,
    };
  }

  const blobMatch = sourceRef.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\/)?SKILL\.md$/i,
  );
  if (blobMatch) {
    const [, owner, repo, branch, prefix = ""] = blobMatch;
    const path = `${prefix}SKILL.md`;
    return {
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
      sourceRef: `https://github.com/${owner}/${repo}/tree/${branch}/${prefix.replace(/\/$/g, "")}`,
      path,
    };
  }

  if (/^https?:\/\/[^\s]+\/SKILL\.md(?:\?[^#\s]*)?(?:#[^\s]*)?$/i.test(sourceRef)) {
    const cleanUrl = sourceRef.replace(/[?#].*$/, "");
    return {
      rawUrl: sourceRef,
      sourceRef: cleanUrl,
      path: cleanUrl.split("/").slice(-2).join("/") || "SKILL.md",
    };
  }
  return null;
}

function parseGithubRepoSource(sourceRef: string) {
  const githubUrl = sourceRef.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?\/?$/i,
  );
  if (githubUrl) {
    return {
      owner: githubUrl[1],
      repo: githubUrl[2],
      branch: githubUrl[3] || null,
      path: githubUrl[4] || "",
    };
  }

  const shorthand = sourceRef.match(/^([\w.-]+)\/([\w.-]+)(?:\/(.+))?$/);
  if (shorthand) {
    return {
      owner: shorthand[1],
      repo: shorthand[2],
      branch: null,
      path: shorthand[3] || "",
    };
  }
  return null;
}

async function fetchMarkdownText(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "text/markdown,text/plain,*/*" },
  });
  if (!response.ok) {
    throw new AssistantSkillsInputError("Skill markdown could not be fetched", 400);
  }
  const text = normalizeSkillMarkdown(await response.text());
  if (!text) throw new AssistantSkillsInputError("Skill markdown was empty", 400);
  return text;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "me3-core-assistant-skills",
    },
  });
  if (!response.ok) {
    throw new AssistantSkillsInputError("Skill repository could not be inspected", 400);
  }
  const parsed = await response.json().catch(() => null);
  if (!isRecord(parsed)) {
    throw new AssistantSkillsInputError("Skill repository response was invalid", 400);
  }
  return parsed;
}

function isDuplicateSourceError(error: unknown) {
  return (
    String((error as Error)?.message || error).includes("UNIQUE") ||
    (error instanceof AssistantSkillsInputError && error.status === 409)
  );
}

function normalizeMetadata(value: unknown, fallback: Record<string, unknown> = {}) {
  return { ...fallback, ...parseJsonRecord(value) };
}

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizeSkillMarkdown(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\r\n/g, "\n");
  return normalized || null;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
