import app from "./app";
import { dispatchDueCalendarSourceRefreshes } from "./calendar-sources";
import {
  BOOKING_REMINDER_QUEUE_NAME,
  dispatchDueBookingReminders,
  processBookingReminderBatch,
} from "./booking-reminders";
import {
  dispatchDueScheduledAssistantJobs,
  markAssistantJobQueueMessageFailed,
  processAssistantJobQueueMessage,
} from "./assistant-jobs";
import {
  dispatchDueSocialPublications,
  processSocialPublishBatch,
  SOCIAL_PUBLISH_QUEUE_NAME,
} from "./social-publishing";
import {
  handleInboundEmail,
  type ForwardableEmailMessageLike,
} from "./routes/mailbox";
import { Me3UserAgent } from "./user-agent";
import type {
  AssistantJobEventQueueMessage,
  BookingReminderQueueMessage,
  Env,
  SocialPublishQueueMessage,
} from "./types";

export { Me3UserAgent };
export { getMe3CloudUsernamePublishBlockReason } from "./sites";

export async function handleAssistantJobQueueBatch(
  batch: MessageBatch<AssistantJobEventQueueMessage>,
  env: Env,
) {
  const isDeadLetterBatch = batch.queue.includes("dlq");

  for (const message of batch.messages) {
    try {
      if (isDeadLetterBatch) {
        await markAssistantJobQueueMessageFailed(
          env,
          message.body,
          new Error("Assistant Job queue message reached the dead-letter queue"),
        );
      } else {
        await processAssistantJobQueueMessage(env, message.body);
      }
      message.ack();
    } catch (error) {
      if (isDeadLetterBatch) {
        message.ack();
      } else {
        message.retry();
      }
    }
  }
}

const worker = {
  fetch(request: Request, env: Env, ctx?: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  email(message: ForwardableEmailMessageLike, env: Env, _ctx?: ExecutionContext) {
    return handleInboundEmail(message, env);
  },
  async scheduled(_event: ScheduledEvent, env: Env, _ctx?: ExecutionContext) {
    await dispatchDueScheduledAssistantJobs(env);
    await dispatchDueBookingReminders(env);
    await dispatchDueSocialPublications(env);
    await dispatchDueCalendarSourceRefreshes(env);
  },
  queue(
    batch: MessageBatch<
      AssistantJobEventQueueMessage | BookingReminderQueueMessage | SocialPublishQueueMessage
    >,
    env: Env,
  ) {
    if (batch.queue === BOOKING_REMINDER_QUEUE_NAME || batch.queue.includes("booking-reminders")) {
      return processBookingReminderBatch(
        batch as MessageBatch<BookingReminderQueueMessage>,
        env,
      );
    }
    if (batch.queue === SOCIAL_PUBLISH_QUEUE_NAME || batch.queue.includes("social-publish")) {
      return processSocialPublishBatch(batch as MessageBatch<SocialPublishQueueMessage>, env);
    }
    return handleAssistantJobQueueBatch(batch as MessageBatch<AssistantJobEventQueueMessage>, env);
  },
};

export default worker;
