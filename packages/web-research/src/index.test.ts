import { describe, expect, it } from "vitest";
import {
  createWebContentFetcher,
  createWebResearchService,
  normalizeWebContentRequest,
  normalizeWebContentResult,
  normalizeWebResearchRequest,
  normalizeWebResearchResult,
  webResearchDomainPolicyAllows,
  WebResearchContractError,
  type WebContentFetcherAdapter,
  type WebResearchProviderAdapter,
} from "./index";

const usage = {
  requests: 1,
  searchQueries: 2,
  pagesOpened: 1,
  inputTokens: 120,
  outputTokens: 80,
  bytesReceived: 4_096,
  cost: { amountMicros: 12_500, currency: "usd" },
};

const searchTrace = {
  providerId: "example-search",
  adapterId: "example-search-v1",
  operation: "search",
  providerRequestId: "provider-request-1",
  model: "research-1",
  startedAt: "2026-07-27T10:00:00+01:00",
  durationMs: 420,
  attempts: 1,
};

const validSearchResult = {
  status: "success",
  query: "Current Cloudflare web-search support",
  answer: "Cloudflare supports hosted web search through provider adapters. [1]",
  sources: [
    {
      id: "source-1",
      url: "https://developers.cloudflare.com/ai-gateway/usage/web-search/#overview",
      canonicalUrl: "https://developers.cloudflare.com/ai-gateway/usage/web-search/",
      title: "Web Search",
      publisher: "Cloudflare",
      publishedAt: "2026-06-26T00:00:00Z",
      retrievedAt: "2026-07-27T10:00:00Z",
    },
  ],
  evidence: [
    {
      id: "evidence-1",
      sourceId: "source-1",
      text: "AI Gateway proxies native web search tools from supported providers.",
      relevanceScore: 0.98,
    },
  ],
  citations: [
    {
      id: "citation-1",
      sourceId: "source-1",
      evidenceIds: ["evidence-1"],
      label: "1",
      answerSpan: { start: 58, end: 61 },
    },
  ],
  searchedAt: "2026-07-27T10:00:01Z",
  usage,
  trace: searchTrace,
};

const capabilities = {
  depths: ["quick", "standard", "deep"] as const,
  freshness: { maxAge: true, dateRange: false },
  locale: true,
  location: true,
  domainAllowlist: true,
  domainBlocklist: true,
  answerSynthesis: true,
  maxResults: 20,
};

describe("web research request normalization", () => {
  it("normalizes defaults, locale, location, freshness, and domain policy", () => {
    expect(
      normalizeWebResearchRequest({
        query: "  What changed today?  ",
        freshness: { kind: "max_age", maxAgeSeconds: 86_400 },
        locale: "en-ie",
        location: {
          countryCode: "ie",
          city: " Dublin ",
          timezone: "Europe/Dublin",
        },
        domainPolicy: {
          allowedDomains: ["Developers.Cloudflare.com.", "developers.cloudflare.com"],
        },
      }),
    ).toEqual({
      query: "What changed today?",
      depth: "standard",
      freshness: { kind: "max_age", maxAgeSeconds: 86_400 },
      locale: "en-IE",
      location: {
        countryCode: "IE",
        region: null,
        city: "Dublin",
        timezone: "Europe/Dublin",
      },
      resultLimit: 8,
      domainPolicy: {
        allowedDomains: ["developers.cloudflare.com"],
        blockedDomains: [],
      },
    });

    const internationalDomainRequest = normalizeWebResearchRequest({
      query: "test",
      domainPolicy: { allowedDomains: ["BÜCHER.example"] },
    });
    expect(internationalDomainRequest.domainPolicy.allowedDomains).toEqual([
      "xn--bcher-kva.example",
    ]);
    expect(
      webResearchDomainPolicyAllows(
        "news.xn--bcher-kva.example",
        internationalDomainRequest.domainPolicy,
      ),
    ).toBe(true);
    expect(
      webResearchDomainPolicyAllows(
        "not-bcher.example",
        internationalDomainRequest.domainPolicy,
      ),
    ).toBe(false);
  });

  it("rejects ambiguous or malformed request fields", () => {
    expect(() =>
      normalizeWebResearchRequest({
        query: "test",
        domainPolicy: {
          allowedDomains: ["example.com"],
          blockedDomains: ["tracker.example"],
        },
      }),
    ).toThrow(/cannot both be populated/);

    expect(() =>
      normalizeWebResearchRequest({
        query: "test",
        location: { timezone: "Not/A_Timezone" },
      }),
    ).toThrow(/valid IANA timezone/);

    expect(
      normalizeWebResearchRequest({
        query: "test",
        freshness: {
          kind: "date_range",
          from: "2026-07-01T00:00:00Z",
        },
      }).freshness,
    ).toEqual({
      kind: "date_range",
      from: "2026-07-01T00:00:00.000Z",
      to: null,
    });

    expect(() =>
      normalizeWebResearchRequest({
        query: "test",
        headers: { authorization: "secret" },
      }),
    ).toThrow(/not part of the normalized contract/);
  });

  it("keeps page opening limited to a selected public HTTP(S) URL and bounds", () => {
    expect(
      normalizeWebContentRequest({
        url: "https://example.com/page#provider-fragment",
      }),
    ).toEqual({
      url: "https://example.com/page",
      retrievalMode: "auto",
      maxCharacters: 50_000,
    });

    expect(() =>
      normalizeWebContentRequest({
        url: "https://owner:secret@example.com/private",
      }),
    ).toThrow(/must not contain credentials/);
    expect(() =>
      normalizeWebContentRequest({
        url: "http://127.0.0.1:8787/private",
      }),
    ).toThrow(/public hostname/);
    expect(() =>
      normalizeWebContentRequest({
        url: "http://metadata.internal/latest",
      }),
    ).toThrow(/public hostname/);
    expect(() =>
      normalizeWebContentRequest({
        url: "https://example.com",
        cookies: "session=secret",
      }),
    ).toThrow(/not part of the normalized contract/);
  });
});

describe("provider result normalization", () => {
  it("normalizes valid sources, evidence, citations, usage, and trace", () => {
    expect(normalizeWebResearchResult(validSearchResult)).toEqual({
      ...validSearchResult,
      sources: [
        {
          ...validSearchResult.sources[0],
          url: "https://developers.cloudflare.com/ai-gateway/usage/web-search/",
          publishedAt: "2026-06-26T00:00:00.000Z",
          retrievedAt: "2026-07-27T10:00:00.000Z",
        },
      ],
      searchedAt: "2026-07-27T10:00:01.000Z",
      usage: {
        ...usage,
        cost: { amountMicros: 12_500, currency: "USD" },
      },
      trace: {
        ...searchTrace,
        startedAt: "2026-07-27T09:00:00.000Z",
      },
    });
  });

  it.each([
    [
      "provider-specific fields",
      { ...validSearchResult, providerEvents: [{ type: "response.web_search_call" }] },
      /not part of the normalized contract/,
    ],
    [
      "non-public source URLs",
      {
        ...validSearchResult,
        sources: [{ ...validSearchResult.sources[0], url: "file:///etc/passwd" }],
      },
      /must use HTTP or HTTPS/,
    ],
    [
      "duplicate source IDs",
      {
        ...validSearchResult,
        sources: [validSearchResult.sources[0], validSearchResult.sources[0]],
      },
      /must be unique/,
    ],
    [
      "dangling evidence",
      {
        ...validSearchResult,
        evidence: [{ ...validSearchResult.evidence[0], sourceId: "source-missing" }],
      },
      /unknown source/,
    ],
    [
      "dangling citation evidence",
      {
        ...validSearchResult,
        citations: [{ ...validSearchResult.citations[0], evidenceIds: ["evidence-missing"] }],
      },
      /unknown evidence/,
    ],
    [
      "invalid citation spans",
      {
        ...validSearchResult,
        citations: [
          {
            ...validSearchResult.citations[0],
            answerSpan: { start: 0, end: 9_999 },
          },
        ],
      },
      /must be an integer/,
    ],
    [
      "negative usage",
      { ...validSearchResult, usage: { ...usage, searchQueries: -1 } },
      /must be an integer/,
    ],
    [
      "malformed timestamps",
      { ...validSearchResult, searchedAt: "yesterday-ish" },
      /valid ISO date-time/,
    ],
    [
      "impossible calendar dates",
      { ...validSearchResult, searchedAt: "2026-02-30T00:00:00Z" },
      /valid ISO date-time/,
    ],
  ])("rejects malformed provider output: %s", (_label, candidate, expected) => {
    expect(() => normalizeWebResearchResult(candidate)).toThrow(expected);
  });

  it("validates unknown adapter output at the service boundary", async () => {
    const adapter: WebResearchProviderAdapter = {
      providerId: "broken",
      adapterId: "broken-v1",
      capabilities,
      async search(request) {
        expect(request.depth).toBe("standard");
        return {
          ...validSearchResult,
          evidence: [{ ...validSearchResult.evidence[0], sourceId: "missing" }],
        };
      },
    };

    const service = createWebResearchService(adapter);
    await expect(service.search({ query: "test" })).rejects.toBeInstanceOf(
      WebResearchContractError,
    );
  });

  it("rejects a provider result attributed to a different request query", async () => {
    const adapter: WebResearchProviderAdapter = {
      providerId: "stale",
      adapterId: "stale-v1",
      capabilities,
      async search() {
        return validSearchResult;
      },
    };

    await expect(
      createWebResearchService(adapter).search({ query: "A different query" }),
    ).rejects.toThrow(/must match the normalized request query/);
  });

  it("enforces request result limits and adapter trace identity", async () => {
    const adapter: WebResearchProviderAdapter = {
      providerId: "example-search",
      adapterId: "example-search-v1",
      capabilities,
      async search() {
        return {
          ...validSearchResult,
          sources: [
            validSearchResult.sources[0],
            {
              ...validSearchResult.sources[0],
              id: "source-2",
              url: "https://example.com/second",
            },
          ],
        };
      },
    };

    await expect(
      createWebResearchService(adapter).search({ query: validSearchResult.query, resultLimit: 1 }),
    ).rejects.toThrow(/must not exceed request.resultLimit/);

    const wrongTraceAdapter: WebResearchProviderAdapter = {
      ...adapter,
      async search() {
        return {
          ...validSearchResult,
          trace: { ...searchTrace, providerId: "another-provider" },
        };
      },
    };
    await expect(
      createWebResearchService(wrongTraceAdapter).search({
        query: validSearchResult.query,
      }),
    ).rejects.toThrow(/must match the selected adapter providerId/);
  });

  it("normalizes the separate page-open boundary", async () => {
    const adapter: WebContentFetcherAdapter = {
      providerId: "example-open",
      adapterId: "example-open-v1",
      capabilities: {
        retrievalModes: ["static", "rendered"],
        maxCharacters: 100_000,
      },
      async open(request) {
        return {
          status: "success",
          source: {
            ...validSearchResult.sources[0],
            url: request.url,
          },
          evidence: {
            ...validSearchResult.evidence[0],
            text: "Selected public page content.",
          },
          retrievalMode: "static",
          contentFormat: "markdown",
          truncated: false,
          usage: { ...usage, searchQueries: 0 },
          trace: {
            ...searchTrace,
            providerId: "example-open",
            adapterId: "example-open-v1",
            operation: "open",
          },
        };
      },
    };

    const fetcher = createWebContentFetcher(adapter);
    await expect(fetcher.open({ url: "https://example.com/public" })).resolves.toMatchObject({
      status: "success",
      retrievalMode: "static",
      source: { url: "https://example.com/public" },
    });
  });

  it("accepts bounded page content above the search-evidence limit", async () => {
    const text = "x".repeat(30_000);
    const adapter: WebContentFetcherAdapter = {
      providerId: "example-open",
      adapterId: "example-open-v1",
      capabilities: {
        retrievalModes: ["static"],
        maxCharacters: 100_000,
      },
      async open() {
        return {
          status: "success",
          source: {
            ...validSearchResult.sources[0],
            id: "opened-source",
          },
          evidence: {
            ...validSearchResult.evidence[0],
            id: "opened-evidence",
            sourceId: "opened-source",
            text,
          },
          retrievalMode: "static",
          contentFormat: "text",
          truncated: false,
          usage: { ...usage, searchQueries: 0 },
          trace: {
            ...searchTrace,
            providerId: "example-open",
            adapterId: "example-open-v1",
            operation: "open",
          },
        };
      },
    };
    const fetcher = createWebContentFetcher(adapter);

    await expect(
      fetcher.open({ url: "https://example.com/large", maxCharacters: 30_000 }),
    ).resolves.toMatchObject({ status: "success", evidence: { text } });
    await expect(
      fetcher.open({ url: "https://example.com/large", maxCharacters: 29_999 }),
    ).rejects.toThrow(/must not exceed request.maxCharacters/);
  });

  it("rejects malformed provider output at the page-open boundary", () => {
    const openResult = {
      status: "success",
      source: {
        ...validSearchResult.sources[0],
        id: "opened-source",
      },
      evidence: {
        ...validSearchResult.evidence[0],
        id: "opened-evidence",
        sourceId: "another-source",
      },
      retrievalMode: "interactive",
      contentFormat: "html",
      truncated: false,
      usage: { ...usage, searchQueries: 0 },
      trace: {
        ...searchTrace,
        operation: "open",
      },
      providerAnnotations: [],
    };

    expect(() => normalizeWebContentResult(openResult)).toThrow(
      /not part of the normalized contract/,
    );
    const { providerAnnotations: _annotations, ...withoutAnnotations } = openResult;
    expect(() => normalizeWebContentResult(withoutAnnotations)).toThrow(
      /must reference result.source.id/,
    );
  });

  it("normalizes typed failures and rejects wrong-operation error traces", () => {
    const failure = {
      status: "error",
      error: {
        code: "rate_limited",
        message: "Search limit reached.",
        retryable: true,
        retryAfterMs: 5_000,
      },
      usage: {
        ...usage,
        cost: null,
      },
      trace: searchTrace,
    };

    expect(normalizeWebResearchResult(failure)).toEqual({
      ...failure,
      trace: {
        ...searchTrace,
        startedAt: "2026-07-27T09:00:00.000Z",
      },
    });
    expect(() =>
      normalizeWebContentResult({
        ...failure,
        trace: searchTrace,
      }),
    ).toThrow(/must be "open" for this result/);
  });
});
