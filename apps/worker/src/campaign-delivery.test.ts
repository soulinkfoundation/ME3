import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MANAGED_CAMPAIGN_PROTOCOL_VERSION,
  type ManagedCampaignDeliveryRequest,
} from "../../../shared/managed-campaign-contract";
import {
  applyManagedCampaignEvent,
  dispatchDueCampaignJobs,
  getCampaignTransportStatus,
  sendCampaignTest,
  startCampaignDelivery,
} from "./campaign-delivery";
import { createCampaign, getCampaign, saveCampaignDraft } from "./campaigns";
import type { Env } from "./types";

const migrationFiles = [
  "../migrations/0041_email_campaign_foundations.sql",
  "../migrations/0042_email_campaign_assets.sql",
  "../migrations/0043_email_campaign_delivery.sql",
  "../migrations/0044_site_branding.sql",
];
const migrations = migrationFiles.map((path) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"),
);

type SqliteValue = null | number | string | Uint8Array;

class SqliteD1Statement {
  private values: SqliteValue[] = [];
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
  ) {}
  bind(...values: unknown[]) {
    this.values = values as SqliteValue[];
    return this;
  }
  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) || null;
  }
  async all<T>() {
    return {
      results: this.database.prepare(this.sql).all(...this.values) as T[],
      success: true as const,
      meta: {},
    };
  }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      results: [],
      success: true as const,
      meta: { changes: Number(result.changes) },
    };
  }
}

class SqliteD1Database {
  constructor(private readonly database: DatabaseSync) {}
  prepare(sql: string) {
    return new SqliteD1Statement(this.database, sql);
  }
  async batch(statements: SqliteD1Statement[]) {
    const results = [];
    this.database.exec("BEGIN");
    try {
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

describe("campaign delivery lifecycle", () => {
  let database: DatabaseSync;
  let env: Env;
  let campaignId: string;
  let requests: ManagedCampaignDeliveryRequest[];
  let fetcher: typeof fetch;
  let transportSenderRef: string;
  let transportProvider: "aws_ses" | "postmark";

  beforeEach(async () => {
    database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(`
      CREATE TABLE owner_profile (
        id TEXT PRIMARY KEY, email TEXT, name TEXT, username TEXT,
        bio TEXT, avatar_url TEXT, timezone TEXT, locale TEXT,
        assistant_name TEXT, password_hash TEXT
      );
      CREATE TABLE sites (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL,
        custom_domain TEXT, custom_domain_status TEXT
      );
      CREATE TABLE subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL,
        email TEXT NOT NULL, first_name TEXT, last_name TEXT,
        source TEXT NOT NULL DEFAULT 'me3',
        subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unsubscribed_at TEXT, ip_hash TEXT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );
      CREATE TABLE install_secrets (
        name TEXT PRIMARY KEY, value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO owner_profile (id, email, name, username)
      VALUES ('owner', 'owner@example.com', 'Owner Name', 'owner');
      INSERT INTO sites (id, user_id, username)
      VALUES ('site-1', 'owner', 'publisher');
      INSERT INTO subscribers
        (site_id, email, first_name, source, subscribed_at)
      VALUES
        ('site-1', 'Reader@Example.com', 'Reader', 'me3', '2026-08-20T10:00:00.000Z'),
        ('site-1', 'pending@example.com', NULL, 'manual', '2026-08-20T10:00:00.000Z');
      INSERT INTO install_secrets (name, value) VALUES
        ('ME3_CORE_INSTALL_ID', 'core_11111111-1111-4111-8111-111111111111'),
        ('ME3_CLOUD_CORE_TOKEN', 'managed-core-token');
    `);
    for (const migration of migrations) database.exec(migration);
    database.exec(`
      INSERT INTO site_branding
        (site_id, display_name, logo_ref, accent_color, background_color,
         surface_color, text_color)
      VALUES
        ('site-1', 'Publisher brand', NULL, '#226644', '#f5f5f0', '#ffffff', '#18201d');
    `);
    env = {
      DB: new SqliteD1Database(database) as unknown as D1Database,
      ME3_DEPLOYMENT_MODE: "managed",
      ME3_CLOUD_API_ORIGIN: "https://api.me3.test",
      ME3_SITE_HOST: "publisher.example.com",
    } as Env;
    requests = [];
    transportSenderRef = "sender-1";
    transportProvider = "aws_ses";
    fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/campaign-sender")) {
        return Response.json({
          connected: true,
          provider: transportProvider,
          sender: {
            ref: transportSenderRef,
            domain: "campaigns.example.com",
            fromAddress: "campaign@campaigns.example.com",
            status: "verified",
          },
          ready: true,
          instructions: [],
        });
      }
      if (url.pathname.endsWith("/callback-credentials")) {
        return Response.json({ callbackSecret: "a".repeat(64) });
      }
      if (url.pathname.endsWith("/deliveries")) {
        const request = JSON.parse(String(init?.body)) as ManagedCampaignDeliveryRequest;
        requests.push(request);
        return Response.json(
          {
            version: MANAGED_CAMPAIGN_PROTOCOL_VERSION,
            operationId: request.operationId,
            disposition: "accepted",
            replayed: false,
            acceptedAt: "2026-08-26T12:00:00.000Z",
          },
          { status: 202 },
        );
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const created = await createCampaign(env, "owner", { siteId: "site-1" });
    expect(created?.revision.document.brand).toMatchObject({
      name: "Publisher brand",
      accentColor: "#226644",
      backgroundColor: "#f5f5f0",
    });
    campaignId = String(created?.id);
    const document = created?.revision.document;
    await saveCampaignDraft(env, "owner", campaignId, {
      name: "Launch",
      subject: "A useful update",
      previewText: "A short preview",
      replyToAddress: "owner@example.com",
      document,
    });
  });

  afterEach(() => database.close());

  it("snapshots only eligible recipients and sends the protocol-v2 permission", async () => {
    const queued = await startCampaignDelivery(env, "owner", campaignId, {}, fetcher);
    expect(queued).toMatchObject({ eligibleCount: 1, excludedCount: 1 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM email_campaign_audience_members").get(),
    ).toEqual({ count: 1 });

    transportSenderRef = "sender-2";
    await dispatchDueCampaignJobs(env, fetcher);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      version: "me3-managed-campaign/2",
      kind: "campaign",
      senderRef: "sender-1",
      recipient: {
        address: "reader@example.com",
        permission: { status: "marketable", method: "single_opt_in" },
      },
      content: { replyToAddress: "owner@example.com" },
    });
    expect(
      database.prepare(
        "SELECT status, request_json IS NOT NULL AS has_request FROM email_campaign_recipient_jobs",
      ).get(),
    ).toEqual({ status: "accepted", has_request: 1 });
  });

  it("keeps test sends single-recipient and permission-free", async () => {
    const result = await sendCampaignTest(env, "owner", campaignId, fetcher);

    expect(result).toMatchObject({ kind: "test", status: "accepted" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      kind: "test",
      recipient: { address: "owner@example.com", permission: null },
    });
    expect(
      database.prepare(
        "SELECT COUNT(*) AS count FROM email_campaign_audience_snapshots",
      ).get(),
    ).toEqual({ count: 0 });
  });

  it("accepts the active Postmark managed sender", async () => {
    transportProvider = "postmark";

    await expect(getCampaignTransportStatus(env, fetcher)).resolves.toMatchObject({
      available: true,
      managed: true,
      ready: true,
      sender: {
        ref: "sender-1",
        fromAddress: "campaign@campaigns.example.com",
      },
    });
  });

  it("applies delivery outcomes idempotently to local campaign and subscriber truth", async () => {
    await startCampaignDelivery(env, "owner", campaignId, {}, fetcher);
    await dispatchDueCampaignJobs(env, fetcher);
    const operationId = requests[0]!.operationId;
    const recipientRef = requests[0]!.recipient.ref;
    const event = {
      version: MANAGED_CAMPAIGN_PROTOCOL_VERSION,
      eventId: "event-1",
      sequence: 2,
      occurredAt: "2026-08-26T12:01:00.000Z",
      operationId,
      campaignRef: campaignId,
      recipientRef,
      type: "recipient.unsubscribed" as const,
      reason: "unsubscribe" as const,
    };

    await expect(applyManagedCampaignEvent(env, event)).resolves.toBe(true);
    await expect(applyManagedCampaignEvent(env, event)).resolves.toBe(true);

    expect(
      database.prepare(
        "SELECT unsubscribed_at, delivery_status FROM subscribers WHERE lower(email) = 'reader@example.com'",
      ).get(),
    ).toEqual({
      unsubscribed_at: "2026-08-26T12:01:00.000Z",
      delivery_status: "suppressed",
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM email_campaign_events").get(),
    ).toEqual({ count: 1 });
    await expect(getCampaign(env, "owner", campaignId)).resolves.toMatchObject({
      status: "sent",
      progress: { suppressed: 1 },
    });
  });

  it("fails closed when campaign transport is not managed", async () => {
    env.ME3_DEPLOYMENT_MODE = "self_hosted";
    await expect(getCampaignTransportStatus(env, fetcher)).resolves.toMatchObject({
      managed: false,
      ready: false,
      reason: "managed_installation_required",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
