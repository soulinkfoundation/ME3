import { describe, expect, it, vi } from "vitest";
import {
  FIXED_MODEL_EVALUATION_CANDIDATES,
  FIXED_MODEL_EVALUATION_TASKS,
  FIXED_MODEL_EVALUATION_SUITE_VERSION,
  runFixedModelEvaluation,
  type FixedModelEvaluationTask,
  type ModelEvaluationCandidate,
} from "@me3-core/plugin-agent-chat/model-evaluation";
import {
  modelCapabilitiesFor,
  modelSupportsImageInput,
} from "@me3-core/plugin-agent-chat/model-capabilities";

const gemmaConfig = FIXED_MODEL_EVALUATION_CANDIDATES[0];

describe("fixed live model evaluation", () => {
  it("registers the managed Kimi K3 model with vision-input capabilities", () => {
    expect(modelCapabilitiesFor("workers-ai", "moonshotai/kimi-k3")).toEqual([
      "text",
      "image_input",
      "long-context",
      "reasoning",
      "tool-use",
    ]);
    expect(modelSupportsImageInput("workers-ai", "moonshotai/kimi-k3")).toBe(true);
  });

  it("registers Gemma 4 with its canonical runtime capabilities", () => {
    expect(gemmaConfig).toMatchObject({
      id: "workers-gemma-4-26b",
      mode: "everyday",
      providerId: "workers-ai",
      model: "@cf/google/gemma-4-26b-a4b-it",
    });
    expect(
      modelCapabilitiesFor("workers-ai", "@cf/google/gemma-4-26b-a4b-it"),
    ).toEqual(["text", "image_input", "long-context", "reasoning", "tool-use"]);
    expect(
      modelSupportsImageInput("workers-ai", "@cf/google/gemma-4-26b-a4b-it"),
    ).toBe(true);
  });

  it("keeps one versioned 30-task suite across the required categories", () => {
    expect(FIXED_MODEL_EVALUATION_SUITE_VERSION).toBe("me3-fixed-30-v1");
    expect(FIXED_MODEL_EVALUATION_TASKS).toHaveLength(30);
    expect(new Set(FIXED_MODEL_EVALUATION_TASKS.map((task) => task.id)).size).toBe(30);
    expect(new Set(FIXED_MODEL_EVALUATION_TASKS.map((task) => task.category))).toEqual(
      new Set([
        "conversation",
        "personal_context",
        "planning_writing",
        "tool_selection",
        "failure_recovery",
        "long_thread",
        "vision",
        "structured_output",
      ]),
    );
    expect(
      FIXED_MODEL_EVALUATION_CANDIDATES.filter((candidate) => candidate.enabledByDefault)
        .map((candidate) => candidate.id),
    ).toEqual([
      "workers-gemma-4-26b",
      "workers-glm-4-7-flash",
      "workers-glm-5-2",
    ]);
  });

  it("uses the existing model/tool runtime and keeps prompt, response, and arguments out of results", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        tool_calls: [
          {
            id: "call-1",
            name: "core_mailbox_search",
            arguments: { query: "PRIVATE_QUERY" },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 10 },
      })
      .mockResolvedValueOnce({
        response: "PRIVATE_RESPONSE",
        usage: { prompt_tokens: 130, completion_tokens: 12 },
      });
    const task: FixedModelEvaluationTask = {
      id: "metadata-boundary",
      category: "tool_selection",
      turns: ["PRIVATE_PROMPT"],
      checkText: (text) => text === "PRIVATE_RESPONSE",
      expectedCalls: [
        { name: "core_mailbox_search", arguments: { query: "PRIVATE_QUERY" } },
      ],
    };
    const report = await runFixedModelEvaluation({
      candidates: [workersCandidate(gemmaConfig, run)],
      tasks: [task],
      runId: "run-fixed",
      now: fixedNow(),
    });
    const serialized = JSON.stringify(report);

    expect(run).toHaveBeenCalledTimes(2);
    expect(report.candidates[0]?.results[0]).toMatchObject({
      taskId: "metadata-boundary",
      status: "passed",
      toolCorrectness: "passed",
      tokensIn: 230,
      tokensOut: 22,
      tokenSource: "provider",
    });
    expect(serialized).not.toContain("PRIVATE_PROMPT");
    expect(serialized).not.toContain("PRIVATE_RESPONSE");
    expect(serialized).not.toContain("PRIVATE_QUERY");
    expect(serialized).not.toContain("toolCalls");
  });

  it("runs Gemma vision through the existing image model path", async () => {
    const run = vi.fn(async () => ({ response: "ME3" }));
    const visionTask = FIXED_MODEL_EVALUATION_TASKS.find(
      (task) => task.id === "vision-brand-text",
    );
    expect(visionTask).toBeDefined();

    const report = await runFixedModelEvaluation({
      candidates: [workersCandidate(gemmaConfig, run)],
      tasks: [visionTask!],
      visionImage: {
        name: "me3-logo.png",
        mimeType: "image/png",
        base64: "c3ludGhldGljLWltYWdl",
        dataUrl: "data:image/png;base64,c3ludGhldGljLWltYWdl",
      },
      runId: "run-vision",
      now: fixedNow(),
    });

    expect(run).toHaveBeenCalledWith(
      "@cf/google/gemma-4-26b-a4b-it",
      expect.objectContaining({ messages: expect.any(Array) }),
    );
    expect(report.candidates[0]?.results[0]).toMatchObject({
      status: "passed",
      tokenSource: "estimated",
      toolCorrectness: "not_applicable",
    });
  });

  it("records unsupported capabilities and missing providers without dispatching", async () => {
    const run = vi.fn();
    const visionTask = FIXED_MODEL_EVALUATION_TASKS.find(
      (task) => task.id === "vision-brand-text",
    )!;
    const glm = FIXED_MODEL_EVALUATION_CANDIDATES.find(
      (candidate) => candidate.id === "workers-glm-4-7-flash",
    )!;
    const unconfigured = workersCandidate(gemmaConfig, run);
    unconfigured.route = { ...unconfigured.route, configured: false, ai: null };

    const report = await runFixedModelEvaluation({
      candidates: [workersCandidate(glm, run), unconfigured],
      tasks: [visionTask],
      runId: "run-skips",
      now: fixedNow(),
    });

    expect(run).not.toHaveBeenCalled();
    expect(report.candidates[0]?.results).toEqual([
      expect.objectContaining({ status: "skipped", errorClass: "unsupported_capability" }),
    ]);
    expect(report.candidates[1]?.results).toEqual([
      expect.objectContaining({ status: "skipped", errorClass: "provider_unconfigured" }),
    ]);
  });
});

function workersCandidate(
  config: (typeof FIXED_MODEL_EVALUATION_CANDIDATES)[number],
  run: unknown,
): ModelEvaluationCandidate {
  const aiRun = run as (
    model: string,
    input: unknown,
    options?: unknown,
  ) => Promise<unknown>;
  return {
    ...config,
    route: {
      providerId: "workers-ai",
      model: config.model,
      backupModel: null,
      apiKey: null,
      ai: { run: aiRun },
      aiGateway: null,
      configured: true,
    },
  };
}

function fixedNow() {
  return () => new Date("2026-07-15T12:00:00.000Z");
}
