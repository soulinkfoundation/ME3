import { describe, expect, it } from "vitest";
import { disconnectSocialPublishingAccount } from "@me3-core/plugin-social-publishing";

describe("Social account lifecycle", () => {
  it("disconnects only an owned account and clears its stored tokens", async () => {
    const account = {
      id: "linkedin-1",
      user_id: "owner",
      status: "active",
      access_token_ciphertext: "encrypted-access",
      refresh_token_ciphertext: "encrypted-refresh",
      token_expires_at: "2099-01-01T00:00:00.000Z",
    };
    const env = {
      DB: {
        prepare(sql: string) {
          let values: unknown[] = [];
          return {
            bind(...next: unknown[]) {
              values = next;
              return this;
            },
            async first() {
              if (sql.includes("FROM plugin_installations")) {
                return { enabled: 1, status: "installed" };
              }
              if (sql.includes("FROM social_accounts")) {
                return account.id === values[0] && account.user_id === values[1]
                  ? { id: account.id }
                  : null;
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              if (sql.includes("UPDATE social_accounts")) {
                Object.assign(account, {
                  status: "revoked",
                  access_token_ciphertext: "",
                  refresh_token_ciphertext: null,
                  token_expires_at: null,
                });
              }
              return {};
            },
          };
        },
      },
    };

    await expect(
      disconnectSocialPublishingAccount(env as never, "someone-else", account.id),
    ).resolves.toBe(false);
    await expect(
      disconnectSocialPublishingAccount(env as never, "owner", account.id),
    ).resolves.toBe(true);
    expect(account).toMatchObject({
      status: "revoked",
      access_token_ciphertext: "",
      refresh_token_ciphertext: null,
      token_expires_at: null,
    });
  });
});
