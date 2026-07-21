import {
  defineMe3AgentCapabilityContract,
  ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
  validateMe3AgentCapabilityContract,
  type Me3AgentCapabilityApprovalMode,
  type Me3AgentCapabilityContract,
  type Me3AgentCapabilitySideEffect,
} from "@me3/knowledge";

export type CoreChatPlannerIntentKind =
  | "conversation"
  | "read_action"
  | "write_action"
  | "clarify";

export type CoreChatSideEffectLevel = "none" | "read" | "write";

export type CoreChatCapabilityContract = Me3AgentCapabilityContract & {
  handler: {
    surface: "chat";
    route: string;
  };
  chat: {
    intentKind: Exclude<CoreChatPlannerIntentKind, "clarify">;
    sideEffectLevel: CoreChatSideEffectLevel;
  };
};

export const CORE_CHAT_CAPABILITIES = [
  defineCoreChatCapability({
    id: "core.agent-chat.conversation",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Answer in chat",
    summary: "Answer setup, capability, context, and planning questions in chat.",
    category: "assistant",
    handler: {
      surface: "chat",
      route: "model",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: [],
    auditEventKind: "core_chat_conversation",
    examples: {
      positive: [
        "What tools can you access here?",
        "I am setting up ME3 for the first time. What can you do?",
      ],
      negative: ["Do I have any pending reminders?"],
    },
    chat: {
      intentKind: "conversation",
      sideEffectLevel: "none",
    },
  }),
  defineCoreChatCapability({
    id: "core.mailbox.search",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Search mailbox",
    summary: "Search the owner's mailbox and return scoped message summaries with stable IDs.",
    category: "email",
    handler: {
      surface: "chat",
      route: "core.mailbox.search",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["mailbox"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional subject, sender, recipient, or body search." },
        direction: {
          type: "string",
          description: "Optional message direction.",
          enum: ["inbound", "outbound"],
        },
        folder: { type: "string", description: "Optional mailbox folder." },
        unread: { type: "boolean", description: "Whether to return only unread inbound mail." },
        limit: { type: "integer", description: "Maximum summaries to return, from 1 to 20." },
      },
      additionalProperties: false,
    },
    auditEventKind: "core_mailbox_searched",
    examples: {
      positive: ["Find the latest email from Ada about the launch."],
      negative: ["Draft an email to Ada."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.mailbox.read",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Read mailbox message",
    summary: "Read one owner-scoped mailbox message using its stable message ID.",
    category: "email",
    handler: {
      surface: "chat",
      route: "core.mailbox.read",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["mailbox"],
    inputSchema: {
      type: "object",
      required: ["messageId"],
      properties: {
        messageId: { type: "string", description: "Stable mailbox message ID from search results." },
      },
      additionalProperties: false,
    },
    auditEventKind: "core_mailbox_message_read",
    examples: {
      positive: ["Read the full email you found from Ada."],
      negative: ["Search my mailbox for Ada."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.mailbox.draft",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Save mailbox draft",
    summary: "Save an email draft into the Core mailbox without sending it.",
    category: "email",
    handler: {
      surface: "chat",
      route: "core.mailbox.draft",
    },
    sideEffect: "external_draft",
    approvalMode: "none",
    requiresSetup: ["mailbox"],
    inputSchema: {
      type: "object",
      required: ["to", "subject", "body"],
      properties: {
        to: { type: "string", description: "Recipient email address.", format: "email" },
        subject: { type: "string", description: "Draft email subject." },
        body: { type: "string", description: "Plain-text email body." },
        replyToMessageId: {
          type: "string",
          description: "Optional stable mailbox message ID when drafting a reply.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "core_mailbox_draft_saved",
    examples: {
      positive: ["Save that email draft to /email for review."],
      negative: ["Create an email to Ada about the launch."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.reminders.list",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "List reminders",
    summary: "Read pending Core reminders for the owner.",
    category: "calendar",
    handler: {
      surface: "chat",
      route: "core.reminders.list",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["calendar.reminders"],
    auditEventKind: "core_reminders_listed",
    examples: {
      positive: ["Do I have any pending reminders?"],
      negative: ["I want to test reminders, calendar, and tasks."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.reminders.create",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Create reminder",
    summary: "Create a Core reminder from a clear owner request.",
    category: "calendar",
    handler: {
      surface: "chat",
      route: "core.reminders.create",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["calendar.reminders"],
    inputSchema: {
      type: "object",
      required: ["title", "remindAt"],
      properties: {
        title: { type: "string", description: "Reminder title." },
        notes: { type: "string", description: "Optional reminder notes." },
        remindAt: {
          type: "string",
          description: "ISO timestamp for when to remind the owner.",
          format: "date-time",
        },
        timezone: { type: "string", description: "Owner timezone." },
        recurrence: {
          type: "string",
          description: "Optional daily, weekly, monthly, yearly, or custom recurrence.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "core_reminder_created",
    examples: {
      positive: ["Remind me tomorrow at 9 to follow up with Sam."],
      negative: ["What reminder tools can you use?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.reminders.update",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Update reminder",
    summary: "Update a pending Core reminder using its stable identifier.",
    category: "calendar",
    handler: {
      surface: "chat",
      route: "core.reminders.update",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["calendar.reminders"],
    inputSchema: {
      type: "object",
      required: ["reminderId", "title", "remindAt"],
      properties: {
        reminderId: { type: "string", description: "Stable reminder identifier." },
        title: { type: "string", description: "Updated reminder title." },
        notes: { type: "string", description: "Optional updated reminder notes." },
        remindAt: {
          type: "string",
          description: "Updated ISO timestamp for the reminder.",
          format: "date-time",
        },
        timezone: { type: "string", description: "Owner timezone." },
        recurrence: {
          type: "string",
          description: "Optional updated recurrence.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "core_reminder_updated",
    examples: {
      positive: ["Move that reminder to tomorrow at 10."],
      negative: ["What reminders are pending?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.reminders.cancel",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Cancel reminder",
    summary: "Cancel a pending Core reminder using its stable identifier.",
    category: "calendar",
    handler: {
      surface: "chat",
      route: "core.reminders.cancel",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["calendar.reminders"],
    inputSchema: {
      type: "object",
      required: ["reminderId"],
      properties: {
        reminderId: { type: "string", description: "Stable reminder identifier." },
      },
      additionalProperties: false,
    },
    auditEventKind: "core_reminder_cancelled",
    examples: {
      positive: ["Cancel the reminder to call Sam."],
      negative: ["List my reminders."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.bookings.lookup",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Look up bookings",
    summary: "Read upcoming confirmed booking records for the owner.",
    category: "calendar",
    handler: {
      surface: "chat",
      route: "core.bookings.lookup",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["booking"],
    auditEventKind: "core_bookings_lookup",
    examples: {
      positive: ["Can you check my upcoming bookings this week?"],
      negative: [
        "I want to test bookings and calendar features.",
        "Trim this booking confirmation email: join my call room on {{ bookingTime }}.",
      ],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.landing_page.designs",
    owner: "plugin",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "List landing-page designs",
    summary: "List the replaceable starter design packs available for ME3 landing pages.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.landing_page.designs",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["landing-pages"],
    auditEventKind: "landing_page_designs_listed",
    examples: {
      positive: ["What landing-page designs can I choose from?"],
      negative: ["Show my blog posts."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.landing_page.list",
    owner: "plugin",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "List landing-page drafts",
    summary: "List landing pages for an owner profile site with stable page and design IDs.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.landing_page.list",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["landing-pages"],
    inputSchema: {
      type: "object",
      properties: {
        site: {
          type: "string",
          description: "Optional profile-site username or custom domain.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "landing_pages_listed",
    examples: {
      positive: ["Show the landing pages on my site."],
      negative: ["Create a new event landing page."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.landing_page.create",
    owner: "plugin",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Create landing-page draft",
    summary: "Create a reviewable landing-page draft from an owner brief using a versioned starter design.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.landing_page.create",
    },
    sideEffect: "write_internal_draft",
    approvalMode: "none",
    requiresSetup: ["landing-pages"],
    inputSchema: {
      type: "object",
      required: ["purpose", "brief"],
      properties: {
        site: {
          type: "string",
          description: "Optional profile-site username or custom domain.",
        },
        slug: {
          type: "string",
          description: "Optional short URL path. ME3 derives one when omitted.",
        },
        purpose: {
          type: "string",
          description: "The page's functional purpose.",
          enum: ["event", "service", "waitlist"],
        },
        designPackId: {
          type: "string",
          description: "Optional compatible starter design-pack ID. Omit for the recommended design.",
          enum: ["starter-event-01", "starter-service-01", "starter-waitlist-01"],
        },
        brief: {
          type: "string",
          description: "The factual offer, event, or launch brief supplied by the owner.",
        },
        headline: {
          type: "string",
          description: "Optional polished page headline grounded in the brief.",
        },
        subheadline: {
          type: "string",
          description: "Optional concise introduction grounded in the brief.",
        },
        highlights: {
          type: "string",
          description: "Optional newline-separated highlights as Title: explanation.",
        },
        ctaLabel: {
          type: "string",
          description: "Optional primary button label.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "landing_page_draft_created",
    examples: {
      positive: [
        "Create a landing page for my Saturday breathwork workshop in Dublin.",
        "Build a waitlist page for my new coaching product.",
      ],
      negative: ["Brainstorm landing-page ideas with me."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.landing_page.update",
    owner: "plugin",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Update landing-page draft",
    summary: "Revise the content or replaceable design pack of an existing landing-page draft.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.landing_page.update",
    },
    sideEffect: "write_internal_draft",
    approvalMode: "none",
    requiresSetup: ["landing-pages"],
    inputSchema: {
      type: "object",
      required: ["pageId"],
      properties: {
        site: {
          type: "string",
          description: "Optional profile-site username or custom domain.",
        },
        pageId: {
          type: "string",
          description: "Stable page ID returned by the landing-page list or create tool.",
        },
        designPackId: {
          type: "string",
          description: "Optional compatible replacement design-pack ID.",
          enum: ["starter-event-01", "starter-service-01", "starter-waitlist-01"],
        },
        headline: { type: "string", description: "Optional replacement headline." },
        subheadline: { type: "string", description: "Optional replacement introduction." },
        highlights: {
          type: "string",
          description: "Optional newline-separated replacement highlights as Title: explanation.",
        },
        ctaLabel: { type: "string", description: "Optional replacement primary button label." },
      },
      additionalProperties: false,
    },
    auditEventKind: "landing_page_draft_updated",
    examples: {
      positive: ["Change that landing-page headline and make the call to action Book a place."],
      negative: ["Publish the landing page now."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.list",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "List site blog posts",
    summary: "Read profile-site blog post metadata and body previews.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.list",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    auditEventKind: "site_blog_posts_listed",
    examples: {
      positive: ["Show my blog posts."],
      negative: ["Write a social post for LinkedIn."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.read",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Read site blog post",
    summary: "Read one profile-site blog post with full markdown body.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.read",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    inputSchema: {
      type: "object",
      required: ["post"],
      properties: {
        site: {
          type: "string",
          description: "Optional site username, domain, or profile name.",
        },
        post: { type: "string", description: "Blog post title, slug, file path, or alias." },
      },
      additionalProperties: false,
    },
    auditEventKind: "site_blog_post_read",
    examples: {
      positive: ["Read the blog post about agent context."],
      negative: ["Show all blog posts."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.create",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Create site blog post",
    summary: "Create a profile-site blog post draft or published post.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.create",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        site: {
          type: "string",
          description: "Optional site username, domain, or profile name.",
        },
        title: { type: "string", description: "Blog post title." },
        slug: { type: "string", description: "Optional slug." },
        excerpt: { type: "string", description: "Optional excerpt." },
        bodyMarkdown: { type: "string", description: "Optional markdown body." },
        draft: { type: "boolean", description: "Whether the post should remain a draft." },
      },
      additionalProperties: false,
    },
    auditEventKind: "site_blog_post_created",
    examples: {
      positive: ["Create a draft blog post about why regex intent routing fails."],
      negative: ["Brainstorm blog ideas with me."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.update",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Update site blog post",
    summary: "Update profile-site blog post metadata, publish state, slug, excerpt, or body.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.update",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    inputSchema: {
      type: "object",
      required: ["post"],
      properties: {
        site: {
          type: "string",
          description: "Optional site username, domain, or profile name.",
        },
        post: { type: "string", description: "Blog post title, slug, file path, or alias." },
        title: { type: "string", description: "Optional replacement title." },
        slug: { type: "string", description: "Optional replacement slug." },
        excerpt: { type: "string", description: "Optional replacement excerpt." },
        bodyMarkdown: { type: "string", description: "Optional replacement markdown body." },
        draft: { type: "boolean", description: "Optional draft/published state." },
        publishedAt: {
          type: "string",
          description: "Optional YYYY-MM-DD publish date.",
          format: "date",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "site_blog_post_updated",
    examples: {
      positive: ["Rename the post ME3 assistant notes to ME3 agent notes."],
      negative: ["Help me improve my writing style."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.sites.blog_post.archive",
    owner: "core",
    pluginId: "me3.landing-pages",
    ownerFacingLabel: "Archive site blog post",
    summary: "Remove a profile-site blog post from active metadata and archive its markdown file.",
    category: "sites",
    handler: {
      surface: "chat",
      route: "core.sites.blog_post.archive",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["site_files"],
    inputSchema: {
      type: "object",
      required: ["post"],
      properties: {
        site: {
          type: "string",
          description: "Optional site username, domain, or profile name.",
        },
        post: { type: "string", description: "Blog post title, slug, file path, or alias." },
      },
      additionalProperties: false,
    },
    auditEventKind: "site_blog_post_archived",
    examples: {
      positive: ["Delete the old launch notes post."],
      negative: ["Can you explain deleted site posts?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.owner_content.search",
    owner: "core",
    pluginId: null,
    ownerFacingLabel: "Search owner content",
    summary: "Search the owner's Mission Control tasks and Journal entries by title or body, returning lightweight candidates with stable IDs.",
    category: "assistant",
    handler: {
      surface: "chat",
      route: "core.owner_content.search",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: [],
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Remembered title words or content to find in tasks and Journal entries.",
        },
        sourceType: {
          type: "string",
          description: "Optional source kind, or all to search both tasks and Journal entries.",
          enum: ["all", "journal", "mission_task"],
        },
        projectId: {
          type: "string",
          description: "Optional stable Mission Control project ID.",
        },
        projectName: {
          type: "string",
          description: "Optional exact Mission Control project name or slug.",
        },
        status: {
          type: "string",
          description: "Optional Mission Control task status.",
          enum: ["backlog", "in_progress", "review", "done", "cancelled"],
        },
        dateFrom: {
          type: "string",
          description: "Optional earliest Journal date or Mission task due date, as YYYY-MM-DD.",
          format: "date",
        },
        dateTo: {
          type: "string",
          description: "Optional latest Journal date or Mission task due date, as YYYY-MM-DD.",
          format: "date",
        },
        limit: {
          type: "integer",
          description: "Maximum lightweight candidates to return, from 1 to 20.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "owner_content_searched",
    examples: {
      positive: [
        "Find the task called Eating our own AI cooking.",
        "Search my Journal for the note about resilient agent context.",
      ],
      negative: ["Show every task in my backlog."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.social.source.read",
    owner: "plugin",
    pluginId: "me3.social-publishing",
    ownerFacingLabel: "Read social post source",
    summary: "Read one Journal entry or Mission Control task as the source for a social draft.",
    category: "content",
    handler: {
      surface: "chat",
      route: "core.social.source.read",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["social-publishing"],
    inputSchema: {
      type: "object",
      required: ["sourceType", "sourceId"],
      properties: {
        sourceType: {
          type: "string",
          description: "Source kind for the social Post.",
          enum: ["journal", "mission_task"],
        },
        sourceId: {
          type: "string",
          description: "Journal entry ID/date (or today), or stable Mission Control task ID.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "social_content_source_read",
    examples: {
      positive: ["Read today's journal as the Source for a social Post."],
      negative: ["Read the blog post about agent context."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.social.library.search",
    owner: "plugin",
    pluginId: "me3.social-publishing",
    ownerFacingLabel: "Search social Post library",
    summary: "Search the owner's Social Post library and return reviewable Versions with stable IDs.",
    category: "content",
    handler: {
      surface: "chat",
      route: "core.social.library.search",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["social-publishing"],
    inputSchema: {
      type: "object",
      properties: {
        siteId: { type: "string", description: "Optional owner site ID." },
        query: {
          type: "string",
          description: "Optional Source title or reference, topic text, Post text, or tag search.",
        },
        source: { type: "string", description: "Optional Source title or reference search." },
        platform: {
          type: "string",
          description: "Optional social platform.",
          enum: ["linkedin", "x", "instagram", "instagram_business", "youtube", "tiktok"],
        },
        accountId: { type: "string", description: "Optional stable social account ID." },
        approvalStatus: {
          type: "string",
          description: "Optional Version approval state.",
          enum: ["draft", "approved", "rejected"],
        },
        deliveryState: {
          type: "string",
          description: "Optional latest Publication state.",
          enum: ["scheduled", "queued", "publishing", "published", "failed", "cancelled"],
        },
        tag: { type: "string", description: "Optional exact owner tag." },
        publishedFrom: {
          type: "string",
          description: "Optional inclusive earliest Publication timestamp.",
          format: "date-time",
        },
        publishedTo: {
          type: "string",
          description: "Optional exclusive latest Publication timestamp.",
          format: "date-time",
        },
        limit: { type: "integer", description: "Maximum results, from 1 to 100." },
      },
      additionalProperties: false,
    },
    auditEventKind: "social_post_library_searched",
    examples: {
      positive: [
        "Find my approved LinkedIn Posts about launch planning.",
        "Show Posts tagged founder that I published last month.",
      ],
      negative: ["Write a new social Post from today's Journal."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.social.posting_plan.create",
    owner: "plugin",
    pluginId: "me3.social-publishing",
    ownerFacingLabel: "Propose social Posting plan",
    summary: "Propose reviewable posting times for approved Versions without creating Publications.",
    category: "content",
    handler: {
      surface: "chat",
      route: "core.social.posting_plan.create",
    },
    sideEffect: "write_internal_draft",
    approvalMode: "none",
    requiresSetup: ["social-publishing"],
    inputSchema: {
      type: "object",
      required: ["accountId", "windowStart", "windowEnd", "count"],
      properties: {
        accountId: { type: "string", description: "Stable connected social account ID." },
        versionIds: {
          type: "string",
          description: "Optional comma-separated exact approved Version IDs selected from library search.",
        },
        windowStart: {
          type: "string",
          description: "Inclusive start of the requested planning window.",
          format: "date-time",
        },
        windowEnd: {
          type: "string",
          description: "Exclusive end of the requested planning window.",
          format: "date-time",
        },
        count: { type: "integer", description: "Number of Posts to propose, from 1 to 20." },
      },
      additionalProperties: false,
    },
    auditEventKind: "social_posting_plan_proposed",
    examples: {
      positive: ["Propose times for three approved LinkedIn Posts next week."],
      negative: ["Schedule those Posts now."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.social.posting_plan.confirm",
    owner: "plugin",
    pluginId: "me3.social-publishing",
    ownerFacingLabel: "Confirm social Posting plan",
    summary: "Create the reviewed Publications in one Posting plan after explicit owner confirmation.",
    category: "content",
    handler: {
      surface: "chat",
      route: "core.social.posting_plan.confirm",
    },
    sideEffect: "write_internal_active",
    approvalMode: "approval_required",
    requiresSetup: ["social-publishing"],
    inputSchema: {
      type: "object",
      required: ["planId", "expectedUpdatedAt", "confirmed"],
      properties: {
        planId: { type: "string", description: "Stable Posting plan ID from the proposal." },
        expectedUpdatedAt: {
          type: "string",
          description: "Exact last-reviewed Posting plan update timestamp.",
          format: "date-time",
        },
        confirmed: {
          type: "boolean",
          description: "True only after the owner explicitly confirms the reviewed Posting plan.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "social_posting_plan_confirmed",
    examples: {
      positive: ["Yes, confirm that Posting plan exactly as shown."],
      negative: ["Show me what you would schedule next week."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.social.draft.create",
    owner: "plugin",
    pluginId: "me3.social-publishing",
    ownerFacingLabel: "Save social post drafts",
    summary: "Save a source-backed social Post with reviewable LinkedIn, X, and Instagram Versions.",
    category: "content",
    handler: {
      surface: "chat",
      route: "core.social.draft.create",
    },
    sideEffect: "write_internal_draft",
    approvalMode: "none",
    requiresSetup: ["social-publishing"],
    inputSchema: {
      type: "object",
      required: ["sourceType", "sourceId", "ideaText"],
      properties: {
        sourceType: {
          type: "string",
          description: "Source kind already read with the social Source tool.",
          enum: ["journal", "mission_task"],
        },
        sourceId: {
          type: "string",
          description: "The exact source ID/date used with the social source tool.",
        },
        siteId: {
          type: "string",
          description: "Optional owner site ID. Omit to use the primary profile site.",
        },
        ideaText: {
          type: "string",
          description: "A concise source-derived description using the owner's own wording where possible.",
        },
        linkedinBody: {
          type: "string",
          description: "Optional LinkedIn draft that preserves the source wording and voice, with only necessary formatting edits.",
        },
        xBody: {
          type: "string",
          description: "Optional concise X draft that stays as close as possible to the owner's source words.",
        },
        instagramBody: {
          type: "string",
          description: "Optional Instagram caption that preserves the owner's source wording and voice.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "social_content_draft_saved",
    examples: {
      positive: ["Turn today's journal into LinkedIn, X, and Instagram drafts."],
      negative: [
        "Brainstorm social post ideas with me.",
        "Save a publishable post from this blank prompt without using one of my Sources.",
      ],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.social.suggestions.create",
    owner: "plugin",
    pluginId: "me3.social-publishing",
    ownerFacingLabel: "Create grounded social Suggestions",
    summary: "Create a Quote, Short Post, Thread, and carousel outline Suggestion from one explicitly read owner Source.",
    category: "content",
    handler: {
      surface: "chat",
      route: "core.social.suggestions.create",
    },
    sideEffect: "write_internal_draft",
    approvalMode: "none",
    requiresSetup: ["social-publishing"],
    inputSchema: {
      type: "object",
      required: [
        "sourceType",
        "sourceId",
        "quoteText",
        "quoteSourceExcerpt",
        "shortPostText",
        "shortPostSourceExcerpt",
        "threadText",
        "threadSourceExcerpt",
        "carouselOutlineText",
        "carouselSourceExcerpt",
      ],
      properties: {
        sourceType: {
          type: "string",
          description: "Source kind already read with the social Source tool.",
          enum: ["journal", "mission_task"],
        },
        sourceId: {
          type: "string",
          description: "The exact source ID/date used with the social Source tool.",
        },
        siteId: {
          type: "string",
          description: "Optional owner site ID. Omit to use the primary profile site.",
        },
        quoteText: {
          type: "string",
          description: "A verbatim Source quote, or a disclosed trimming that only removes words.",
        },
        quoteSourceExcerpt: {
          type: "string",
          description: "Exact visible Source text supporting the Quote Suggestion.",
        },
        quoteTrimmed: {
          type: "boolean",
          description: "True only when the quote removes Source words and visibly discloses trimming.",
        },
        shortPostText: {
          type: "string",
          description: "A short Post Suggestion that only condenses or reorganizes Source meaning.",
        },
        shortPostSourceExcerpt: {
          type: "string",
          description: "Exact visible Source text supporting the Short Post Suggestion.",
        },
        threadText: {
          type: "string",
          description: "A numbered Thread Suggestion grounded only in the Source.",
        },
        threadSourceExcerpt: {
          type: "string",
          description: "Exact visible Source text supporting the Thread Suggestion.",
        },
        carouselOutlineText: {
          type: "string",
          description: "A slide-by-slide carousel outline grounded only in the Source.",
        },
        carouselSourceExcerpt: {
          type: "string",
          description: "Exact visible Source text supporting the carousel outline Suggestion.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "social_suggestions_created",
    examples: {
      positive: [
        "Turn today's Journal into a Quote, Short Post, Thread, and carousel outline I can review.",
        "Repurpose the Mission Control task we just read into grounded social Suggestions.",
      ],
      negative: [
        "Invent four social Suggestions without reading one of my Sources.",
        "Make up a personal story and opinions for my social voice.",
      ],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.create",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Create Mission Control task",
    summary: "Create a Mission Control task from a clear owner request.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.create",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", description: "Task title." },
        description: {
          type: "string",
          description: "Optional task description, notes, details, or body.",
        },
        projectId: { type: "string", description: "Mission Control project ID." },
        dueAt: {
          type: "string",
          description: "Optional YYYY-MM-DD due date.",
          format: "date",
        },
        priority: {
          type: "number",
          description: "Optional priority from 1 (highest) to 5 (lowest).",
          enum: [1, 2, 3, 4, 5],
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "mission_task_created",
    examples: {
      positive: ["Add a task to project ME3 Launch to follow up with Sam tomorrow."],
      negative: ["I want to test Mission Control tasks and projects."],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.list",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "List Mission Control tasks",
    summary: "Read Mission Control tasks by project and status.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.list",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Stable Mission Control project ID, or null to list across all projects.",
        },
        projectName: {
          type: "string",
          description: "Exact Mission Control project name or slug, or null when not filtering by project.",
        },
        status: {
          type: "string",
          description: "Task status to filter, or null for every status.",
          enum: ["backlog", "in_progress", "review", "done"],
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "mission_task_read",
    examples: {
      positive: [
        "Show backlog tasks for project ME3 Launch.",
        "Help me prioritise my Mission Control tasks.",
      ],
      negative: ["Explain how task statuses work."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.read",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Read Mission Control task",
    summary: "Read one Mission Control task, including its full description where possible.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.read",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "Mission Control task ID." },
      },
      additionalProperties: false,
    },
    auditEventKind: "mission_task_read",
    examples: {
      positive: ["Read the full details for task Prepare launch checklist."],
      negative: ["Show backlog tasks for project ME3 Launch."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.context.read",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Read Mission Control context",
    summary: "Read Mission Control project context with tasks, mission statement, and public audience context.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.context.read",
    },
    sideEffect: "read_private",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Optional Mission Control project ID." },
        includeTasks: { type: "boolean", description: "Whether to include linked tasks." },
      },
      additionalProperties: false,
    },
    auditEventKind: "mission_context_read",
    examples: {
      positive: ["Read the mission context for project ME3 Launch."],
      negative: ["Show backlog tasks for project ME3 Launch."],
    },
    chat: {
      intentKind: "read_action",
      sideEffectLevel: "read",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.update",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Update Mission Control task",
    summary: "Update, move, rename, or reschedule a Mission Control task.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.update",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "Mission Control task ID." },
        title: { type: "string", description: "Optional replacement task title." },
        description: {
          type: "string",
          description: "Optional replacement task description, notes, details, or body.",
        },
        projectId: { type: "string", description: "Optional destination project ID." },
        status: {
          type: "string",
          description: "Optional task status.",
          enum: ["backlog", "in_progress", "review", "done"],
        },
        dueAt: {
          type: "string",
          description: "Optional YYYY-MM-DD due date.",
          format: "date",
        },
        priority: {
          type: "number",
          description: "Optional priority from 1 (highest) to 5 (lowest).",
          enum: [1, 2, 3, 4, 5],
        },
        clearDescription: {
          type: "boolean",
          description: "Set true only when the owner explicitly asks to clear the description.",
        },
        clearDueAt: {
          type: "boolean",
          description: "Set true only when the owner explicitly asks to clear the due date.",
        },
      },
      additionalProperties: false,
    },
    auditEventKind: "mission_task_updated",
    examples: {
      positive: ["Mark task follow up with Sam as done."],
      negative: ["How should I organize my Mission Control tasks?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
  defineCoreChatCapability({
    id: "core.mission.task.archive",
    owner: "core",
    pluginId: "me3.mission-control",
    ownerFacingLabel: "Archive Mission Control task",
    summary: "Archive a Mission Control task from a clear owner request.",
    category: "mission_control",
    handler: {
      surface: "chat",
      route: "core.mission.task.archive",
    },
    sideEffect: "write_internal_active",
    approvalMode: "none",
    requiresSetup: ["mission-control"],
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "Mission Control task ID." },
      },
      additionalProperties: false,
    },
    auditEventKind: "mission_task_archived",
    examples: {
      positive: ["Delete task follow up with Sam."],
      negative: ["Can you explain deleted Mission Control tasks?"],
    },
    chat: {
      intentKind: "write_action",
      sideEffectLevel: "write",
    },
  }),
] as const;

export type CoreChatCapabilityId = (typeof CORE_CHAT_CAPABILITIES)[number]["id"];

export const CORE_CHAT_CAPABILITY_IDS = CORE_CHAT_CAPABILITIES.map(
  (capability) => capability.id,
) as readonly CoreChatCapabilityId[];

const CORE_CHAT_CAPABILITY_BY_ID = new Map<CoreChatCapabilityId, CoreChatCapabilityContract>(
  CORE_CHAT_CAPABILITIES.map((capability) => [capability.id, capability]),
);

export function getCoreChatCapability(
  capabilityId: CoreChatCapabilityId,
): CoreChatCapabilityContract {
  const capability = CORE_CHAT_CAPABILITY_BY_ID.get(capabilityId);
  if (!capability) {
    throw new Error(`Unknown Core chat capability: ${capabilityId}`);
  }
  return capability;
}

export function isCoreChatCapabilityApprovalRequired(
  capability: Pick<CoreChatCapabilityContract, "approvalMode">,
): boolean {
  return capability.approvalMode === "review_required" || capability.approvalMode === "approval_required";
}

export function validateCoreChatCapabilityContracts() {
  return CORE_CHAT_CAPABILITIES.flatMap((capability) =>
    validateMe3AgentCapabilityContract(capability),
  );
}

function defineCoreChatCapability(
  input: Omit<CoreChatCapabilityContract, "version" | "inputSchema" | "outputSchema"> & {
    inputSchema?: CoreChatCapabilityContract["inputSchema"];
    outputSchema?: CoreChatCapabilityContract["outputSchema"];
  },
): CoreChatCapabilityContract {
  return defineMe3AgentCapabilityContract({
    version: "0.1.0",
    inputSchema: ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
    outputSchema: ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
    ...input,
  });
}

export type {
  Me3AgentCapabilityApprovalMode as CoreChatApprovalMode,
  Me3AgentCapabilitySideEffect as CoreChatCapabilitySideEffect,
};
