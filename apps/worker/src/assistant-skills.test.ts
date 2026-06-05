import { describe, expect, it } from "vitest";
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
  it("installs and lists a repo-backed skill without enabling scripts", async () => {
    const { env } = createSkillEnv();

    const created = await createAssistantSkill(env as never, "owner", {
      sourceRef: "soulinkfoundation/cloudflare-skill",
    });
    const listed = await listAssistantSkills(env as never, "owner");

    expect(created.skill.name).toBe("cloudflare skill");
    expect(created.skill.sourceKind).toBe("repo");
    expect(created.skill.scriptsAvailable).toBe(false);
    expect(listed).toHaveLength(1);
  });

  it("rejects duplicate active skill sources", async () => {
    const { env } = createSkillEnv();
    await createAssistantSkill(env as never, "owner", {
      sourceRef: "https://example.com/SKILL.md",
    });

    await expect(
      createAssistantSkill(env as never, "owner", {
        sourceRef: "https://example.com/SKILL.md",
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

    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe("Cloudflare deploy");
    expect(matches[0]?.instructions).toContain("Use Wrangler");
  });
});
