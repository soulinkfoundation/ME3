import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAssistantSkill,
  listAssistantSkills,
  matchAssistantSkills,
} from "./assistant-skills";

type SkillRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_kind: "url" | "repo" | "upload" | "core" | "plugin";
  source_ref: string | null;
  status: "active" | "disabled" | "invalid" | "archived";
  trust_level: "core" | "plugin" | "user";
  trigger_hints_json: string;
  skill_md: string | null;
  metadata_json: string;
  validation_errors_json: string;
  scripts_available: number;
  created_at: string;
  updated_at: string;
  installed_at: string;
};

function createSkillEnv() {
  const rows: SkillRow[] = [];
  const now = "2026-06-05T09:00:00.000Z";
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async all<T>() {
                if (sql.includes("FROM assistant_skills")) {
                  const userId = values[0] as string;
                  const activeOnly = sql.includes("status = 'active'");
                  const filtered = rows.filter(
                    (row) =>
                      row.user_id === userId &&
                      (activeOnly ? row.status === "active" : row.status !== "archived"),
                  );
                  return { results: filtered as T[] };
                }
                return { results: [] as T[] };
              },
              async first<T>() {
                if (sql.includes("FROM assistant_skills")) {
                  return (
                    rows.find(
                      (row) => row.id === values[0] && row.user_id === values[1],
                    ) || null
                  ) as T | null;
                }
                return null;
              },
              async run() {
                if (sql.includes("INSERT INTO assistant_skills")) {
                  const sourceRef = values[5] as string | null;
                  if (
                    sourceRef &&
                    rows.some(
                      (row) =>
                        row.user_id === values[1] &&
                        row.source_ref === sourceRef &&
                        row.status !== "archived",
                    )
                  ) {
                    throw new Error("UNIQUE constraint failed");
                  }
                  rows.push({
                    id: values[0] as string,
                    user_id: values[1] as string,
                    name: values[2] as string,
                    description: values[3] as string | null,
                    source_kind: values[4] as SkillRow["source_kind"],
                    source_ref: sourceRef,
                    status: values[6] as SkillRow["status"],
                    trust_level: values[7] as SkillRow["trust_level"],
                    trigger_hints_json: values[8] as string,
                    skill_md: values[9] as string | null,
                    metadata_json: values[10] as string,
                    validation_errors_json: values[11] as string,
                    scripts_available: 0,
                    created_at: now,
                    updated_at: now,
                    installed_at: now,
                  });
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
  return { env, rows };
}

describe("assistant skills", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("installs and lists a repo-backed skill without enabling scripts", async () => {
    const { env } = createSkillEnv();

    const created = await createAssistantSkill(env as never, "owner", {
      sourceRef: "soulinkfoundation/cloudflare-skill",
      skillMd: "# Cloudflare skill\nDeploy Workers with explicit approval.",
    });
    const listed = await listAssistantSkills(env as never, "owner");

    expect(created.skill.name).toBe("Cloudflare skill");
    expect(created.skill.sourceKind).toBe("repo");
    expect(created.skill.scriptsAvailable).toBe(false);
    expect(listed.map((skill) => skill.name)).toEqual([
      "ME3 Core Configuration",
      "Cloudflare Platform",
      "Cloudflare skill",
    ]);
    expect(listed[0]?.sourceKind).toBe("core");
    expect(listed[0]?.scriptsAvailable).toBe(false);
  });

  it("rejects duplicate active skill sources", async () => {
    const { env } = createSkillEnv();
    await createAssistantSkill(env as never, "owner", {
      sourceRef: "https://example.com/SKILL.md",
      skillMd: "# Example skill\nUse this for duplicate checks.",
    });

    await expect(
      createAssistantSkill(env as never, "owner", {
        sourceRef: "https://example.com/SKILL.md",
        skillMd: "# Example skill\nUse this for duplicate checks.",
      }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects unsafe skill source references", async () => {
    const { env } = createSkillEnv();

    await expect(
      createAssistantSkill(env as never, "owner", {
        sourceRef: "file:///Users/kieran/private/SKILL.md",
      }),
    ).rejects.toMatchObject({
      message: "Skill source must be an http(s) URL or GitHub-style repository path.",
    });
  });

  it("matches active skills by request text and returns stored instructions", async () => {
    const { env } = createSkillEnv();
    await createAssistantSkill(env as never, "owner", {
      sourceRef: "https://example.com/cloudflare/SKILL.md",
      skillMd: "# Cloudflare deploy\nUse Wrangler and keep destructive deploys behind approval.",
    });

    const matches = await matchAssistantSkills(
      env as never,
      "owner",
      "Can you help deploy a Cloudflare Worker?",
    );

    expect(matches.map((match) => match.name)).toContain("Cloudflare Platform");
    expect(matches.map((match) => match.name)).toContain("Cloudflare deploy");
    expect(matches.find((match) => match.name === "Cloudflare deploy")?.instructions).toContain(
      "Use Wrangler",
    );
  });

  it("fetches and installs multiple SKILL.md files from a GitHub repo", async () => {
    const { env } = createSkillEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/git/trees/HEAD")) {
          return jsonResponse({
            tree: [
              { path: "skills/engineering/tdd/SKILL.md" },
              { path: "skills/productivity/handoff/SKILL.md" },
              { path: "README.md" },
            ],
          });
        }
        if (url.includes("skills/engineering/tdd/SKILL.md")) {
          return textResponse(
            "---\nname: tdd\ndescription: Test-driven development with red-green-refactor loop.\n---\n\n# TDD\nUse tests to shape implementation.",
          );
        }
        if (url.includes("skills/productivity/handoff/SKILL.md")) {
          return textResponse("# Handoff\nSummarize context for the next run.");
        }
        return textResponse("not found", 404);
      }),
    );

    const created = await createAssistantSkill(env as never, "owner", {
      sourceRef: "https://github.com/mattpocock/skills",
    });
    const listed = await listAssistantSkills(env as never, "owner");

    expect(created.skills).toHaveLength(2);
    expect(listed.map((skill) => skill.name)).toEqual([
      "ME3 Core Configuration",
      "Cloudflare Platform",
      "TDD",
      "Handoff",
    ]);
    expect(listed[2]?.description).toBe(
      "Test-driven development with red-green-refactor loop.",
    );
    expect(listed.every((skill) => skill.hasSkillMarkdown)).toBe(true);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function textResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
}
