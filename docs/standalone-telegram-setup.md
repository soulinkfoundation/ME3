# Standalone Telegram Bot Setup

Standalone ME3 Core installs use their own Telegram bot.

## 1. Create The Bot

1. Open Telegram and message `@BotFather`.
2. Send `/newbot`.
3. Choose a display name.
4. Choose a username ending in `bot`, for example `your_me3_bot`.
5. Copy the bot token. Treat it like a password.

Telegram documents this BotFather flow in its bot features guide:
https://core.telegram.org/bots/features#botfather

## 2. Configure ME3 Core

Open ME3 Account -> Telegram and paste:

- Bot username
- Bot token
- Webhook secret

Use the Generate button for the webhook secret, then choose Save & set webhook.
ME3 stores owner-supplied tokens encrypted in D1 and does not return them to the
browser after saving.

## 3. Link Your Account

1. Open ME3 Account -> Telegram.
2. Scan the QR code or open the setup link.
3. Tap Start in Telegram.
4. Send a test message to the bot.

The bot should reply through the ME3 agent runtime. If it links but does not
reply, check that `ME3_USER_AGENT` is bound and your AI provider is configured.

## Advanced: Configure With Wrangler

You can still configure Telegram outside the UI. Add the public username to
`wrangler.toml`:

```toml
[vars]
TELEGRAM_BOT_USERNAME = "your_me3_bot"
```

Store the private values as Cloudflare secrets:

```bash
pnpm wrangler secret put TELEGRAM_BOT_TOKEN
pnpm wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Use a random value for `TELEGRAM_WEBHOOK_SECRET`, for example:

```bash
openssl rand -base64 32 | tr '/+' '_-' | tr -d '='
```

Deploy after changing config:

```bash
pnpm deploy
```

Then point Telegram at ME3. Replace the placeholders:


```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://me3.your-domain.com/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

Telegram sends webhook updates as HTTPS POST requests and includes
`X-Telegram-Bot-Api-Secret-Token` when `secret_token` is set:
https://core.telegram.org/bots/api#setwebhook
