export const WEB_RESEARCH_CONTRACT_VERSION = "2026-07-27.v1";
export const CORE_WEB_SEARCH_CAPABILITY_ID = "core.web.search";
export const CORE_WEB_OPEN_CAPABILITY_ID = "core.web.open";

export const WEB_RESEARCH_DEPTHS = ["quick", "standard", "deep"] as const;
export type WebResearchDepth = (typeof WEB_RESEARCH_DEPTHS)[number];

export type WebResearchFreshness =
  | { kind: "any" }
  | { kind: "max_age"; maxAgeSeconds: number }
  | { kind: "date_range"; from: string | null; to: string | null };

export type WebResearchFreshnessInput =
  | { kind: "any" }
  | { kind: "max_age"; maxAgeSeconds: number }
  | { kind: "date_range"; from?: string | null; to?: string | null };

export type WebResearchLocation = {
  countryCode: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
};

export type WebResearchDomainPolicy = {
  /**
   * IDNA ASCII hostnames. An entry matches that hostname and its subdomains.
   * Allow and block lists are mutually exclusive to avoid adapter precedence
   * differences; IP literals are not domain-policy entries.
   */
  allowedDomains: readonly string[];
  blockedDomains: readonly string[];
};

export type WebResearchRequest = {
  query: string;
  depth: WebResearchDepth;
  freshness: WebResearchFreshness;
  locale: string | null;
  location: WebResearchLocation | null;
  resultLimit: number;
  domainPolicy: WebResearchDomainPolicy;
};

export type WebResearchRequestInput = {
  query: string;
  depth?: WebResearchDepth;
  freshness?: WebResearchFreshnessInput | null;
  locale?: string | null;
  location?: Partial<WebResearchLocation> | null;
  resultLimit?: number;
  domainPolicy?: Partial<WebResearchDomainPolicy> | null;
};

export const WEB_CONTENT_RETRIEVAL_MODES = ["auto", "static", "rendered"] as const;
export type WebContentRetrievalMode = (typeof WEB_CONTENT_RETRIEVAL_MODES)[number];

export type WebContentRequest = {
  url: string;
  retrievalMode: WebContentRetrievalMode;
  maxCharacters: number;
};

export type WebContentRequestInput = {
  url: string;
  retrievalMode?: WebContentRetrievalMode;
  maxCharacters?: number;
};

export type WebResearchSource = {
  id: string;
  url: string;
  canonicalUrl: string | null;
  title: string;
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string;
};

export type WebResearchEvidence = {
  id: string;
  sourceId: string;
  text: string;
  relevanceScore: number | null;
};

export type WebResearchCitation = {
  id: string;
  sourceId: string;
  evidenceIds: readonly string[];
  label: string;
  /** Half-open offsets measured in UTF-16 code units, matching JS string indexing. */
  answerSpan: { start: number; end: number } | null;
};

export type WebResearchUsage = {
  requests: number;
  searchQueries: number;
  pagesOpened: number;
  inputTokens: number | null;
  outputTokens: number | null;
  bytesReceived: number | null;
  cost: { amountMicros: number; currency: string } | null;
};

export type WebResearchProviderTrace = {
  providerId: string;
  adapterId: string;
  operation: "search" | "open";
  providerRequestId: string | null;
  model: string | null;
  startedAt: string;
  durationMs: number;
  attempts: number;
};

export type WebResearchErrorCode =
  | "invalid_request"
  | "not_configured"
  | "unsupported_capability"
  | "policy_denied"
  | "rate_limited"
  | "quota_exceeded"
  | "timeout"
  | "cancelled"
  | "not_found"
  | "content_too_large"
  | "challenge"
  | "upstream_unavailable"
  | "malformed_provider_response"
  | "unknown";

export type WebResearchError = {
  code: WebResearchErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
};

export type WebResearchFailure = {
  status: "error";
  error: WebResearchError;
  usage: WebResearchUsage;
  trace: WebResearchProviderTrace | null;
};

export type WebResearchSuccess = {
  status: "success";
  query: string;
  answer: string | null;
  sources: readonly WebResearchSource[];
  evidence: readonly WebResearchEvidence[];
  citations: readonly WebResearchCitation[];
  searchedAt: string;
  usage: WebResearchUsage;
  trace: WebResearchProviderTrace;
};

export type WebResearchResult = WebResearchSuccess | WebResearchFailure;

export type WebContentSuccess = {
  status: "success";
  source: WebResearchSource;
  evidence: WebResearchEvidence;
  retrievalMode: Exclude<WebContentRetrievalMode, "auto">;
  contentFormat: "markdown" | "text";
  truncated: boolean;
  usage: WebResearchUsage;
  trace: WebResearchProviderTrace;
};

export type WebContentResult = WebContentSuccess | WebResearchFailure;

export type WebResearchProviderCapabilities = {
  depths: readonly WebResearchDepth[];
  freshness: {
    maxAge: boolean;
    dateRange: boolean;
  };
  locale: boolean;
  location: boolean;
  domainAllowlist: boolean;
  domainBlocklist: boolean;
  answerSynthesis: boolean;
  maxResults: number;
};

export type WebContentFetcherCapabilities = {
  retrievalModes: readonly WebContentRetrievalMode[];
  maxCharacters: number;
};

export type WebResearchExecutionContext = {
  requestId?: string;
  signal?: AbortSignal;
};

/**
 * Stable Core search boundary. Provider selection and credentials live behind it.
 */
export interface WebResearchService {
  getCapabilities(): WebResearchProviderCapabilities;
  search(
    request: WebResearchRequestInput,
    context?: WebResearchExecutionContext,
  ): Promise<WebResearchResult>;
}

/**
 * Stable Core page-opening boundary. It retrieves a selected public URL only;
 * authenticated browser actions are intentionally outside this contract.
 */
export interface WebContentFetcher {
  getCapabilities(): WebContentFetcherCapabilities;
  open(
    request: WebContentRequestInput,
    context?: WebResearchExecutionContext,
  ): Promise<WebContentResult>;
}

/**
 * A provider adapter consumes provider-specific payloads, events, and
 * annotations and returns a candidate normalized value. The service validates
 * that unknown value before it can cross the stable Core boundary.
 */
export interface WebResearchProviderAdapter {
  readonly providerId: string;
  readonly adapterId: string;
  readonly capabilities: WebResearchProviderCapabilities;
  search(
    request: WebResearchRequest,
    context?: WebResearchExecutionContext,
  ): Promise<unknown>;
}

export interface WebContentFetcherAdapter {
  readonly providerId: string;
  readonly adapterId: string;
  readonly capabilities: WebContentFetcherCapabilities;
  open(
    request: WebContentRequest,
    context?: WebResearchExecutionContext,
  ): Promise<unknown>;
}
