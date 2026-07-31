import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerOnboardingRoutes } from "./onboarding";
import type { Env } from "../types";

function createApp(currentStep: 2 | 3 | null) {
  let step = currentStep;
  let completed = false;
  const run = vi.fn(async () => {
    if (step !== null) step = 3;
    return { success: true, meta: { changes: 1 } };
  });
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...values: unknown[]) => ({
        first: vi.fn(async () => {
          if (!sql.includes("SELECT current_step") || step === null || completed) return null;
          return { current_step: step };
        }),
        run: sql.includes("completed_at = CURRENT_TIMESTAMP")
          ? vi.fn(async () => {
              completed = true;
              return { success: true, meta: { changes: 1 } };
            })
          : run,
      })),
    })),
  };
  const app = new Hono<{ Bindings: Env }>();
  registerOnboardingRoutes(app, {
    requireOwner: vi.fn().mockResolvedValue("owner"),
    unauthorized: (c) => c.json({ error: "Unauthorized" }, 401),
  });
  return { app, env: { DB: db } as unknown as Env, run, isCompleted: () => completed };
}

describe("onboarding routes", () => {
  it("moves an imported profile checkpoint forward to Plugins", async () => {
    const { app, env, run } = createApp(2);
    const response = await app.fetch(
      new Request("https://core.example/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: 3 }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, currentStep: 3 });
    expect(run).toHaveBeenCalled();
  });

  it("completes only a pending imported onboarding flow", async () => {
    const { app, env, isCompleted } = createApp(3);
    const response = await app.fetch(
      new Request("https://core.example/api/onboarding/complete", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(200);
    expect(isCompleted()).toBe(true);

    const missing = createApp(null);
    const missingResponse = await missing.app.fetch(
      new Request("https://core.example/api/onboarding/complete", { method: "POST" }),
      missing.env,
    );
    expect(missingResponse.status).toBe(404);
  });
});
