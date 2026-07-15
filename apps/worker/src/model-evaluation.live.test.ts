import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  FIXED_MODEL_EVALUATION_CANDIDATES,
  FIXED_MODEL_EVALUATION_TASKS,
  runFixedModelEvaluation,
  type ModelEvaluationCandidate,
  type ModelEvaluationCandidateConfig,
} from "@me3-core/plugin-agent-chat/model-evaluation";

const env = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env || {};
const liveEnabled = env.ME3_MODEL_EVAL_RUN === "1";

describe.skipIf(!liveEnabled)("live fixed-task model evaluation", () => {
  it("writes one metadata-only report for the configured candidates", async () => {
    const selected = selectCandidates(env.ME3_MODEL_EVAL_CANDIDATES);
    const image = await readFile(
      new URL("../../web/public/me3-logo-dark.png", import.meta.url),
    );
    const base64 = bytesToBase64(image);
    const report = await runFixedModelEvaluation({
      candidates: selected.map(createLiveCandidate),
      visionImage: {
        name: "me3-logo-dark.png",
        mimeType: "image/png",
        base64,
        dataUrl: `data:image/png;base64,${base64}`,
      },
    });

    console.info(`ME3_MODEL_EVAL_RESULTS ${JSON.stringify(report)}`);
    expect(report.candidates).toHaveLength(selected.length);
    expect(report.candidates.every((candidate) => candidate.totals.tasks === 30)).toBe(true);
    expect(FIXED_MODEL_EVALUATION_TASKS).toHaveLength(30);
  });
});

function selectCandidates(value: string | undefined): ModelEvaluationCandidateConfig[] {
  const requested = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!requested?.length) {
    return FIXED_MODEL_EVALUATION_CANDIDATES.filter(
      (candidate) => candidate.enabledByDefault,
    );
  }
  const byId = new Map(
    FIXED_MODEL_EVALUATION_CANDIDATES.map((candidate) => [candidate.id, candidate]),
  );
  return requested.map((id) => {
    const candidate = byId.get(id);
    if (!candidate) throw new Error(`Unknown model evaluation candidate: ${id}`);
    return candidate;
  });
}

function createLiveCandidate(
  config: ModelEvaluationCandidateConfig,
): ModelEvaluationCandidate {
  if (config.providerId === "workers-ai") {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
    const apiToken = env.CLOUDFLARE_API_TOKEN?.trim() || "";
    const configured = Boolean(accountId && apiToken);
    return {
      ...config,
      route: {
        providerId: "workers-ai",
        model: config.model,
        backupModel: null,
        apiKey: null,
        ai: configured
          ? {
              run: (model, input) =>
                runWorkersAiRest(accountId, apiToken, model, input),
            }
          : null,
        aiGateway: null,
        configured,
      },
    };
  }

  const apiKey =
    config.providerId === "anthropic"
      ? env.ME3_MODEL_EVAL_ANTHROPIC_API_KEY?.trim() || null
      : env.ME3_MODEL_EVAL_OPENAI_API_KEY?.trim() || null;
  return {
    ...config,
    route: {
      providerId: config.providerId,
      model: config.model,
      backupModel: null,
      apiKey,
      ai: null,
      aiGateway: null,
      configured: Boolean(apiKey),
    },
  };
}

async function runWorkersAiRest(
  accountId: string,
  apiToken: string,
  model: string,
  input: unknown,
): Promise<unknown> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!response.ok) throw new Error(`Workers AI request failed (${response.status})`);
  return payload?.result ?? payload;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
