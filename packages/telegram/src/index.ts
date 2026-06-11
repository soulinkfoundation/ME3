export const TELEGRAM_PLUGIN_ID = "me3.telegram";

export const TELEGRAM_RUNTIME = {
  id: TELEGRAM_PLUGIN_ID,
  packageName: "@me3-core/plugin-telegram",
  bundled: true,
  runtimeStatus: "owner_bot_channel",
  uiSlots: ["account.advanced.connection"],
  routes: [
    "/api/telegram/status",
    "/api/telegram/settings",
    "/api/telegram/setup",
    "/api/telegram/webhook/sync",
    "/api/telegram/disconnect",
    "/api/telegram/webhook",
  ],
  notes: [
    "Core bundles the Telegram owner-bot channel as an optional first-party plugin package.",
    "The current Worker keeps owner auth, encrypted bot settings, webhook verification, and channel dispatch wiring while the provider adapter boundary is extracted.",
    "Bot tokens and webhook secrets are owner-supplied and must stay encrypted or configured as Cloudflare secrets.",
  ],
} as const;

export type TelegramRuntimeStatus = "owner_bot_channel";
