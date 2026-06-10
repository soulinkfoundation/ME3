# Telegram Plugin Plan

Last updated: 2026-06-10

## Goal

Add Telegram back as an optional standalone Core plugin so an owner can connect
their ME3 installation to their own Telegram bot. The owner experience should
live in Account -> Advanced -> App connections, with a small setup flow, a QR
code or setup link, and clear connection health.

This work should also prevent the Telegram/Soulink/future Slack path from
duplicating agent turn code. Providers should only own transport-specific setup,
message normalization, webhook verification, and reply delivery. The shared ME3
agent harness should own dispatch, context, audit, approvals, and run history.

## Product Shape

### Account UI

Show Telegram under `/account` -> Advanced -> App connections, near Soulink. Keep
it as an optional connection rather than a top-level account section.

Owner-facing setup copy should stay short:

- Create a bot in Telegram with `@BotFather`, then copy its username and token.
- Paste the bot details in ME3, generate a webhook secret, and choose Save and
  connect.
- Scan the QR code or open the Telegram link, tap Start, then send a test
  message.

The UI should show:

- Status badge: not configured, ready to link, connected, or needs attention.
- Bot username and secret hints, never full secrets after save.
- QR code and setup link while a pending connection exists.
- Disconnect action for an active connection.
- A compact "test message" hint after linking.

### Plugin Catalog

Add a first-party plugin manifest:

- `id`: `me3.telegram`
- `packageName`: `@me3-core/plugin-telegram`
- `distribution`: `workspace_package`
- `defaultEnabled`: `false`
- `uiSlots`: `account.advanced.connection`
- `routes`:
  - owner routes for status, settings, setup, webhook sync, disconnect
  - public Telegram webhook route
- `permissions`:
  - `agent.channel.telegram.reply`
  - `agent.channel.telegram.events.read`
- `capabilityIds`:
  - `channel.telegram_chat`
- `secrets`:
  - owner-supplied bot token
  - owner-supplied webhook secret

The plugin should be installable from the existing Plugins surface, but the
Advanced app connection row can also show a setup callout when the plugin is not
enabled.

## Existing Remnants To Reuse

These pieces already exist and should be reused rather than rewritten from
scratch:

- `apps/web/src/components/TelegramConnectPanel.vue`
  - already handles status, settings form, QR code rendering through `qrcode`,
    setup link generation, disconnect, and compact/default variants.
- `apps/worker/src/telegram-settings.ts`
  - already validates bot username/token/webhook secret and stores owner secrets
    encrypted with the install encryption key.
- `apps/worker/src/routes/channels.ts`
  - already contains Telegram status/settings/setup/webhook/sending logic, plus
    Soulink routes.
- `apps/worker/src/agent-channels.ts`
  - already has the shared durable-object dispatch bridge and generic provider
    event insertion helpers.
- `apps/worker/migrations/0001_initial_public_schema.sql`
  - already includes `agent_channel_connections`, `agent_channel_events`, and
    `telegram_settings`.
- `docs/standalone-telegram-setup.md`
  - already documents BotFather, webhook, and linking steps.

## Architecture Target

### Shared Channel Harness

Introduce a shared channel adapter boundary before expanding more providers.
This can start inside `apps/worker/src/agent-channels.ts` and move to
`@me3-core/plugin-agent-chat` later if it becomes reusable outside the Worker.

Suggested contract:

```ts
export type AgentChannelId = "telegram" | "soulink" | "slack";

export type NormalizedAgentChannelMessage = {
  channel: AgentChannelId;
  providerEventId: string | null;
  providerMessageId: string | null;
  providerThreadId: string | null;
  providerUserId: string | null;
  providerUsername: string | null;
  text: string;
  replyToMessageId: string | number | null;
  raw: unknown;
};

export type AgentChannelAdapter = {
  id: AgentChannelId;
  normalizeInbound(input: unknown): NormalizedAgentChannelMessage | null;
  resolveConnection(
    env: Env,
    message: NormalizedAgentChannelMessage,
  ): Promise<DbAgentChannelConnection | null>;
  sendReply(
    env: Env,
    connection: DbAgentChannelConnection,
    message: NormalizedAgentChannelMessage,
    replyText: string,
  ): Promise<void>;
};
```

Shared code should own:

- connection lookup orchestration
- inbound/outbound event persistence
- idempotency by provider event id where the provider supplies one
- `dispatchAgentChannelTurn`
- last inbound/outbound timestamps
- failure event persistence
- common response shaping for owner status pages

Provider adapters should own:

- credentials and setup state
- webhook/auth verification
- transport payload parsing
- provider-specific link/start flow
- provider-specific outbound send API
- provider-specific status metadata

### Telegram Plugin Package

Create `packages/telegram` with package name `@me3-core/plugin-telegram`.
Start with exports that mirror current package runtime patterns:

```ts
export const TELEGRAM_PLUGIN_ID = "me3.telegram";

export const TELEGRAM_RUNTIME = {
  id: TELEGRAM_PLUGIN_ID,
  packageName: "@me3-core/plugin-telegram",
  bundled: true,
  runtimeStatus: "owner_bot_channel",
  routes: [
    "/api/telegram/status",
    "/api/telegram/settings",
    "/api/telegram/setup",
    "/api/telegram/webhook/sync",
    "/api/telegram/webhook",
  ],
} as const;
```

Move or expose the Telegram-specific pieces through this package:

- settings validation and encrypted secret helpers
- bot token / webhook secret resolution
- webhook update normalization
- `/start <setupToken>` activation helper
- Telegram `sendMessage`
- Telegram-specific serializers

Keep Worker route composition in `apps/worker/src/routes/channels.ts` or split it
to `apps/worker/src/routes/telegram.ts`, following the repo rule that
`apps/worker/src/index.ts` only wires route modules.

### Route Shape

Keep the current public API for compatibility:

- `GET /api/telegram/status`
- `PUT /api/telegram/settings`
- `POST /api/telegram/webhook/sync`
- `POST /api/telegram/setup`
- `POST /api/telegram/disconnect`
- `POST /api/telegram/webhook`

Optionally add generic aliases later:

- `GET /api/agent/channels/telegram/status`
- `POST /api/agent/channels/telegram/setup`
- `POST /api/agent/channels/telegram/disconnect`

Do not make future providers copy the `/api/telegram/*` implementation. New
providers should register through the shared channel adapter layer and only add
provider-specific routes where required by the provider.

## Data Model

Use the existing tables for the first pass:

- `telegram_settings`: owner bot username, encrypted bot token, encrypted
  webhook secret, hints, timestamps.
- `agent_channel_connections`: one owner connection row for `channel =
  'telegram'`.
- `agent_channel_events`: inbound, outbound, link, and error events.

Important cleanup direction:

- Prefer generic `provider_*` fields for new channel data.
- Leave existing `telegram_*` columns as compatibility fields until a schema
  cleanup is worth the migration.
- Keep all token material encrypted in D1 or stored as Cloudflare secrets; never
  return full token values to the browser.
- Treat standalone Core as owner-controlled. If multi-owner installs become a
  requirement, webhook secret and bot token resolution must stop relying on
  "first configured Telegram row" helpers.

## Implementation Plan

### Phase 1: Catalog And Package Boundary

1. Add `packages/telegram` with `TELEGRAM_PLUGIN_ID` and `TELEGRAM_RUNTIME`.
2. Add `@me3-core/plugin-telegram` as a Worker workspace dependency.
3. Add `me3.telegram` to `CORE_PLUGIN_CATALOG`.
4. Mark it optional by default and setup-required until bot username, bot token,
   webhook secret, and install encryption are ready.

### Phase 2: Shared Channel Adapter

1. Extend `apps/worker/src/agent-channels.ts` into a provider-neutral channel
   dispatch helper.
2. Move duplicate Telegram event insertion and dispatch handling into shared
   functions.
3. Keep Soulink dispatch on the same helper where it fits, without forcing
   Soulink provisioning into the Telegram shape.
4. Add tests around shared channel dispatch with a fake adapter.

### Phase 3: Telegram Extraction

1. Move Telegram settings and transport helpers into `@me3-core/plugin-telegram`
   or re-export them from there while keeping imports stable.
2. Split Telegram owner/webhook routes into a dedicated route module if
   `routes/channels.ts` stays too large.
3. Gate owner routes by plugin enabled state, except status can return enough
   information for the setup UI to explain that the plugin is disabled.
4. Preserve existing `/api/telegram/*` route paths.

### Phase 4: Account UI

1. Import `TelegramConnectPanel.vue` into `apps/web/src/pages/account.vue`.
2. Add a Telegram connection row below Soulink in Advanced -> App connections.
3. Reuse the existing QR/status/settings behavior, but trim the setup copy to
   the three owner-facing bullets above.
4. Show an install/enable action if `me3.telegram` is not enabled yet.
5. Keep `?section=telegram` opening Advanced and preparing the setup link.

### Phase 5: Verification

Backend tests:

- settings validation and secret hints
- status payload before/after setup
- webhook secret rejection
- `/start <setupToken>` activation
- inbound message dispatch into the shared channel helper
- failed dispatch writes an outbound error event

Frontend checks:

- `/account?section=telegram` opens Advanced and shows the Telegram row
- save/connect disabled until required inputs exist
- QR code appears for pending setup
- connected state and disconnect action render correctly
- `pnpm build` passes after web changes

Manual smoke test:

1. Create a test bot with `@BotFather`.
2. Save settings from Account -> Advanced -> Telegram.
3. Let ME3 set the webhook.
4. Scan the QR code or open the setup link.
5. Send a message and confirm the ME3 assistant replies.

## Risks And Decisions

- Telegram supports one webhook per bot. The UI must assume the bot is dedicated
  to this ME3 install.
- The current install-level webhook helpers are acceptable for single-owner Core,
  but they are not a future multi-owner design.
- Bot tokens must stay encrypted or in Cloudflare secrets. Do not add plaintext
  config examples beyond placeholders.
- Telegram is useful for standalone owner-controlled installs, but Soulink
  remains the preferred portable assistant chat direction in the current harness
  roadmap.
- Future Slack or provider channels should not copy Telegram's route internals.
  They should implement the shared adapter contract and contribute only setup,
  normalization, auth, and send behavior.

## Done Criteria

- `me3.telegram` appears as a first-party optional plugin.
- Telegram setup appears in `/account` Advanced app connections.
- Owners can connect a custom Telegram bot with the three-step flow and QR/link.
- Telegram inbound messages dispatch through the shared agent channel helper.
- Telegram replies are sent through the provider adapter and recorded as channel
  events.
- No provider-specific code duplicates the core agent turn, context, approval,
  or audit harness.
