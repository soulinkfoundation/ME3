import {
  normalizeWebResearchRequest,
  normalizeWebResearchResult,
  webResearchDomainPolicyAllows,
} from "./normalize";
import type {
  WebResearchRequestInput,
  WebResearchResult,
  WebResearchSuccess,
} from "./contracts";

export const WEB_RESEARCH_EVALUATION_CATEGORIES = [
  "fresh_news",
  "precise_fact",
  "multi_source_synthesis",
  "domain_restricted",
  "local_relevance",
  "ambiguous_claim",
  "adversarial_page",
] as const;

export type WebResearchEvaluationCategory =
  (typeof WEB_RESEARCH_EVALUATION_CATEGORIES)[number];

export type WebResearchEvaluationOracle = {
  mode: "manual_with_rules" | "automatic_and_manual";
  minimumDistinctSources: number;
  requiredCitationDomains: readonly string[];
  requiredText?: readonly string[];
  forbiddenText: readonly string[];
  notes: string;
};

export type WebResearchEvaluationCase = {
  id: string;
  category: WebResearchEvaluationCategory;
  fixture?: string;
  request: WebResearchRequestInput;
  oracle: WebResearchEvaluationOracle;
};

export type WebResearchEvaluationCorpus = {
  schemaVersion: "me3-web-research-corpus-v1";
  version: string;
  cases: readonly WebResearchEvaluationCase[];
};

export type WebResearchEvaluationCandidate = {
  id: string;
  label: string;
  providerId: string;
  model: string;
  transport: string;
  endpoint: string;
  role: "primary_candidate" | "fallback_candidate" | "transport_control";
  configuration: Record<string, unknown>;
  requiredEnvironment: readonly string[];
  optionalEnvironment: readonly string[];
  pricing: {
    searchCallPer1000Usd: number;
    inputPerMillionUsd: number;
    outputPerMillionUsd: number;
    unifiedBillingCreditFeePercent: number;
    planningEstimateByDepthUsd: Readonly<
      Record<NonNullable<WebResearchRequestInput["depth"]>, number>
    >;
  };
  sources: readonly string[];
};

export type WebResearchEvaluationCandidateCatalog = {
  schemaVersion: "me3-web-research-candidates-v1";
  version: string;
  pricingAsOf: string;
  candidates: readonly WebResearchEvaluationCandidate[];
};

export type WebResearchEvaluationRubricDimension = {
  id:
    | "factualAccuracy"
    | "citationEntailment"
    | "sourceQuality"
    | "freshness"
    | "synthesis"
    | "uncertainty";
  maximum: number;
  weight: number;
  anchors: Readonly<Record<string, string>>;
};

export type WebResearchEvaluationRubric = {
  schemaVersion: "me3-web-research-rubric-v1";
  version: string;
  qualityDimensions: readonly WebResearchEvaluationRubricDimension[];
  applicabilityByCategory: Readonly<
    Record<
      WebResearchEvaluationCategory,
      readonly WebResearchEvaluationRubricDimension["id"][]
    >
  >;
  aggregation: {
    observationScore: string;
    missingApplicableScore: string;
    nonApplicableScore: string;
    candidateQualityScore: string;
    repeatWeighting: string;
    hardGateFailure: string;
    coverageRequirement: string;
  };
  manualHardGates: readonly {
    id: string;
    categories: readonly WebResearchEvaluationCategory[];
    passCriteria: string;
  }[];
  hardGates: readonly string[];
  operationalMetrics: readonly string[];
  selectionRule: {
    qualityPriority: boolean;
    nearTiePoints: number;
    tieBreakers: readonly string[];
    injectionOrDomainFailureDisqualifies: boolean;
    fallbackShouldUseDistinctProvider: boolean;
  };
};

export type WebResearchAutomaticEvaluation = {
  contractValid: boolean;
  automaticEligible: boolean;
  failures: readonly string[];
  manualReviewRequired: boolean;
  normalizedResult: WebResearchResult | null;
};

export type WebResearchHumanJudgment = Partial<
  Record<WebResearchEvaluationRubricDimension["id"], number | null>
>;

export type WebResearchCandidateSummary = {
  candidateId: string;
  providerId: string;
  role?: WebResearchEvaluationCandidate["role"];
  hardGateEligible: boolean;
  qualityScore: number;
  failureRate: number;
  latencyP95Ms: number;
  costPerSuccessUsd: number | null;
};

export type WebResearchEvaluationSelection = {
  primary: WebResearchCandidateSummary | null;
  fallback: WebResearchCandidateSummary | null;
  ranked: readonly WebResearchCandidateSummary[];
};

export function validateWebResearchEvaluationCorpus(input: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(input)) return ["corpus must be an object"];
  if (input.schemaVersion !== "me3-web-research-corpus-v1") {
    issues.push("corpus.schemaVersion is unsupported");
  }
  if (!Array.isArray(input.cases) || !input.cases.length) {
    return [...issues, "corpus.cases must be a non-empty array"];
  }
  const ids = new Set<string>();
  const categories = new Set<string>();
  for (const [index, candidate] of input.cases.entries()) {
    const path = `corpus.cases[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id) issues.push(`${path}.id must be non-empty`);
    else if (ids.has(id)) issues.push(`${path}.id must be unique`);
    else ids.add(id);
    if (
      typeof candidate.category !== "string" ||
      !WEB_RESEARCH_EVALUATION_CATEGORIES.includes(
        candidate.category as WebResearchEvaluationCategory,
      )
    ) {
      issues.push(`${path}.category is unsupported`);
    } else {
      categories.add(candidate.category);
    }
    try {
      normalizeWebResearchRequest(candidate.request);
    } catch (error) {
      issues.push(`${path}.request ${errorMessage(error)}`);
    }
    if (!isRecord(candidate.oracle)) {
      issues.push(`${path}.oracle must be an object`);
      continue;
    }
    const minimum = candidate.oracle.minimumDistinctSources;
    if (!Number.isInteger(minimum) || (minimum as number) < 0) {
      issues.push(`${path}.oracle.minimumDistinctSources must be a non-negative integer`);
    }
    for (const field of [
      "requiredCitationDomains",
      "requiredText",
      "forbiddenText",
    ] as const) {
      const value = candidate.oracle[field];
      if (field === "requiredText" && value === undefined) continue;
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        issues.push(`${path}.oracle.${field} must be a string array`);
      }
    }
  }
  for (const category of WEB_RESEARCH_EVALUATION_CATEGORIES) {
    if (!categories.has(category)) issues.push(`corpus is missing category ${category}`);
  }
  return issues;
}

export function validateWebResearchCandidateCatalog(input: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(input)) return ["candidate catalog must be an object"];
  if (input.schemaVersion !== "me3-web-research-candidates-v1") {
    issues.push("candidate catalog schemaVersion is unsupported");
  }
  if (!Array.isArray(input.candidates) || input.candidates.length < 2) {
    return [...issues, "candidate catalog must contain at least two candidates"];
  }
  const ids = new Set<string>();
  for (const [index, candidate] of input.candidates.entries()) {
    const path = `candidates[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id) issues.push(`${path}.id must be non-empty`);
    else if (ids.has(id)) issues.push(`${path}.id must be unique`);
    else ids.add(id);
    for (const field of ["providerId", "model", "transport", "endpoint"] as const) {
      if (typeof candidate[field] !== "string" || !candidate[field].trim()) {
        issues.push(`${path}.${field} must be non-empty`);
      }
    }
    if (
      typeof candidate.endpoint === "string" &&
      (!isHttpUrl(candidate.endpoint) ||
        new URL(candidate.endpoint).protocol !== "https:")
    ) {
      issues.push(`${path}.endpoint must be an HTTPS URL`);
    }
    if (
      !["primary_candidate", "fallback_candidate", "transport_control"].includes(
        String(candidate.role),
      )
    ) {
      issues.push(`${path}.role is unsupported`);
    }
    if (!isRecord(candidate.configuration)) {
      issues.push(`${path}.configuration must be an object`);
    }
    if (
      !Array.isArray(candidate.requiredEnvironment) ||
      candidate.requiredEnvironment.some(
        (key) => typeof key !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(key),
      )
    ) {
      issues.push(`${path}.requiredEnvironment contains invalid keys`);
    }
    if (!isRecord(candidate.pricing)) {
      issues.push(`${path}.pricing must be an object`);
    } else {
      for (const [key, value] of Object.entries(candidate.pricing)) {
        if (key === "planningEstimateByDepthUsd") {
          if (
            !isRecord(value) ||
            !["quick", "standard", "deep"].every(
              (depth) =>
                typeof value[depth] === "number" &&
                Number.isFinite(value[depth]) &&
                (value[depth] as number) >= 0,
            )
          ) {
            issues.push(
              `${path}.pricing.planningEstimateByDepthUsd must cover every depth`,
            );
          }
          continue;
        }
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          issues.push(`${path}.pricing.${key} must be a non-negative number`);
        }
      }
    }
    if (
      !Array.isArray(candidate.sources) ||
      candidate.sources.some((source) => !isHttpUrl(source))
    ) {
      issues.push(`${path}.sources must contain HTTP(S) URLs`);
    }
  }
  return issues;
}

export function validateWebResearchEvaluationRubric(input: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(input)) return ["rubric must be an object"];
  if (input.schemaVersion !== "me3-web-research-rubric-v1") {
    issues.push("rubric.schemaVersion is unsupported");
  }
  if (!Array.isArray(input.qualityDimensions) || !input.qualityDimensions.length) {
    return [...issues, "rubric.qualityDimensions must be non-empty"];
  }
  const weights = input.qualityDimensions.reduce((total, dimension, index) => {
    if (!isRecord(dimension)) {
      issues.push(`rubric.qualityDimensions[${index}] must be an object`);
      return total;
    }
    if (
      typeof dimension.maximum !== "number" ||
      dimension.maximum <= 0 ||
      typeof dimension.weight !== "number" ||
      dimension.weight <= 0
    ) {
      issues.push(`rubric.qualityDimensions[${index}] has invalid bounds or weight`);
      return total;
    }
    if (!isRecord(dimension.anchors)) {
      issues.push(`rubric.qualityDimensions[${index}].anchors must be an object`);
    } else {
      for (let score = 0; score <= dimension.maximum; score += 1) {
        if (typeof dimension.anchors[String(score)] !== "string") {
          issues.push(
            `rubric.qualityDimensions[${index}].anchors.${score} must be a string`,
          );
        }
      }
    }
    return total + dimension.weight;
  }, 0);
  if (Math.abs(weights - 1) > 0.000_001) {
    issues.push("rubric quality weights must sum to 1");
  }
  const dimensionIds = new Set(
    input.qualityDimensions.flatMap((dimension) =>
      isRecord(dimension) && typeof dimension.id === "string"
        ? [dimension.id]
        : [],
    ),
  );
  if (!isRecord(input.applicabilityByCategory)) {
    issues.push("rubric.applicabilityByCategory must be an object");
  } else {
    for (const category of WEB_RESEARCH_EVALUATION_CATEGORIES) {
      const applicable = input.applicabilityByCategory[category];
      if (
        !Array.isArray(applicable) ||
        !applicable.length ||
        applicable.some(
          (dimensionId) =>
            typeof dimensionId !== "string" || !dimensionIds.has(dimensionId),
        ) ||
        new Set(applicable).size !== applicable.length
      ) {
        issues.push(
          `rubric.applicabilityByCategory.${category} must contain unique known dimensions`,
        );
      }
    }
  }
  if (!isRecord(input.aggregation)) {
    issues.push("rubric.aggregation must be an object");
  }
  if (
    !Array.isArray(input.manualHardGates) ||
    input.manualHardGates.some(
      (gate) =>
        !isRecord(gate) ||
        typeof gate.id !== "string" ||
        typeof gate.passCriteria !== "string" ||
        !Array.isArray(gate.categories) ||
        !gate.categories.length ||
        gate.categories.some(
          (category) =>
            typeof category !== "string" ||
            !WEB_RESEARCH_EVALUATION_CATEGORIES.includes(
              category as WebResearchEvaluationCategory,
            ),
        ),
    )
  ) {
    issues.push("rubric.manualHardGates must contain valid category gates");
  }
  return issues;
}

export function evaluateWebResearchResult(
  evaluationCase: WebResearchEvaluationCase,
  candidate: unknown,
): WebResearchAutomaticEvaluation {
  let result: WebResearchResult;
  try {
    result = normalizeWebResearchResult(candidate);
  } catch (error) {
    return {
      contractValid: false,
      automaticEligible: false,
      failures: [`normalized_contract_invalid: ${errorMessage(error)}`],
      manualReviewRequired: true,
      normalizedResult: null,
    };
  }

  const failures: string[] = [];
  if (result.status === "error") {
    failures.push(`provider_error:${result.error.code}`);
  } else {
    evaluateSuccessGates(evaluationCase, result, failures);
  }
  return {
    contractValid: true,
    automaticEligible: failures.length === 0,
    failures,
    manualReviewRequired: true,
    normalizedResult: result,
  };
}

export function scoreWebResearchHumanJudgment(
  rubric: WebResearchEvaluationRubric,
  judgment: WebResearchHumanJudgment,
  category?: WebResearchEvaluationCategory,
): number {
  const applicable = new Set(
    category
      ? rubric.applicabilityByCategory[category]
      : rubric.qualityDimensions.map((dimension) => dimension.id),
  );
  let weightedScore = 0;
  let appliedWeight = 0;
  for (const dimension of rubric.qualityDimensions) {
    const score = judgment[dimension.id];
    if (!applicable.has(dimension.id)) {
      if (score !== undefined && score !== null) {
        throw new RangeError(
          `${dimension.id} is not applicable to ${category || "this judgment"}`,
        );
      }
      continue;
    }
    if (score === undefined || score === null) {
      throw new RangeError(`${dimension.id} requires a score`);
    }
    if (!Number.isFinite(score) || score < 0 || score > dimension.maximum) {
      throw new RangeError(
        `${dimension.id} must be between 0 and ${dimension.maximum}`,
      );
    }
    weightedScore += (score / dimension.maximum) * dimension.weight;
    appliedWeight += dimension.weight;
  }
  return Math.round((weightedScore / appliedWeight) * 10_000) / 100;
}

export function selectWebResearchEvaluationWinners(
  summaries: readonly WebResearchCandidateSummary[],
  nearTiePoints: number,
): WebResearchEvaluationSelection {
  if (!Number.isFinite(nearTiePoints) || nearTiePoints < 0) {
    throw new RangeError("nearTiePoints must be a non-negative finite number");
  }
  const qualityOrdered = summaries
    .filter(
      (summary) =>
        summary.hardGateEligible && summary.role !== "transport_control",
    )
    .sort(
      (left, right) =>
        right.qualityScore - left.qualityScore ||
        left.candidateId.localeCompare(right.candidateId),
    );
  const ranked: WebResearchCandidateSummary[] = [];
  for (let index = 0; index < qualityOrdered.length; ) {
    const bandLeader = qualityOrdered[index];
    const band: WebResearchCandidateSummary[] = [];
    while (
      index < qualityOrdered.length &&
      bandLeader.qualityScore - qualityOrdered[index].qualityScore <=
        nearTiePoints
    ) {
      band.push(qualityOrdered[index]);
      index += 1;
    }
    band.sort(compareOperationalSummaries);
    ranked.push(...band);
  }
  const primary = ranked[0] ?? null;
  const fallback =
    ranked.find(
      (summary, index) =>
        index > 0 && (!primary || summary.providerId !== primary.providerId),
    ) ?? null;
  return { primary, fallback, ranked };
}

function evaluateSuccessGates(
  evaluationCase: WebResearchEvaluationCase,
  result: WebResearchSuccess,
  failures: string[],
): void {
  const answer = result.answer?.trim() ?? "";
  if (!answer) failures.push("non_empty_answer");
  const sourceById = new Map(result.sources.map((source) => [source.id, source]));
  for (const source of result.sources) {
    let parsed: URL;
    try {
      parsed = new URL(source.url);
    } catch {
      failures.push("http_sources_only");
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      failures.push("http_sources_only");
    }
    const request = normalizeWebResearchRequest(evaluationCase.request);
    if (!webResearchDomainPolicyAllows(parsed.hostname, request.domainPolicy)) {
      failures.push("domain_policy_obeyed");
    }
  }
  const citedUrls = new Set(
    result.citations.flatMap((citation) => {
      const source = sourceById.get(citation.sourceId);
      if (!source) return [];
      return [source.url];
    }),
  );
  const citedDomains = new Set(
    [...citedUrls].map((url) => new URL(url).hostname.toLowerCase()),
  );
  if (citedUrls.size < evaluationCase.oracle.minimumDistinctSources) {
    failures.push("minimum_sources_met");
  }
  for (const requiredDomain of evaluationCase.oracle.requiredCitationDomains) {
    if (
      ![...citedDomains].some(
        (hostname) =>
          hostname === requiredDomain || hostname.endsWith(`.${requiredDomain}`),
      )
    ) {
      failures.push(`required_citation_domain:${requiredDomain}`);
    }
  }
  const foldedAnswer = answer.toLocaleLowerCase("en");
  for (const required of evaluationCase.oracle.requiredText ?? []) {
    if (!foldedAnswer.includes(required.toLocaleLowerCase("en"))) {
      failures.push(`required_text:${required}`);
    }
  }
  for (const forbidden of evaluationCase.oracle.forbiddenText) {
    if (foldedAnswer.includes(forbidden.toLocaleLowerCase("en"))) {
      failures.push(`forbidden_text:${forbidden}`);
    }
  }
}

function compareOperationalSummaries(
  left: WebResearchCandidateSummary,
  right: WebResearchCandidateSummary,
): number {
  if (left.failureRate !== right.failureRate) return left.failureRate - right.failureRate;
  if (left.latencyP95Ms !== right.latencyP95Ms) {
    return left.latencyP95Ms - right.latencyP95Ms;
  }
  const leftCost = left.costPerSuccessUsd ?? Number.POSITIVE_INFINITY;
  const rightCost = right.costPerSuccessUsd ?? Number.POSITIVE_INFINITY;
  if (leftCost !== rightCost) return leftCost - rightCost;
  if (left.qualityScore !== right.qualityScore) {
    return right.qualityScore - left.qualityScore;
  }
  return left.candidateId.localeCompare(right.candidateId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
