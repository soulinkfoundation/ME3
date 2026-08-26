import {
  CampaignAssetInputError,
  loadPublicCampaignAsset,
  storeCampaignAsset,
} from "../campaign-assets";
import {
  cancelCampaignDelivery,
  dispatchDueCampaignJobs,
  getCampaignTransportStatus,
  receiveManagedCampaignEvent,
  sendCampaignTest,
  startCampaignDelivery,
} from "../campaign-delivery";
import {
  CampaignInputError,
  createCampaign,
  getCampaign,
  listCampaigns,
  previewCampaignAudience,
  saveCampaignDraft,
} from "../campaigns";
import type { AppHono, OwnerRouteDeps } from "../http/types";

type OwnedCampaignSite = {
  id: string;
  username: string;
};

export function registerCampaignRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.post("/api/me3-cloud/v1/managed-campaign/events", async (c) =>
    receiveManagedCampaignEvent(c.env, c.req.raw),
  );

  app.get("/api/public/campaign-assets/:assetId/:filename", async (c) => {
    const loaded = await loadPublicCampaignAsset(c.env, c.req.param("assetId"));
    if (!loaded) return c.json({ error: "Campaign image not found" }, 404);

    const headers = new Headers({
      "Content-Type": loaded.asset.content_type,
      "Content-Length": String(loaded.asset.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${loaded.asset.content_hash}"`,
      "Content-Disposition": `inline; filename="${safeHeaderFilename(loaded.asset.filename)}"`,
    });
    return new Response(loaded.object.body, { headers });
  });

  app.get("/api/email/campaigns/transport", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    return c.json({ transport: await getCampaignTransportStatus(c.env) });
  });

  app.get("/api/email/campaigns", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    return c.json({ campaigns: await listCampaigns(c.env, ownerId) });
  });

  app.post("/api/email/campaigns", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      const campaign = await createCampaign(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
      );
      return c.json({ campaign }, 201);
    } catch (error) {
      return campaignError(c, error);
    }
  });

  app.get("/api/email/campaigns/:campaignId", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const campaign = await getCampaign(c.env, ownerId, c.req.param("campaignId"));
    return campaign
      ? c.json({ campaign })
      : c.json({ error: "Campaign not found", code: "campaign_not_found" }, 404);
  });

  app.put("/api/email/campaigns/:campaignId", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      const campaign = await saveCampaignDraft(
        c.env,
        ownerId,
        c.req.param("campaignId"),
        await c.req.json().catch(() => ({})),
      );
      return c.json({ campaign });
    } catch (error) {
      return campaignError(c, error);
    }
  });

  app.get("/api/email/campaigns/:campaignId/review", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      const audience = await previewCampaignAudience(
        c.env,
        ownerId,
        c.req.param("campaignId"),
      );
      return c.json({
        audience: {
          eligibleCount: audience.eligible.length,
          excludedCount: audience.excluded.length,
          exclusionCounts: audience.exclusionCounts,
        },
        transport: await getCampaignTransportStatus(c.env),
      });
    } catch (error) {
      return campaignError(c, error);
    }
  });

  app.post("/api/email/campaigns/:campaignId/test", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      return c.json({
        test: await sendCampaignTest(
          c.env,
          ownerId,
          c.req.param("campaignId"),
        ),
      });
    } catch (error) {
      return campaignError(c, error);
    }
  });

  app.post("/api/email/campaigns/:campaignId/send", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      const result = await startCampaignDelivery(
        c.env,
        ownerId,
        c.req.param("campaignId"),
        await c.req.json().catch(() => ({})),
      );
      if (Date.parse(result.scheduledFor) <= Date.now()) {
        c.executionCtx.waitUntil(
          dispatchDueCampaignJobs(c.env).catch((error) => {
            console.error("Immediate campaign dispatch failed:", error);
          }),
        );
      }
      return c.json({ ok: true, ...result }, 202);
    } catch (error) {
      return campaignError(c, error);
    }
  });

  app.post("/api/email/campaigns/:campaignId/cancel", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    try {
      return c.json({
        ok: true,
        ...(await cancelCampaignDelivery(
          c.env,
          ownerId,
          c.req.param("campaignId"),
        )),
      });
    } catch (error) {
      return campaignError(c, error);
    }
  });

  app.post("/api/email/campaigns/:campaignId/assets", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    if (!c.env.SITE_ASSETS) {
      return c.json({ error: "Campaign image storage is not available" }, 503);
    }

    const campaignId = c.req.param("campaignId");
    const site = await c.env.DB.prepare(
      `SELECT s.id, s.username
       FROM email_campaigns campaign
       JOIN sites s ON s.id = campaign.site_id
       WHERE campaign.id = ? AND s.user_id = ?`,
    )
      .bind(campaignId, ownerId)
      .first<OwnedCampaignSite>();
    if (!site) return c.json({ error: "Campaign not found" }, 404);

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return c.json({ error: "Campaign image is required" }, 400);

    try {
      const asset = await storeCampaignAsset({
        env: c.env,
        site,
        campaignId,
        filename: file.name,
        contentType: file.type,
        bytes: await file.arrayBuffer(),
      });
      const requestUrl = new URL(c.req.url);
      requestUrl.pathname = `/api/public/campaign-assets/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.filename)}`;
      requestUrl.search = "";
      requestUrl.hash = "";
      return c.json({
        asset: {
          id: asset.id,
          filename: asset.filename,
          contentType: asset.content_type,
          size: asset.size,
          sha256: asset.content_hash,
          url: requestUrl.toString(),
        },
      });
    } catch (error) {
      if (error instanceof CampaignAssetInputError) {
        return c.json({ error: error.message }, error.status as 400 | 503);
      }
      console.error("Campaign image upload error:", error);
      return c.json({ error: "Failed to store campaign image" }, 500);
    }
  });
}

function campaignError(
  c: {
    json(
      body: { error: string; code: string },
      status: 400 | 404 | 409 | 500,
    ): Response;
  },
  error: unknown,
) {
  if (error instanceof CampaignInputError) {
    return c.json(
      { error: error.message, code: error.code },
      error.status,
    );
  }
  console.error("Campaign request failed", error);
  return c.json(
    { error: "Campaign request failed", code: "campaign_request_failed" },
    500,
  );
}

function safeHeaderFilename(value: string): string {
  return value.replace(/["\\\r\n]/g, "_").slice(0, 160) || "campaign-image";
}
