# Standalone Email Setup

This is the smallest setup path for a standalone ME3 Core install that wants to receive and send mail for one owned domain address.

## Recommended First Test

Use one new address first:

```text
test@soulinkfoundation.org
```

Use Cloudflare Email Routing for inbound mail and Postmark for outbound mail. This keeps setup close to what hosted ME3 already uses while avoiding new SMTP or Cloudflare Email Service sender setup.

## 1. Configure Outbound Sending In ME3

In ME3 Core, open Account -> Email -> Send email with.

Choose Postmark and enter:

```text
Provider: Postmark
From address: test@soulinkfoundation.org
Display name: ME3 Core
Reply-to address: test@soulinkfoundation.org
Server API token: Postmark Server API token for soulinkfoundation.org
Message stream: outbound
```

Save the sender settings, then send a test email to a separate inbox.

Postmark must already have either `test@soulinkfoundation.org` as a confirmed sender signature or `soulinkfoundation.org` as a verified sender domain.

## 2. Activate The ME3 Mailbox

ME3 Core stores inbound messages only when the Core mailbox is active.

From the app, the mailbox setup is currently shown as domain-routing driven. If needed, the API can create the mailbox with local part `test`, then activate it:

```bash
curl -X PUT "https://me3.kieranbutler.com/api/mailbox" \
  -H "Content-Type: application/json" \
  -H "Cookie: <owner session cookie>" \
  --data '{"aliasLocalPart":"test","forwardingEnabled":false}'

curl -X POST "https://me3.kieranbutler.com/api/mailbox/activate" \
  -H "Cookie: <owner session cookie>"
```

## 3. Route Inbound Mail In Cloudflare

In Cloudflare for `soulinkfoundation.org`:

1. Open Email Routing.
2. Make sure the domain is onboarded and MX records are active.
3. Create a custom address for `test@soulinkfoundation.org`.
4. Set the action/destination to the ME3 Core Worker, not a regular destination inbox.
5. Save the route.

Cloudflare routes each custom address to one destination or Email Worker. For testing, send mail from a different inbox than any forwarding destination.

## 4. Test Inbound

Send a message from an external account to:

```text
test@soulinkfoundation.org
```

Then open:

```text
https://me3.kieranbutler.com/email
```

The message should appear in the inbox with the original sender, recipient, subject, plain-text body, raw headers, and raw MIME stored in D1.

## 5. Test Reply Flow

From the ME3 email screen:

1. Open the received message.
2. Draft a reply.
3. Approve/send it.

The reply should go out through the active Postmark provider and preserve thread headers when available.

## Notes For Other Users

- Inbound and outbound are separate.
- Cloudflare Email Routing receives mail only; it does not provide SMTP sending.
- Postmark is currently the simplest outbound option for users who can verify a sender/domain.
- SMTP is useful when users already have an authenticated relay, but Workers cannot use port 25.
- Cloudflare Email Service outbound can be a future "all Cloudflare" path, but it needs sender verification and, for bindings, Worker configuration outside the Account UI.
