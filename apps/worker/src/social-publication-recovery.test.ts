import { describe, expect, it } from "vitest";
import {
  SocialPublishingInputError,
  resolvePublicationOutcome,
} from "@me3-core/plugin-social-publishing";

describe("Social publication outcome recovery", () => {
  it("requires evidence and records an owner-confirmed Post Version publication", async () => {
    const publication = {
      id: "publication-1",
      variant_id: "social-version-1",
      status: "publishing",
      platform_post_id: null,
      platform_post_url: null as string | null,
      published_at: null as string | null,
      error_code: "outcome_unknown:linkedin_outcome_unknown",
      error_message: "Check LinkedIn before retrying.",
    };
    const events: Array<Record<string, unknown>> = [];
    const env = createRecoveryEnv(publication, events);

    await expect(
      resolvePublicationOutcome(
        env as never,
        "owner",
        "publication-1",
        { outcome: "published", platformPostUrl: "not a URL" },
      ),
    ).rejects.toBeInstanceOf(SocialPublishingInputError);

    const resolved = await resolvePublicationOutcome(
      env as never,
      "owner",
      "publication-1",
      {
        outcome: "published",
        platformPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:123",
      },
    );

    expect(resolved).toMatchObject({
      versionId: "social-version-1",
      status: "published",
      platformPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:123",
      failureClass: null,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: "published" });
  });
});

function createRecoveryEnv(
  publication: Record<string, unknown>,
  events: Array<Record<string, unknown>>,
) {
  return {
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
            if (
              sql.includes("UPDATE social_publications") &&
              sql.includes("platform_post_url") &&
              sql.includes("RETURNING id")
            ) {
              if (
                publication.status !== "publishing" ||
                !String(publication.error_code || "").startsWith("outcome_unknown")
              ) {
                return null;
              }
              publication.status = "published";
              publication.platform_post_url = values[0];
              publication.published_at = new Date().toISOString();
              publication.error_code = null;
              publication.error_message = null;
              return { id: publication.id };
            }
            if (sql.includes("FROM social_variants v") && sql.includes("JOIN sites")) {
              return values[0] === "social-version-1" && values[1] === "owner"
                ? { id: "social-version-1" }
                : null;
            }
            if (sql.includes("status = 'publishing'")) return publication;
            if (sql.includes("SELECT package_id FROM social_variants")) {
              return { package_id: "social-post-1" };
            }
            if (sql.includes("SELECT COUNT(*) AS total")) {
              return { total: 1, published_count: 1 };
            }
            if (sql.includes("FROM social_publications")) return publication;
            return null;
          },
          async all() {
            if (sql.includes("FROM social_publications")) {
              return { results: [{ id: publication.id, status: publication.status }] };
            }
            return { results: [] };
          },
          async run() {
            if (sql.includes("INSERT INTO social_publication_events")) {
              events.push({
                id: values[0],
                publication_id: values[1],
                variant_id: values[2],
                event_type: values[3],
                payload_json: values[4],
              });
            }
            return {};
          },
        };
      },
    },
  };
}
