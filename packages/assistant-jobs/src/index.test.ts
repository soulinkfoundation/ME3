import { describe, expect, it } from "vitest";
import {
  ASSISTANT_JOB_STARTER_RECIPES,
  attachAssistantJobContextToRunResult,
  createAssistantJobContext,
  createAssistantJobDraftFromRecipe,
  getAssistantJobStarterRecipe,
  validateAssistantJobDraft,
  type AssistantJobDraft,
} from "./index";

describe("assistant jobs package", () => {
  it("validates Core v1 starter recipes without provider setup", () => {
    const coreRecipes = ASSISTANT_JOB_STARTER_RECIPES.filter(
      (recipe) => recipe.firstVersion === "core_v1",
    );

    expect(coreRecipes.map((recipe) => recipe.id)).toEqual([
      "weekly-review",
      "daily-briefing",
      "task-carry-over",
      "project-digest",
      "approval-sweep",
      "memory-review",
      "setup-health-check",
    ]);

    for (const recipe of coreRecipes) {
      const validation = validateAssistantJobDraft(createAssistantJobDraftFromRecipe(recipe));
      expect(validation.status, recipe.id).toBe("valid");
      expect(validation.errors, recipe.id).toEqual([]);
    }
  });

  it("marks provider-backed recipes as setup-gated", () => {
    const emailWatch = getAssistantJobStarterRecipe("email-watch");
    if (!emailWatch) throw new Error("Missing email-watch recipe");

    const validation = validateAssistantJobDraft(createAssistantJobDraftFromRecipe(emailWatch));

    expect(validation.status).toBe("needs_setup");
    expect(validation.errors.map((error) => error.code)).toContain("setup_missing");
    expect(validation.permissionSummary.setupRequirements).toContain("email");
  });

  it("rejects unknown capabilities even when a skill is available", () => {
    const weeklyReview = getAssistantJobStarterRecipe("weekly-review");
    if (!weeklyReview) throw new Error("Missing weekly-review recipe");
    const draft: AssistantJobDraft = {
      ...createAssistantJobDraftFromRecipe(weeklyReview),
      requiredSkillIds: ["pdf-processing"],
      actions: [
        {
          id: "skill-only-action",
          capabilityId: "skill.pdf-processing.extract",
          label: "Extract PDF data",
          inputs: {},
          approvalMode: "none",
          onFailure: "stop",
          idempotencyScope: "run",
        },
      ],
    };

    const validation = validateAssistantJobDraft(draft, {
      availableSkillIds: ["pdf-processing"],
    });

    expect(validation.status).toBe("invalid");
    expect(validation.errors.map((error) => error.code)).toContain("unknown_capability");
  });

  it("rejects actions with weaker approval than their capability policy", () => {
    const weeklyReview = getAssistantJobStarterRecipe("weekly-review");
    if (!weeklyReview) throw new Error("Missing weekly-review recipe");
    const draft: AssistantJobDraft = {
      ...createAssistantJobDraftFromRecipe(weeklyReview),
      actions: [
        {
          id: "activate-memory",
          capabilityId: "mission.memory.activate",
          label: "Activate memory",
          inputs: {},
          approvalMode: "none",
          onFailure: "stop",
          idempotencyScope: "run",
        },
      ],
    };

    const validation = validateAssistantJobDraft(draft);

    expect(validation.status).toBe("invalid");
    expect(validation.errors.map((error) => error.code)).toContain("approval_too_weak");
  });

  it("rejects event-triggered jobs with event-unsafe actions", () => {
    const emailWatch = getAssistantJobStarterRecipe("email-watch");
    if (!emailWatch) throw new Error("Missing email-watch recipe");
    const draft: AssistantJobDraft = {
      ...createAssistantJobDraftFromRecipe(emailWatch),
      actions: [
        {
          id: "send-email",
          capabilityId: "email.message.send",
          label: "Send email",
          inputs: {},
          approvalMode: "approval_required",
          onFailure: "stop",
          idempotencyScope: "source_event",
        },
      ],
    };

    const validation = validateAssistantJobDraft(draft, {
      readySetupRequirements: ["email"],
    });

    expect(validation.status).toBe("invalid");
    expect(validation.errors.map((error) => error.code)).toContain("event_unsafe_action");
  });

  it("builds project-scoped context for Mission Control job runs", () => {
    const context = createAssistantJobContext({
      ownerId: "owner",
      jobId: "job-project-digest",
      runId: "run-1",
      jobName: "Project Digest",
      jobPurpose: "Summarize the active analytics project.",
      scope: {
        projectId: "project-analytics",
        sourceIds: [],
        providerAccountIds: [],
        filters: [],
      },
      destination: {
        kind: "mission_control",
        projectId: "project-analytics",
        landing: "review_packet",
        quietIfNoChanges: true,
      },
      candidateProjects: [
        project("project-analytics", "Analytics Workflow"),
        project("project-compiler", "Compiler Notes"),
      ],
      candidateTasks: [
        task("task-analytics", "Send analytics update", "project-analytics"),
        task("task-compiler", "Review compiler paper", "project-compiler"),
      ],
      candidatePrivateMemory: [
        memory("memory-analytics", "project_context", "Analytics prefers brief notes.", "project:project-analytics"),
        memory("memory-compiler", "project_context", "Compiler notes are separate.", "project:project-compiler"),
      ],
      budget: { maxPromptChars: 4000 },
    });

    expect(context.packet.purpose).toBe("mission_review");
    expect(context.packet.projects.map((item) => item.id)).toEqual(["project-analytics"]);
    expect(context.packet.tasks.map((item) => item.id)).toEqual(["task-analytics"]);
    expect(context.packet.privateMemory.map((item) => item.id)).toEqual(["memory-analytics"]);
    expect(context.prompt.text).toContain("Context sources");
    expect(context.prompt.text).not.toContain("Compiler Notes");
    expect(context.manifest.packetId).toBe("agent-context:owner:job-run:run-1");
    expect(context.manifest.sources.map((source) => source.id)).toContain("project-analytics");
  });

  it("builds email-scoped job context and records failed sources without blocking", () => {
    const context = createAssistantJobContext({
      ownerId: "owner",
      jobId: "job-email-triage",
      jobName: "Email Triage",
      jobPurpose: "Prepare a reply from a scoped email thread.",
      contextScope: { emailThreadId: "thread-ada" },
      candidateContacts: [
        contact("contact-ada", "Ada Lovelace"),
        contact("contact-grace", "Grace Hopper"),
      ],
      candidateEmailThreads: [
        {
          id: "thread-ada",
          subject: "Workflow notes",
          contactId: "contact-ada",
          summary: "Ada asked for the next workflow update.",
          source: source("email_thread", "thread-ada", "Workflow notes"),
        },
      ],
      failedSources: [
        {
          id: "gmail-sync",
          kind: "plugin",
          label: "Gmail sync",
          visibility: "private",
          status: "failed",
          reason: "Provider unavailable during this run.",
        },
      ],
    });

    expect(context.packet.emailThreads.map((thread) => thread.id)).toEqual(["thread-ada"]);
    expect(context.packet.contacts.map((item) => item.id)).toEqual(["contact-ada"]);
    expect(context.prompt.text).not.toContain("Grace Hopper");
    expect(context.manifest.sources).toContainEqual(
      expect.objectContaining({
        id: "gmail-sync",
        kind: "plugin",
        status: "failed",
      }),
    );
  });

  it("attaches context manifests to serializable run results", () => {
    const context = createAssistantJobContext({
      ownerId: "owner",
      jobId: "job-daily",
      runId: "run-daily",
      jobName: "Daily Briefing",
      jobPurpose: "Summarize today's tasks.",
      candidateTasks: [task("task-today", "Write daily plan", null)],
      contextScope: { date: "2026-05-16" },
    });

    const result = attachAssistantJobContextToRunResult(
      { summary: "Daily briefing ready." },
      context,
    );

    expect(result.contextPacketId).toBe("agent-context:owner:job-run:run-daily");
    expect(result.contextManifest).toMatchObject({
      packetId: "agent-context:owner:job-run:run-daily",
      purpose: "assistant_job",
    });
  });
});

function source(
  kind:
    | "private_memory"
    | "contact"
    | "email_thread"
    | "project"
    | "task"
    | "calendar_event",
  id: string,
  label: string,
) {
  return {
    id,
    kind,
    label,
    visibility: "private" as const,
  };
}

function contact(id: string, name: string) {
  return {
    id,
    name,
    relationship: "client",
    summary: `${name} contact context.`,
    source: source("contact", id, name),
  };
}

function project(id: string, name: string) {
  return {
    id,
    name,
    status: "active",
    summary: `${name} project context.`,
    source: source("project", id, name),
  };
}

function task(id: string, title: string, projectId: string | null) {
  return {
    id,
    title,
    status: "in_progress",
    dueAt: "2026-05-16",
    projectId,
    source: source("task", id, title),
  };
}

function memory(id: string, kind: string, body: string, scopeValue: string) {
  return {
    id,
    kind,
    body,
    scope: scopeValue,
    source: source("private_memory", id, kind),
  };
}
