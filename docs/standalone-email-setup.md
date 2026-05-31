# Standalone Email Setup

This is the simplest Cloudflare-native path for a standalone ME3 Core install running on a custom domain.

Assume the private app is available at:

```text
https://me3.your-domain.com
```

The owner wants ME3 to manage:

```text
name@your-domain.com
```

Use Cloudflare Email Routing for inbound mail and Cloudflare Email Sending for outbound mail.

## 1. Configure The ME3 Mailbox

In ME3 Core, open Account -> Email.

Under Receive email at:

```text
Email name: name
Forward copy to: optional
```

Save the mailbox, then activate it.

ME3 stores the local part, such as `name`, and expects Cloudflare to route `name@your-domain.com` to the same Worker that serves the Core install.

## 2. Configure Inbound Mail In Cloudflare

In Cloudflare for `your-domain.com`:

1. Open Email Service or Email Routing.
2. Onboard the domain if Cloudflare asks you to.
3. Make sure the MX records are active.
4. Create a routing rule for `name@your-domain.com`.
5. Set the action to `Send to a Worker`.
6. Choose the ME3 Core Worker.

Do not add `name@your-domain.com` as a Destination Address unless you want Cloudflare to forward mail to a separate inbox. Worker delivery does not need destination-address verification.

## 3. Configure Outbound Mail In Cloudflare

Cloudflare Email Sending is in public beta. It sends from Workers through a `send_email` binding.

In Cloudflare Email Service:

1. Enable Email Sending for `your-domain.com`.
2. Complete Cloudflare's sender/domain verification steps.
3. Confirm the sender address or domain can send as `name@your-domain.com`.

Then add the binding to the install's `wrangler.toml`. This gives the Worker
permission to send through Cloudflare; ME3's Account UI remains the source of
truth for the From and Reply-to addresses.

```toml
[[send_email]]
name = "EMAIL"
remote = true
```

You can also add `allowed_sender_addresses = ["name@your-domain.com"]` if you
want Wrangler to hard-limit the Worker to that sender. That is safer, but it
means the deployed config must be updated whenever the ME3 sender address
changes.

Deploy the Worker after changing `wrangler.toml`.

If ME3 says `Cloudflare Email Service is not ready to send yet`, it has not
detected a ready outbound provider. For the Cloudflare provider, check that the
deployed Worker has the `EMAIL` send binding above and the Cloudflare sending
domain or address has finished verification. If you use
`allowed_sender_addresses`, also check that it matches the From address saved in
ME3.

## 4. Configure Outbound Mail In ME3

In Account -> Email -> Send email with:

```text
Provider: Cloudflare Email Service
From address: name@your-domain.com
Display name: ME3 Core
Reply-to address: name@your-domain.com
```

Save sender settings, then send a test email.

## 5. Test The Full Loop

1. Send a message from another email account to `name@your-domain.com`.
2. Open `/email` in ME3 and confirm the message appears.
3. Draft a reply and approve it.
4. Confirm the reply is delivered from `name@your-domain.com`.

## Notes

- Inbound and outbound setup are separate, even when both use Cloudflare.
- Email Routing receives mail and routes it to the Worker.
- Email Sending sends mail from the Worker through the `EMAIL` binding.
- Destination Addresses are only for forwarding mail to existing external inboxes.
- SMTP, Postmark, and Mailgun are still useful fallback outbound providers when Cloudflare Email Sending is unavailable for an install.
