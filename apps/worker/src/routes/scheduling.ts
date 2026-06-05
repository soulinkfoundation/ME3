import {
  approveSchedulingRequest,
  createSchedulingRequest,
  createSchedulingTimeType,
  finalizeSchedulingRequest,
  generateSchedulingCandidateSlots,
  getSchedulingRequest,
  listSchedulingRequestAudit,
  listSchedulingRequestVotes,
  listSchedulingTimeTypes,
  normalizeCandidateLimit,
  normalizeShortText,
  parseSchedulingDateRange,
  recordSchedulingRequestVote,
  resolveSchedulingPolicy,
  sanitizeSchedulingTimeTypeForCandidates,
  serializeSchedulingAudit,
  serializeSchedulingRequest,
  serializeSchedulingVote,
  updateSchedulingTimeType,
} from "../scheduling";
import type { AppHono, OwnerRouteDeps } from "../http/types";

export function registerSchedulingRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/scheduling/time-types", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    return c.json({
      ok: true,
      timeTypes: await listSchedulingTimeTypes(c.env, ownerId),
    });
  });

  app.post("/api/scheduling/time-types", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const result = await createSchedulingTimeType(
      c.env,
      ownerId,
      await c.req.json().catch(() => null),
    );
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json({ ok: true, timeType: result }, 201);
  });

  app.put("/api/scheduling/time-types/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const result = await updateSchedulingTimeType(
      c.env,
      ownerId,
      c.req.param("id"),
      await c.req.json().catch(() => null),
    );
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json({ ok: true, timeType: result });
  });

  app.post("/api/scheduling/policy/resolve", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const body = await c.req
      .json<{ contactId?: unknown; timeTypeId?: unknown }>()
      .catch((): { contactId?: unknown; timeTypeId?: unknown } => ({}));
    const result = await resolveSchedulingPolicy(c.env, ownerId, {
      contactId: normalizeShortText(body.contactId, 120),
      timeTypeId: normalizeShortText(body.timeTypeId, 160),
    });
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json({ ok: true, policy: result });
  });

  app.post("/api/scheduling/candidates", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const body = await c.req
      .json<{
        contactId?: unknown;
        timeTypeId?: unknown;
        dateRange?: { start?: unknown; end?: unknown };
        limit?: unknown;
      }>()
      .catch((): {
        contactId?: unknown;
        timeTypeId?: unknown;
        dateRange?: { start?: unknown; end?: unknown };
        limit?: unknown;
      } => ({}));

    const policy = await resolveSchedulingPolicy(c.env, ownerId, {
      contactId: normalizeShortText(body.contactId, 120),
      timeTypeId: normalizeShortText(body.timeTypeId, 160),
    });
    if ("error" in policy) return c.json({ error: policy.error }, policy.status as any);

    const dateRange = parseSchedulingDateRange(body.dateRange);
    if ("error" in dateRange) return c.json({ error: dateRange.error }, 400);

    const limit = normalizeCandidateLimit(body.limit);
    const slots = policy.allowed
      ? await generateSchedulingCandidateSlots(c.env, ownerId, {
          timeType: policy.timeType,
          dateRange,
          limit,
        })
      : [];

    return c.json({
      ok: true,
      status: !policy.allowed
        ? "not_allowed"
        : policy.ownerReviewRequired
        ? "review_required"
        : "ok",
      policy: {
        tier: policy.tier,
        allowed: policy.allowed,
        reason: policy.reason,
        ownerReviewRequired: policy.ownerReviewRequired,
        candidateSharingAllowed: policy.candidateSharingAllowed,
        contactId: policy.contactId,
      },
      timeType: sanitizeSchedulingTimeTypeForCandidates(policy.timeType),
      dateRange,
      slots,
    });
  });

  app.post("/api/scheduling/requests", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const result = await createSchedulingRequest(
      c.env,
      ownerId,
      c.req.url,
      await c.req.json().catch(() => null),
    );
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json({ ok: true, ...result }, 201);
  });

  app.get("/api/scheduling/requests/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const request = await getSchedulingRequest(c.env, ownerId, c.req.param("id"));
    if (!request) return c.json({ error: "Scheduling request not found" }, 404);
    const [votes, audit] = await Promise.all([
      listSchedulingRequestVotes(c.env, request.id),
      listSchedulingRequestAudit(c.env, request.id),
    ]);
    return c.json({
      ok: true,
      request: serializeSchedulingRequest(request),
      votes: votes.map(serializeSchedulingVote),
      audit: audit.map(serializeSchedulingAudit),
    });
  });

  app.post("/api/scheduling/requests/:id/votes", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const result = await recordSchedulingRequestVote(
      c.env,
      ownerId,
      c.req.param("id"),
      await c.req.json().catch(() => null),
    );
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json({ ok: true, ...result });
  });

  app.post("/api/scheduling/requests/:id/approvals", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const result = await approveSchedulingRequest(
      c.env,
      ownerId,
      c.req.param("id"),
      await c.req.json().catch(() => null),
    );
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json({ ok: true, ...result });
  });

  app.post("/api/scheduling/requests/:id/finalize", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const result = await finalizeSchedulingRequest(c.env, ownerId, c.req.param("id"));
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json({ ok: true, ...result });
  });
}
