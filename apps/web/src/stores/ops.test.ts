import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { api } from "../api";
import { useOpsStore } from "./ops";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("ops store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads admin access state", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ allowed: true });

    const store = useOpsStore();
    const allowed = await store.fetchAccess();

    expect(allowed).toBe(true);
    expect(store.accessAllowed).toBe(true);
    expect(store.accessKnown).toBe(true);
    expect(api.get).toHaveBeenCalledWith("/ops/access");
  });

  it("loads customer data", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      summary: {
        total_customers: 1,
        pro_customers: 1,
        active_subscriptions: 1,
        published_customers: 1,
      },
      filters: {
        q: "",
        tier: "pro",
        status: "active",
        month: "2026-03",
      },
      customers: [
        {
          id: "user-1",
          email: "customer@example.com",
          created_at: "2026-01-30 11:28:00",
          updated_at: "2026-03-20 09:00:00",
          subscription_tier: "pro",
          subscription_status: "active",
          subscription_expires_at: "2026-04-01 10:00:00",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123",
          stripe_connect_status: "active",
          billing_source: "stripe",
          manual_access_tier: null,
          manual_access_expires_at: null,
          manual_access_granted_at: null,
          current_month_email_usage: 24,
          lifecycle_emails: [
            {
              email_key: "welcome",
              status: "sent",
              scheduled_at: "2026-03-13 10:24:35",
              sent_at: "2026-03-13 10:25:00",
              skipped_at: null,
              skip_reason: null,
            },
          ],
          site_count: 1,
          published_site_count: 1,
          custom_domain_count: 0,
          latest_published_at: "2026-03-13 10:24:35",
          sites: [],
        },
      ],
    });

    const store = useOpsStore();
    const customers = await store.fetchCustomers({
      tier: "pro",
      status: "active",
    });

    expect(api.get).toHaveBeenCalledWith("/ops/customers?tier=pro&status=active");
    expect(customers).toHaveLength(1);
    expect(store.summary?.pro_customers).toBe(1);
    expect(store.accessAllowed).toBe(true);
  });

  it("sends lifecycle previews from ops", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      ok: true,
      sent: [
        {
          emailKey: "welcome",
          subject: "[Test] Your ME3 site is live",
          fromEmail: "support@example.com",
          replyTo: null,
        },
      ],
    });

    const store = useOpsStore();
    const response = await store.sendLifecyclePreview(
      "user-1",
      "kieranbutler22@gmail.com",
    );

    expect(api.post).toHaveBeenCalledWith(
      "/ops/customers/user-1/lifecycle/send-test",
      { email: "kieranbutler22@gmail.com" },
    );
    expect(response.sent).toHaveLength(1);
  });

  it("grants manual customer access from ops", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      ok: true,
      customer: {
        id: "user-1",
        email: "customer@example.com",
      },
      grant: {
        tier: "starter",
        billing_source: "manual",
        expires_at: "2027-04-13T09:00:00.000Z",
      },
    });

    const store = useOpsStore();
    const response = await store.grantCustomerAccess("user-1", "starter");

    expect(api.post).toHaveBeenCalledWith(
      "/ops/customers/user-1/grant-access",
      { tier: "starter" },
    );
    expect(response.grant.tier).toBe("starter");
  });

  it("loads demo sites", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      sites: [
        {
          id: "site-1",
          user_id: "admin-1",
          username: "demo-barber",
          site_type: "profile",
          url: "https://demo-barber.example.com",
          created_at: "2026-04-10 09:00:00",
          updated_at: "2026-04-10 09:00:00",
          published_at: null,
        },
      ],
    });

    const store = useOpsStore();
    const sites = await store.fetchDemoSites();

    expect(api.get).toHaveBeenCalledWith("/ops/demo-sites");
    expect(sites).toHaveLength(1);
    expect(store.demoSites[0]?.username).toBe("demo-barber");
  });

  it("creates a demo site from ops", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      ok: true,
      site: {
        id: "site-2",
        user_id: "admin-1",
        username: "demo-yoga",
        site_type: "profile",
        url: "https://demo-yoga.example.com",
        created_at: "2026-04-17 11:00:00",
        updated_at: "2026-04-17 11:00:00",
        published_at: null,
      },
    });

    const store = useOpsStore();
    const response = await store.createDemoSite("demo-yoga");

    expect(api.post).toHaveBeenCalledWith("/ops/demo-sites", {
      username: "demo-yoga",
    });
    expect(response.site.username).toBe("demo-yoga");
    expect(store.demoSites[0]?.username).toBe("demo-yoga");
  });
});
