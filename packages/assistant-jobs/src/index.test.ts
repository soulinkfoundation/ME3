import { describe, expect, it } from "vitest";
import {
  ASSISTANT_JOB_STARTER_RECIPES,
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
});
