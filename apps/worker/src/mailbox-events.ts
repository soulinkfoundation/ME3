import type { Env } from "./types";

export const MAILBOX_MESSAGE_RECEIVED_EVENT = "mailbox.message_received" as const;
export const MAILBOX_EVENTS_SUBSCRIBE_PATH = "/events/mailbox/subscribe";
export const MAILBOX_EVENTS_PUBLISH_PATH = "/events/mailbox/publish";

export type MailboxMessageReceivedEvent = {
  type: typeof MAILBOX_MESSAGE_RECEIVED_EVENT;
  mailboxId: string;
  messageId: string;
  receivedAt: string;
};

type PublishMailboxMessageReceivedInput = Omit<MailboxMessageReceivedEvent, "type"> & {
  ownerId: string;
};

export async function publishMailboxMessageReceived(
  env: Env,
  input: PublishMailboxMessageReceivedInput,
): Promise<void> {
  try {
    const runtime = env.ME3_USER_AGENT;
    if (!runtime) return;

    const response = await runtime.get(runtime.idFromName(input.ownerId)).fetch(
      `https://me3-core-user-agent.internal${MAILBOX_EVENTS_PUBLISH_PATH}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: MAILBOX_MESSAGE_RECEIVED_EVENT,
          mailboxId: input.mailboxId,
          messageId: input.messageId,
          receivedAt: input.receivedAt,
        } satisfies MailboxMessageReceivedEvent),
      },
    );
    if (!response.ok) {
      throw new Error(`Mailbox event channel returned ${response.status}`);
    }
  } catch (error) {
    // Delivery is already durable. Realtime invalidation is intentionally best-effort.
    console.error("Mailbox realtime invalidation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function subscribeToMailboxEvents(
  env: Env,
  ownerId: string,
): Promise<Response | null> {
  const runtime = env.ME3_USER_AGENT;
  if (!runtime) return null;
  return runtime.get(runtime.idFromName(ownerId)).fetch(
    `https://me3-core-user-agent.internal${MAILBOX_EVENTS_SUBSCRIBE_PATH}`,
  );
}
