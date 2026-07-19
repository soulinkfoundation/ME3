import { describe, expect, it } from "vitest";
import { getConfiguredEmailIdentity } from "./email-providers";

describe("configured email identity", () => {
  it("returns the active ready provider address", async () => {
    const identity = await getConfiguredEmailIdentity(
      providerEnv("owner@custom.example") as never,
      "owner",
    );

    expect(identity).toEqual({
      id: "email-provider:postmark",
      address: "owner@custom.example",
    });
  });

  it("never exposes an internal mailbox placeholder", async () => {
    const identity = await getConfiguredEmailIdentity(
      providerEnv("owner@me3.local") as never,
      "owner",
    );

    expect(identity).toBeNull();
  });
});

function providerEnv(fromAddress: string) {
  const row = {
    user_id: "owner",
    provider_id: "postmark",
    is_active: 1,
    encrypted_secret: "v1.test",
    secret_hint: "***test",
    secret_updated_at: "2026-07-19T20:00:00.000Z",
    config_json: JSON.stringify({
      fromAddress,
      fromName: "Owner",
      messageStream: "outbound",
    }),
    last_status: "ready",
    last_status_checked_at: "2026-07-19T20:00:00.000Z",
    last_test_sent_at: "2026-07-19T20:00:00.000Z",
    last_test_error: null,
    created_at: "2026-07-19T20:00:00.000Z",
    updated_at: "2026-07-19T20:00:00.000Z",
  };
  return {
    TOKEN_ENCRYPTION_KEY: "test-encryption-key",
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: [row] };
              },
            };
          },
        };
      },
    },
  };
}
