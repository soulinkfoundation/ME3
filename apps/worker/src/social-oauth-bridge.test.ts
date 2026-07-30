import { describe, expect, it } from "vitest";
import { resolveHostedSocialOAuthOrigin } from "./social-publishing";

describe("hosted social OAuth bridge resolution", () => {
  it("uses the official ME3 Cloud bridge for a linked managed installation", async () => {
    const env = createEnv({
      ME3_CLOUD_OWNER_ID: "cloud-owner",
      ME3_CORE_INSTALL_ID: "core_c8ca7728-c71c-4939-918f-4386b3679095",
      ME3_CLOUD_CORE_TOKEN: "core-update-token",
    }, undefined, "managed");

    await expect(resolveHostedSocialOAuthOrigin(env as never)).resolves.toBe(
      "https://api.me3.app",
    );
  });

  it("does not advertise the official bridge to a linked self-hosted installation", async () => {
    const env = createEnv({
      ME3_CLOUD_OWNER_ID: "cloud-owner",
      ME3_CORE_INSTALL_ID: "core_c8ca7728-c71c-4939-918f-4386b3679095",
      ME3_CLOUD_CORE_TOKEN: "core-update-token",
    }, "https://api.me3.app");

    await expect(resolveHostedSocialOAuthOrigin(env as never)).resolves.toBeNull();
  });

  it("does not advertise the official bridge before an installation is linked", async () => {
    const env = createEnv(
      { ME3_CLOUD_OWNER_ID: "cloud-owner" },
      "https://api.me3.app",
    );

    await expect(resolveHostedSocialOAuthOrigin(env as never)).resolves.toBeNull();
  });

  it("preserves an explicitly configured independent bridge", async () => {
    const env = createEnv({}, "https://social-oauth.example/");

    await expect(resolveHostedSocialOAuthOrigin(env as never)).resolves.toBe(
      "https://social-oauth.example",
    );
  });
});

function createEnv(
  secrets: Record<string, string>,
  origin?: string,
  deploymentMode = "self_hosted",
) {
  return {
    ME3_DEPLOYMENT_MODE: deploymentMode,
    ME3_SOCIAL_OAUTH_ORIGIN: origin,
    DB: {
      prepare: () => ({
        bind: (name: string) => ({
          first: async () => {
            const value = secrets[name];
            return value ? { value } : null;
          },
        }),
      }),
    },
  };
}
