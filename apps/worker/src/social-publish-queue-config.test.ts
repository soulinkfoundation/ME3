import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SOCIAL_PUBLISH_DLQ_NAME,
  SOCIAL_PUBLISH_QUEUE_BINDING,
  SOCIAL_PUBLISH_QUEUE_NAME,
  SOCIAL_PUBLISHING_RUNTIME,
} from "./social-publishing";

const CONFIGS = [
  {
    label: "standard",
    source: readFileSync(
      fileURLToPath(new URL("../../../wrangler.toml", import.meta.url)),
      "utf8",
    ),
  },
  {
    label: "Core example",
    source: readFileSync(
      fileURLToPath(new URL("../wrangler.core.example.toml", import.meta.url)),
      "utf8",
    ),
  },
] as const;

describe("Social Publishing queue deployment contract", () => {
  it("keeps the runtime declaration aligned with the deployed queue policy", () => {
    expect(SOCIAL_PUBLISHING_RUNTIME.queuesAndCrons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "queue",
          binding: SOCIAL_PUBLISH_QUEUE_BINDING,
          queueName: SOCIAL_PUBLISH_QUEUE_NAME,
          maxRetries: 2,
        }),
      ]),
    );
  });

  it.each(CONFIGS)("binds the producer in the $label config", ({ source }) => {
    expect(tableBodies(source, "queues.producers")).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`binding = "${SOCIAL_PUBLISH_QUEUE_BINDING}"`),
      ]),
    );
    const producer = tableBodies(source, "queues.producers").find((body) =>
      hasConfigLine(body, `binding = "${SOCIAL_PUBLISH_QUEUE_BINDING}"`)
    );
    expect(producer).toContain(`queue = "${SOCIAL_PUBLISH_QUEUE_NAME}"`);
  });

  it.each(CONFIGS)("uses two retries and an explicit DLQ in the $label config", ({ source }) => {
    const consumers = tableBodies(source, "queues.consumers");
    const publish = consumers.find((body) =>
      hasConfigLine(body, `queue = "${SOCIAL_PUBLISH_QUEUE_NAME}"`)
    );
    expect(publish).toContain("max_batch_size = 10");
    expect(publish).toContain("max_batch_timeout = 5");
    expect(publish).toContain("max_retries = 2");
    expect(publish).toContain(`dead_letter_queue = "${SOCIAL_PUBLISH_DLQ_NAME}"`);

    const deadLetter = consumers.find((body) =>
      hasConfigLine(body, `queue = "${SOCIAL_PUBLISH_DLQ_NAME}"`)
    );
    expect(deadLetter).toContain("max_retries = 0");
  });
});

function tableBodies(source: string, table: string): string[] {
  return source
    .split(`[[${table}]]`)
    .slice(1)
    .map((section) => section.split(/\n\[\[/, 1)[0] || "");
}

function hasConfigLine(body: string, expected: string): boolean {
  return body.split("\n").some((line) => line.trim() === expected);
}
