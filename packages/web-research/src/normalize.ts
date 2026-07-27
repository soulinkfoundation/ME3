import {
  WEB_CONTENT_RETRIEVAL_MODES,
  WEB_RESEARCH_DEPTHS,
  type WebContentFetcher,
  type WebContentFetcherAdapter,
  type WebContentRequest,
  type WebContentRequestInput,
  type WebContentResult,
  type WebContentSuccess,
  type WebResearchCitation,
  type WebResearchDomainPolicy,
  type WebResearchError,
  type WebResearchErrorCode,
  type WebResearchEvidence,
  type WebResearchFailure,
  type WebResearchFreshness,
  type WebResearchLocation,
  type WebResearchProviderAdapter,
  type WebResearchProviderCapabilities,
  type WebResearchProviderTrace,
  type WebResearchRequest,
  type WebResearchRequestInput,
  type WebResearchResult,
  type WebResearchService,
  type WebResearchSource,
  type WebResearchSuccess,
  type WebResearchUsage,
} from "./contracts";

const MAX_QUERY_CHARACTERS = 2_048;
const MAX_RESULT_LIMIT = 20;
const DEFAULT_RESULT_LIMIT = 8;
const MAX_SOURCE_COUNT = 50;
const MAX_EVIDENCE_COUNT = 200;
const MAX_CITATION_COUNT = 200;
const MAX_CONTENT_CHARACTERS = 200_000;
const DEFAULT_CONTENT_CHARACTERS = 50_000;
const WEB_RESEARCH_ERROR_CODES = new Set<WebResearchErrorCode>([
  "invalid_request",
  "not_configured",
  "unsupported_capability",
  "policy_denied",
  "rate_limited",
  "quota_exceeded",
  "timeout",
  "cancelled",
  "not_found",
  "content_too_large",
  "challenge",
  "upstream_unavailable",
  "malformed_provider_response",
  "unknown",
]);

export class WebResearchContractError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "WebResearchContractError";
    this.path = path;
  }
}

export function normalizeWebResearchRequest(input: unknown): WebResearchRequest {
  const value = record(input, "request");
  exactKeys(
    value,
    [
      "query",
      "depth",
      "freshness",
      "locale",
      "location",
      "resultLimit",
      "domainPolicy",
    ],
    "request",
  );

  return {
    query: requiredText(value.query, "request.query", MAX_QUERY_CHARACTERS),
    depth:
      value.depth === undefined
        ? "standard"
        : enumeration(value.depth, WEB_RESEARCH_DEPTHS, "request.depth"),
    freshness: normalizeFreshness(value.freshness),
    locale: normalizeLocale(value.locale),
    location: normalizeLocation(value.location),
    resultLimit:
      value.resultLimit === undefined
        ? DEFAULT_RESULT_LIMIT
        : integer(value.resultLimit, "request.resultLimit", 1, MAX_RESULT_LIMIT),
    domainPolicy: normalizeDomainPolicy(value.domainPolicy),
  };
}

export function normalizeWebContentRequest(input: unknown): WebContentRequest {
  const value = record(input, "request");
  exactKeys(value, ["url", "retrievalMode", "maxCharacters"], "request");
  return {
    url: publicHttpUrl(value.url, "request.url"),
    retrievalMode:
      value.retrievalMode === undefined
        ? "auto"
        : enumeration(
            value.retrievalMode,
            WEB_CONTENT_RETRIEVAL_MODES,
            "request.retrievalMode",
          ),
    maxCharacters:
      value.maxCharacters === undefined
        ? DEFAULT_CONTENT_CHARACTERS
        : integer(
            value.maxCharacters,
            "request.maxCharacters",
            1,
            MAX_CONTENT_CHARACTERS,
          ),
  };
}

export function webResearchDomainPolicyAllows(
  hostname: string,
  policy: WebResearchDomainPolicy,
): boolean {
  const normalizedHostname = normalizeHostname(hostname, "hostname");
  if (policy.allowedDomains.length) {
    return policy.allowedDomains.some((domain) =>
      hostnameMatchesDomain(normalizedHostname, domain),
    );
  }
  return !policy.blockedDomains.some((domain) =>
    hostnameMatchesDomain(normalizedHostname, domain),
  );
}

export function normalizeWebResearchResult(input: unknown): WebResearchResult {
  const value = record(input, "result");
  if (value.status === "error") return normalizeFailure(value, "search");
  if (value.status !== "success") {
    fail("result.status", 'must be either "success" or "error"');
  }
  return normalizeSearchSuccess(value);
}

export function normalizeWebContentResult(input: unknown): WebContentResult {
  const value = record(input, "result");
  if (value.status === "error") return normalizeFailure(value, "open");
  if (value.status !== "success") {
    fail("result.status", 'must be either "success" or "error"');
  }
  return normalizeContentSuccess(value);
}

export function createWebResearchService(
  adapter: WebResearchProviderAdapter,
): WebResearchService {
  return {
    getCapabilities: () => adapter.capabilities,
    async search(
      request: WebResearchRequestInput,
      context,
    ): Promise<WebResearchResult> {
      const normalizedRequest = normalizeWebResearchRequest(request);
      const candidate = await adapter.search(normalizedRequest, context);
      const result = normalizeWebResearchResult(candidate);
      if (result.status === "success" && result.query !== normalizedRequest.query) {
        fail("result.query", "must match the normalized request query");
      }
      if (result.status === "success" && result.sources.length > normalizedRequest.resultLimit) {
        fail("result.sources", "must not exceed request.resultLimit");
      }
      validateTraceIdentity(result.trace, adapter.providerId, adapter.adapterId);
      return result;
    },
  };
}

export function createWebContentFetcher(
  adapter: WebContentFetcherAdapter,
): WebContentFetcher {
  return {
    getCapabilities: () => adapter.capabilities,
    async open(
      request: WebContentRequestInput,
      context,
    ): Promise<WebContentResult> {
      const normalizedRequest = normalizeWebContentRequest(request);
      const candidate = await adapter.open(normalizedRequest, context);
      const result = normalizeWebContentResult(candidate);
      if (
        result.status === "success" &&
        result.evidence.text.length > normalizedRequest.maxCharacters
      ) {
        fail("result.evidence.text", "must not exceed request.maxCharacters");
      }
      validateTraceIdentity(result.trace, adapter.providerId, adapter.adapterId);
      return result;
    },
  };
}

function normalizeFreshness(value: unknown): WebResearchFreshness {
  if (value === undefined || value === null) return { kind: "any" };
  const freshness = record(value, "request.freshness");
  if (freshness.kind === "any") {
    exactKeys(freshness, ["kind"], "request.freshness");
    return { kind: "any" };
  }
  if (freshness.kind === "max_age") {
    exactKeys(freshness, ["kind", "maxAgeSeconds"], "request.freshness");
    return {
      kind: "max_age",
      maxAgeSeconds: integer(
        freshness.maxAgeSeconds,
        "request.freshness.maxAgeSeconds",
        1,
        31_536_000,
      ),
    };
  }
  if (freshness.kind === "date_range") {
    exactKeys(freshness, ["kind", "from", "to"], "request.freshness");
    const from = optionalTimestamp(freshness.from, "request.freshness.from");
    const to = optionalTimestamp(freshness.to, "request.freshness.to");
    if (!from && !to) {
      fail("request.freshness", "date_range requires from, to, or both");
    }
    if (from && to && Date.parse(from) > Date.parse(to)) {
      fail("request.freshness", "from must not be after to");
    }
    return { kind: "date_range", from, to };
  }
  fail(
    "request.freshness.kind",
    'must be "any", "max_age", or "date_range"',
  );
}

function normalizeLocale(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const locale = requiredText(value, "request.locale", 64);
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {
    return fail("request.locale", "must be a valid BCP 47 locale");
  }
}

function normalizeLocation(value: unknown): WebResearchLocation | null {
  if (value === undefined || value === null) return null;
  const location = record(value, "request.location");
  exactKeys(location, ["countryCode", "region", "city", "timezone"], "request.location");
  const countryCode =
    location.countryCode === undefined || location.countryCode === null
      ? null
      : requiredText(location.countryCode, "request.location.countryCode", 2).toUpperCase();
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    fail("request.location.countryCode", "must be a two-letter country code");
  }
  const region = optionalText(location.region, "request.location.region", 120);
  const city = optionalText(location.city, "request.location.city", 120);
  const timezone = optionalText(location.timezone, "request.location.timezone", 80);
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      fail("request.location.timezone", "must be a valid IANA timezone");
    }
  }
  if (!countryCode && !region && !city && !timezone) {
    fail("request.location", "must contain at least one location field");
  }
  return { countryCode, region, city, timezone };
}

function normalizeDomainPolicy(value: unknown): WebResearchDomainPolicy {
  if (value === undefined || value === null) {
    return { allowedDomains: [], blockedDomains: [] };
  }
  const policy = record(value, "request.domainPolicy");
  exactKeys(policy, ["allowedDomains", "blockedDomains"], "request.domainPolicy");
  const allowedDomains = normalizeDomains(
    policy.allowedDomains,
    "request.domainPolicy.allowedDomains",
  );
  const blockedDomains = normalizeDomains(
    policy.blockedDomains,
    "request.domainPolicy.blockedDomains",
  );
  if (allowedDomains.length && blockedDomains.length) {
    fail(
      "request.domainPolicy",
      "allowedDomains and blockedDomains cannot both be populated",
    );
  }
  return { allowedDomains, blockedDomains };
}

function normalizeDomains(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > 50) fail(path, "must contain at most 50 domains");
  const domains = value.map((item, index) => {
    const domain = requiredText(item, `${path}[${index}]`, 253)
      .toLowerCase()
      .replace(/\.$/, "");
    if (
      domain.includes("://") ||
      domain.includes("/") ||
      domain.includes("@") ||
      domain.includes(":")
    ) {
      fail(`${path}[${index}]`, "must be a bare domain without a scheme, path, or port");
    }
    let parsed: URL;
    try {
      parsed = new URL(`https://${domain}`);
    } catch {
      return fail(`${path}[${index}]`, "must be a valid domain");
    }
    const normalizedDomain = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !normalizedDomain.includes(".") ||
      isIpLiteral(normalizedDomain)
    ) {
      fail(`${path}[${index}]`, "must be a valid domain");
    }
    return normalizedDomain;
  });
  return [...new Set(domains)];
}

function normalizeSearchSuccess(value: Record<string, unknown>): WebResearchSuccess {
  exactKeys(
    value,
    [
      "status",
      "query",
      "answer",
      "sources",
      "evidence",
      "citations",
      "searchedAt",
      "usage",
      "trace",
    ],
    "result",
  );
  const answer = optionalText(value.answer, "result.answer", 100_000);
  const sources = normalizeSources(value.sources);
  const sourceIds = uniqueIds(sources, "result.sources");
  const evidence = normalizeEvidence(value.evidence, sourceIds);
  const evidenceIds = uniqueIds(evidence, "result.evidence");
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const citations = normalizeCitations(
    value.citations,
    sourceIds,
    evidenceIds,
    evidenceById,
    answer,
  );
  uniqueIds(citations, "result.citations");
  const trace = normalizeTrace(value.trace, "result.trace");
  if (trace.operation !== "search") {
    fail("result.trace.operation", 'must be "search" for a search result');
  }
  return {
    status: "success",
    query: requiredText(value.query, "result.query", MAX_QUERY_CHARACTERS),
    answer,
    sources,
    evidence,
    citations,
    searchedAt: timestamp(value.searchedAt, "result.searchedAt"),
    usage: normalizeUsage(value.usage, "result.usage"),
    trace,
  };
}

function normalizeContentSuccess(value: Record<string, unknown>): WebContentSuccess {
  exactKeys(
    value,
    [
      "status",
      "source",
      "evidence",
      "retrievalMode",
      "contentFormat",
      "truncated",
      "usage",
      "trace",
    ],
    "result",
  );
  const source = normalizeSource(value.source, "result.source");
  const evidence = normalizeEvidenceItem(
    value.evidence,
    "result.evidence",
    MAX_CONTENT_CHARACTERS,
  );
  if (evidence.sourceId !== source.id) {
    fail("result.evidence.sourceId", "must reference result.source.id");
  }
  const trace = normalizeTrace(value.trace, "result.trace");
  if (trace.operation !== "open") {
    fail("result.trace.operation", 'must be "open" for an open result');
  }
  return {
    status: "success",
    source,
    evidence,
    retrievalMode: enumeration(
      value.retrievalMode,
      ["static", "rendered"] as const,
      "result.retrievalMode",
    ),
    contentFormat: enumeration(
      value.contentFormat,
      ["markdown", "text"] as const,
      "result.contentFormat",
    ),
    truncated: boolean(value.truncated, "result.truncated"),
    usage: normalizeUsage(value.usage, "result.usage"),
    trace,
  };
}

function normalizeFailure(
  value: Record<string, unknown>,
  expectedOperation: "search" | "open",
): WebResearchFailure {
  exactKeys(value, ["status", "error", "usage", "trace"], "result");
  const trace =
    value.trace === null || value.trace === undefined
      ? null
      : normalizeTrace(value.trace, "result.trace");
  if (trace && trace.operation !== expectedOperation) {
    fail(
      "result.trace.operation",
      `must be "${expectedOperation}" for this result`,
    );
  }
  return {
    status: "error",
    error: normalizeError(value.error),
    usage: normalizeUsage(value.usage, "result.usage"),
    trace,
  };
}

function normalizeSources(value: unknown): WebResearchSource[] {
  if (!Array.isArray(value)) fail("result.sources", "must be an array");
  if (value.length > MAX_SOURCE_COUNT) {
    fail("result.sources", `must contain at most ${MAX_SOURCE_COUNT} sources`);
  }
  return value.map((item, index) => normalizeSource(item, `result.sources[${index}]`));
}

function normalizeSource(value: unknown, path: string): WebResearchSource {
  const source = record(value, path);
  exactKeys(
    source,
    [
      "id",
      "url",
      "canonicalUrl",
      "title",
      "publisher",
      "publishedAt",
      "retrievedAt",
    ],
    path,
  );
  return {
    id: stableId(source.id, `${path}.id`),
    url: publicHttpUrl(source.url, `${path}.url`),
    canonicalUrl:
      source.canonicalUrl === null || source.canonicalUrl === undefined
        ? null
        : publicHttpUrl(source.canonicalUrl, `${path}.canonicalUrl`),
    title: requiredText(source.title, `${path}.title`, 1_000),
    publisher: optionalText(source.publisher, `${path}.publisher`, 500),
    publishedAt: optionalTimestamp(source.publishedAt, `${path}.publishedAt`),
    retrievedAt: timestamp(source.retrievedAt, `${path}.retrievedAt`),
  };
}

function normalizeEvidence(
  value: unknown,
  sourceIds: Set<string>,
): WebResearchEvidence[] {
  if (!Array.isArray(value)) fail("result.evidence", "must be an array");
  if (value.length > MAX_EVIDENCE_COUNT) {
    fail("result.evidence", `must contain at most ${MAX_EVIDENCE_COUNT} items`);
  }
  return value.map((item, index) => {
    const evidence = normalizeEvidenceItem(item, `result.evidence[${index}]`);
    if (!sourceIds.has(evidence.sourceId)) {
      fail(`result.evidence[${index}].sourceId`, "references an unknown source");
    }
    return evidence;
  });
}

function normalizeEvidenceItem(
  value: unknown,
  path: string,
  maxTextCharacters = 20_000,
): WebResearchEvidence {
  const evidence = record(value, path);
  exactKeys(evidence, ["id", "sourceId", "text", "relevanceScore"], path);
  return {
    id: stableId(evidence.id, `${path}.id`),
    sourceId: stableId(evidence.sourceId, `${path}.sourceId`),
    text: requiredText(evidence.text, `${path}.text`, maxTextCharacters),
    relevanceScore:
      evidence.relevanceScore === null || evidence.relevanceScore === undefined
        ? null
        : finiteNumber(evidence.relevanceScore, `${path}.relevanceScore`, 0, 1),
  };
}

function normalizeCitations(
  value: unknown,
  sourceIds: Set<string>,
  evidenceIds: Set<string>,
  evidenceById: Map<string, WebResearchEvidence>,
  answer: string | null,
): WebResearchCitation[] {
  if (!Array.isArray(value)) fail("result.citations", "must be an array");
  if (value.length > MAX_CITATION_COUNT) {
    fail("result.citations", `must contain at most ${MAX_CITATION_COUNT} items`);
  }
  return value.map((item, index) => {
    const path = `result.citations[${index}]`;
    const citation = record(item, path);
    exactKeys(citation, ["id", "sourceId", "evidenceIds", "label", "answerSpan"], path);
    const sourceId = stableId(citation.sourceId, `${path}.sourceId`);
    if (!sourceIds.has(sourceId)) {
      fail(`${path}.sourceId`, "references an unknown source");
    }
    if (!Array.isArray(citation.evidenceIds)) {
      fail(`${path}.evidenceIds`, "must be an array");
    }
    const normalizedEvidenceIds = citation.evidenceIds.map((evidenceId, evidenceIndex) => {
      const id = stableId(evidenceId, `${path}.evidenceIds[${evidenceIndex}]`);
      if (!evidenceIds.has(id)) {
        fail(`${path}.evidenceIds[${evidenceIndex}]`, "references unknown evidence");
      }
      if (evidenceById.get(id)?.sourceId !== sourceId) {
        fail(
          `${path}.evidenceIds[${evidenceIndex}]`,
          "must reference evidence from the citation source",
        );
      }
      return id;
    });
    if (new Set(normalizedEvidenceIds).size !== normalizedEvidenceIds.length) {
      fail(`${path}.evidenceIds`, "must not contain duplicates");
    }
    return {
      id: stableId(citation.id, `${path}.id`),
      sourceId,
      evidenceIds: normalizedEvidenceIds,
      label: requiredText(citation.label, `${path}.label`, 120),
      answerSpan: normalizeAnswerSpan(citation.answerSpan, `${path}.answerSpan`, answer),
    };
  });
}

function normalizeAnswerSpan(
  value: unknown,
  path: string,
  answer: string | null,
): { start: number; end: number } | null {
  if (value === null || value === undefined) return null;
  if (answer === null) fail(path, "requires a non-null result.answer");
  const span = record(value, path);
  exactKeys(span, ["start", "end"], path);
  const start = integer(span.start, `${path}.start`, 0, answer.length);
  const end = integer(span.end, `${path}.end`, 0, answer.length);
  if (end <= start) fail(path, "end must be greater than start");
  return { start, end };
}

function normalizeUsage(value: unknown, path: string): WebResearchUsage {
  const usage = record(value, path);
  exactKeys(
    usage,
    [
      "requests",
      "searchQueries",
      "pagesOpened",
      "inputTokens",
      "outputTokens",
      "bytesReceived",
      "cost",
    ],
    path,
  );
  return {
    requests: integer(usage.requests, `${path}.requests`, 0),
    searchQueries: integer(usage.searchQueries, `${path}.searchQueries`, 0),
    pagesOpened: integer(usage.pagesOpened, `${path}.pagesOpened`, 0),
    inputTokens: optionalInteger(usage.inputTokens, `${path}.inputTokens`),
    outputTokens: optionalInteger(usage.outputTokens, `${path}.outputTokens`),
    bytesReceived: optionalInteger(usage.bytesReceived, `${path}.bytesReceived`),
    cost: normalizeCost(usage.cost, `${path}.cost`),
  };
}

function normalizeCost(
  value: unknown,
  path: string,
): { amountMicros: number; currency: string } | null {
  if (value === null || value === undefined) return null;
  const cost = record(value, path);
  exactKeys(cost, ["amountMicros", "currency"], path);
  const currency = requiredText(cost.currency, `${path}.currency`, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    fail(`${path}.currency`, "must be a three-letter currency code");
  }
  return {
    amountMicros: integer(cost.amountMicros, `${path}.amountMicros`, 0),
    currency,
  };
}

function normalizeTrace(value: unknown, path: string): WebResearchProviderTrace {
  const trace = record(value, path);
  exactKeys(
    trace,
    [
      "providerId",
      "adapterId",
      "operation",
      "providerRequestId",
      "model",
      "startedAt",
      "durationMs",
      "attempts",
    ],
    path,
  );
  return {
    providerId: stableId(trace.providerId, `${path}.providerId`),
    adapterId: stableId(trace.adapterId, `${path}.adapterId`),
    operation: enumeration(
      trace.operation,
      ["search", "open"] as const,
      `${path}.operation`,
    ),
    providerRequestId: optionalText(
      trace.providerRequestId,
      `${path}.providerRequestId`,
      500,
    ),
    model: optionalText(trace.model, `${path}.model`, 500),
    startedAt: timestamp(trace.startedAt, `${path}.startedAt`),
    durationMs: integer(trace.durationMs, `${path}.durationMs`, 0),
    attempts: integer(trace.attempts, `${path}.attempts`, 1, 100),
  };
}

function normalizeError(value: unknown): WebResearchError {
  const error = record(value, "result.error");
  exactKeys(error, ["code", "message", "retryable", "retryAfterMs"], "result.error");
  if (typeof error.code !== "string" || !WEB_RESEARCH_ERROR_CODES.has(error.code as WebResearchErrorCode)) {
    fail("result.error.code", "is not a recognized web-research error code");
  }
  return {
    code: error.code as WebResearchErrorCode,
    message: requiredText(error.message, "result.error.message", 2_000),
    retryable: boolean(error.retryable, "result.error.retryable"),
    retryAfterMs: optionalInteger(error.retryAfterMs, "result.error.retryAfterMs"),
  };
}

function uniqueIds<T extends { id: string }>(items: readonly T[], path: string): Set<string> {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (ids.has(item.id)) fail(`${path}[${index}].id`, "must be unique");
    ids.add(item.id);
  }
  return ids;
}

function publicHttpUrl(value: unknown, path: string): string {
  const text = requiredText(value, path, 4_096);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return fail(path, "must be a valid absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(path, "must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) {
    fail(path, "must not contain credentials");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIpLiteral(hostname)
  ) {
    fail(path, "must target a public hostname");
  }
  parsed.hash = "";
  return parsed.toString();
}

function timestamp(value: unknown, path: string): string {
  const text = requiredText(value, path, 64);
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/i.exec(
      text,
    );
  if (!match) return fail(path, "must be a valid ISO date-time");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[7]!;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return fail(path, "must be a valid ISO date-time");
  }
  if (offset !== "Z" && offset !== "z") {
    const [offsetHours, offsetMinutes] = offset.slice(1).split(":").map(Number);
    if (
      offsetHours === undefined ||
      offsetMinutes === undefined ||
      offsetHours > 14 ||
      offsetMinutes > 59 ||
      (offsetHours === 14 && offsetMinutes !== 0)
    ) {
      return fail(path, "must be a valid ISO date-time");
    }
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return fail(path, "must be a valid ISO date-time");
  }
  return new Date(parsed).toISOString();
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function normalizeHostname(value: unknown, path: string): string {
  const hostname = requiredText(value, path, 253).toLowerCase().replace(/\.$/, "");
  let parsed: URL;
  try {
    parsed = new URL(`https://${hostname}`);
  } catch {
    return fail(path, "must be a valid hostname");
  }
  const normalized = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    isIpLiteral(normalized)
  ) {
    fail(path, "must be a valid non-IP hostname");
  }
  return normalized;
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function validateTraceIdentity(
  trace: WebResearchProviderTrace | null,
  providerId: string,
  adapterId: string,
): void {
  if (!trace) return;
  if (trace.providerId !== providerId) {
    fail("result.trace.providerId", "must match the selected adapter providerId");
  }
  if (trace.adapterId !== adapterId) {
    fail("result.trace.adapterId", "must match the selected adapter adapterId");
  }
}

function optionalTimestamp(value: unknown, path: string): string | null {
  return value === undefined || value === null || value === "" ? null : timestamp(value, path);
}

function stableId(value: unknown, path: string): string {
  const id = requiredText(value, path, 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    fail(path, "contains unsupported characters");
  }
  return id;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknown) fail(`${path}.${unknown}`, "is not part of the normalized contract");
}

function requiredText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== "string") return fail(path, "must be a string");
  const text = value.trim();
  if (!text) fail(path, "must not be empty");
  if (text.length > maxLength) fail(path, `must contain at most ${maxLength} characters`);
  return text;
}

function optionalText(value: unknown, path: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, path, maxLength);
}

function integer(
  value: unknown,
  path: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return fail(path, `must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function optionalInteger(value: unknown, path: string): number | null {
  return value === undefined || value === null ? null : integer(value, path, 0);
}

function finiteNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    return fail(path, `must be a number from ${minimum} to ${maximum}`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail(path, "must be a boolean");
}

function enumeration<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fail(path, `must be one of ${allowed.join(", ")}`);
}

function fail(path: string, message: string): never {
  throw new WebResearchContractError(path, message);
}
