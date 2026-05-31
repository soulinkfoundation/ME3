# Soulink Assistant Chat Spike

Date: 2026-05-31

## Question

ME3 currently uses Telegram as the main portable chat connector between an owner
and their assistant. Soulink already authenticates users with ME3 OAuth and uses
Stream Chat for conversations. This spike asks whether Soulink can become the
preferred portable chat surface for the ME3 assistant.

Short answer: yes. The cleanest path is to model each activated ME3 assistant as
a first-class Soulink participant, provision one stable direct Stream channel
between the owner node and that assistant node, and bridge Stream `message.new`
events into the existing ME3 agent chat runtime.

## Current Shape

### ME3 Core

Core already has the right internal boundary:

- `packages/agent-chat/src/index.ts` owns the bundled `me3.agent-chat` runtime.
- Web/sandbox chat writes `agent_channel_connections` and
  `agent_channel_events`, dispatches a turn, then persists user and assistant
  messages in `assistant_messages`.
- Telegram is a channel-specific wrapper around that runtime:
  - setup creates a pending channel connection,
  - `/start` activates it,
  - inbound webhook messages become channel events,
  - the per-user agent runtime returns `replyText`,
  - the Telegram wrapper sends the reply back over Telegram.
- Standalone Core now stores owner-managed Telegram bot credentials separately
  in `telegram_settings`, keeping install secrets out of shared package code.

The useful abstraction is not "Telegram". It is:

1. Resolve a user-owned channel connection.
2. Normalize an inbound message into an agent turn.
3. Dispatch into `me3.agent-chat` or the hosted per-user runtime.
4. Record an outbound event.
5. Send the reply through the external chat transport.

### me3-app

Hosted `me3-app` has the richer Telegram production path. It is the best
reference for full channel behavior, especially:

- Pro gating.
- `agent_channel_connections` and `agent_channel_events`.
- Durable Object dispatch through `ME3_USER_AGENT`.
- Mailbox approval callbacks.
- Telegram turn retention.

Do not bulk-copy that into Core. Use it as a behavioral reference while keeping
Core, hosted-only, and plugin-owned boundaries explicit.

### Soulink

Soulink already fits the identity side:

- Users login with ME3 OAuth via `POST /api/auth/me3/session`.
- Soulink verifies the ME3 access token against JWKS, checks issuer/audience and
  scope, then upserts a `me3_nodes` row from the verified claims.
- Hosted `me3.app` users and standalone Core installs are both represented as
  ME3 nodes.

Soulink chat today is mostly client-provisioned:

- `POST /api/stream/chat-token` returns a Stream Chat user token for the current
  Soulink node.
- Web, iOS, and Android connect directly to Stream.
- iOS creates direct/group channels client-side with deterministic channel IDs.
- The Soulink Worker receives Stream webhooks at `/api/webhooks/stream` and
  mirrors selected chat/channel/member events into local `chats`,
  `chat_members`, and `links`.

That means Soulink is already the right owner of the user-facing chat surface.
What is missing is a server-owned assistant-channel provisioning path and an
agent message bridge.

## Stream Constraints That Matter

Stream's model supports this:

- User tokens are generated server-side and used client-side to connect to
  Stream Chat.
- Server-side access uses the app secret and must stay on the backend.
- Messaging channels are normally member-gated. Members have a permanent
  association with a channel, receive notification events, and can interact with
  the channel.
- Stream webhooks can be configured for specific events such as `message.new`,
  `message.updated`, and `message.deleted`.

References reviewed:

- https://getstream.io/chat/docs/php/stream_api_and_client_integration/
- https://getstream.io/chat/docs/go-golang/watch_channel/
- https://getstream.io/chat/docs/php/webhooks-overview/

## Options

### Option A: Soulink As Just A Deep Link

ME3 creates a "chat in Soulink" link, but the assistant conversation still runs
through ME3 web chat or Telegram.

Pros:

- Low implementation cost.
- No Stream server bridge needed.

Cons:

- Does not replace Telegram.
- Soulink is not the actual portable assistant inbox.
- Mobile notifications and chat history remain split.

Verdict: useful as a temporary CTA, not the target.

### Option B: Client-Side Soulink Assistant Chat

Soulink clients create a direct channel with a special assistant user and call
ME3 APIs directly when messages are sent.

Pros:

- Fastest demo if only one client matters.
- Minimal Soulink Worker changes.

Cons:

- Duplicates logic across web/iOS/Android.
- Harder to keep activation, permissions, and assistant identity consistent.
- Client-side code would need to understand too much about ME3 runtime state.

Verdict: avoid except for a throwaway prototype.

### Option C: Server-Provisioned Soulink Assistant Channel

ME3 activation calls Soulink to provision a stable assistant node and direct
Stream channel. Soulink receives Stream webhooks, filters messages in that
channel, calls the owning ME3 runtime, and posts the assistant reply into the
same Stream channel as the assistant user.

Pros:

- Soulink remains the chat owner.
- ME3 remains the assistant/runtime owner.
- Works across web/iOS/Android once the channel exists.
- Gives one portable inbox with Stream push/read/archive behavior.
- Clean migration path away from Telegram without losing Telegram immediately.

Cons:

- Requires a small server-to-server trust contract.
- Needs loop prevention and message idempotency.
- Requires channel metadata and UI treatment for "assistant chat".

Verdict: recommended MVP.

### Option D: ME3 Owns Stream Directly

Core and hosted ME3 create Stream users/channels and Soulink only opens them.

Pros:

- ME3 has maximum control.

Cons:

- Blurs product ownership.
- Duplicates Soulink's chat stack.
- Standalone installs would need their own Stream app or hosted Stream relay.

Verdict: not recommended.

## Recommended MVP

Build Option C.

The product experience:

1. The owner activates "Chat with my assistant in Soulink" from standalone Core
   or hosted `me3.app`.
2. ME3 confirms the owner has a ME3 OAuth identity that Soulink can resolve.
3. ME3 calls a Soulink provisioning endpoint.
4. Soulink creates or updates:
   - the owner's Soulink node,
   - a synthetic assistant node for that owner,
   - one stable direct Stream `messaging` channel between them,
   - local `chats` and `chat_members` metadata.
5. Soulink returns a `soulinkChatUrl` and channel metadata to ME3.
6. The user's Soulink inbox shows a single assistant chat near the top.
7. Messages sent by the owner in that channel dispatch into ME3.
8. ME3 returns a reply.
9. Soulink posts the reply to Stream as the assistant user.

## Identity Model

Use a synthetic assistant node per owner, not one shared global assistant node.

Suggested assistant node fields:

- `id`: stable Soulink node id such as `assistant_<hash(issuer:subject)>`.
- `me3_subject`: the owner's ME3 subject plus an assistant suffix, or an
  explicit synthetic subject.
- `issuer`: the ME3 issuer that activated the connector.
- `display_name`: `ME3 Assistant`.
- `handle`: stable but non-public, such as `me3-assistant-<short>`.
- `kind`: add or simulate `assistant`; if schema change is too broad, use
  `standalone` plus metadata for the MVP.
- `status`: `active`.
- `avatar_url`: optional ME3 assistant avatar.

Why per-owner:

- Easier permissioning.
- Clear deletion/export story.
- No accidental cross-owner channel leakage.
- Replies can be posted as the correct assistant identity without custom sender
  spoofing.

## Channel Model

Use one stable direct Stream channel:

- `type`: `messaging`
- `id`: deterministic, for example `assistant-<ownerNodeId>-<assistantNodeId>`
  or a short hash.
- members: `[ownerNodeId, assistantNodeId]`
- custom metadata:
  - `soulinkKind`: `assistant`
  - `me3OwnerNodeId`
  - `me3AssistantNodeId`
  - `me3Connector`: `assistant-chat`
  - `me3RuntimeUrl` or opaque `runtimeId`, depending on trust model

Soulink does not appear to have a pinned chat primitive in its local schema yet.
For the MVP, "pinned" can be implemented as inbox sorting and styling for
assistant channels. If this becomes a general feature, add a per-member
`pinned_at` or `priority` field rather than hard-coding assistant sort forever.

## Server Contracts

### ME3 To Soulink: Provision Assistant Channel

Add a Soulink Worker endpoint:

```http
POST /api/me3/assistant-channel/provision
Authorization: Bearer <ME3-signed connector token or Soulink service token>
Content-Type: application/json
```

Request:

```json
{
  "issuer": "https://api.me3.app",
  "subject": "me3-user-sub",
  "owner": {
    "displayName": "Owner Name",
    "handle": "owner",
    "me3Url": "https://owner.me3.app",
    "avatarUrl": "https://..."
  },
  "assistant": {
    "displayName": "ME3 Assistant",
    "avatarUrl": "https://..."
  },
  "runtime": {
    "kind": "hosted-me3-app",
    "callbackUrl": "https://api.me3.app/api/agent/channels/soulink/dispatch"
  }
}
```

Response:

```json
{
  "ok": true,
  "ownerNodeId": "node_...",
  "assistantNodeId": "assistant_...",
  "streamChannelType": "messaging",
  "streamChannelId": "assistant-...",
  "soulinkChatUrl": "https://soulink.earth/chats/..."
}
```

For standalone Core, the runtime callback must be a public HTTPS URL owned by
the install. If the install is local/private, ME3 can still show setup as
"available after deploy/public URL".

### Soulink To ME3: Dispatch Owner Message

Soulink receives `message.new` from Stream. If the channel has
`soulinkKind=assistant` and the sender is the owner node, Soulink calls ME3:

```http
POST /api/agent/channels/soulink/dispatch
Authorization: Bearer <Soulink-signed dispatch token>
Content-Type: application/json
```

Request:

```json
{
  "channel": "soulink",
  "ownerSubject": "me3-user-sub",
  "ownerNodeId": "node_...",
  "assistantNodeId": "assistant_...",
  "connectionId": "soulink-channel-...",
  "sourceEventId": "stream-message-id",
  "streamChannelType": "messaging",
  "streamChannelId": "assistant-...",
  "messageText": "Can you remind me tomorrow?",
  "replyToMessageId": null,
  "createdAt": "2026-05-31T12:00:00.000Z"
}
```

Response:

```json
{
  "ok": true,
  "replyText": "Sure. What time tomorrow?",
  "turnId": "..."
}
```

ME3 should use the same idempotency pattern as sandbox chat:

- `sourceEventId` is the Stream message id.
- `connectionId` maps to the Soulink channel connection.
- duplicate dispatch returns the already computed response.

### Soulink To Stream: Send Assistant Reply

Soulink posts the ME3 reply to Stream as the assistant user. This should happen
server-side using the Stream app secret, not in the client.

The send path must ignore:

- messages sent by `assistantNodeId`,
- Stream system messages,
- empty or unsupported message types,
- retries where `sourceEventId` has already been processed.

## ME3 Data Changes

Core's existing `agent_channel_connections` and `agent_channel_events` should be
generalized rather than adding a one-off table:

- Add `soulink` to the channel enum/check constraints.
- Add nullable provider columns that are not Telegram-specific:
  - `provider_connection_id`
  - `provider_user_id`
  - `provider_thread_id`
  - `provider_username`
  - `provider_metadata_json`
- Keep Telegram-specific columns for compatibility or migrate them later.
- Store Soulink channel ids and node ids in provider columns/metadata.
- Add `source_event_id` uniqueness per connection if not already enforced.

This keeps one audit surface for Telegram, sandbox, web, and Soulink.

## Soulink Data Changes

Minimal Soulink changes:

- Add an assistant-channel provisioning endpoint.
- Add `assistant` metadata support on chats, either in the existing `chats`
  table through metadata or through a small side table:

```sql
CREATE TABLE assistant_chat_connections (
  id TEXT PRIMARY KEY,
  owner_node_id TEXT NOT NULL,
  assistant_node_id TEXT NOT NULL,
  stream_channel_type TEXT NOT NULL DEFAULT 'messaging',
  stream_channel_id TEXT NOT NULL UNIQUE,
  me3_issuer TEXT NOT NULL,
  me3_subject TEXT NOT NULL,
  me3_runtime_callback_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_dispatched_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- Extend `syncStreamChatWebhook` or add a sibling bridge so assistant channel
  messages can be dispatched to ME3 after the normal mirror/link sync.
- Add server-side Stream helpers for:
  - upserting assistant users,
  - creating/updating assistant channels,
  - sending assistant messages.

## Hosted vs Standalone Boundary

Hosted `me3.app` can use ME3-owned infrastructure:

- hosted OAuth issuer,
- hosted user agent Durable Object,
- hosted callback URL,
- hosted subscription gating,
- managed Soulink connector credentials.

Standalone Core should not embed hosted-only settings:

- no production Cloudflare IDs,
- no production ME3 routes,
- no hosted billing assumptions,
- no ME3-owned provider secrets.

Standalone activation should require:

- public install origin,
- local Core OAuth issuer or hosted account linkage strategy,
- owner-visible connector secret/token,
- explicit "Connect Soulink" state in Account settings.

## Security And Privacy

Required before MVP:

- Server-to-server requests must be signed or bearer-token protected.
- Soulink must verify dispatch callbacks belong to the provisioned ME3 runtime.
- ME3 must verify the Soulink dispatch token and channel metadata.
- Stream app secret stays only in Soulink backend.
- ME3 model prompts receive only the message text and ME3-owned context, not raw
  Stream payloads unless explicitly useful.
- Assistant messages should not create public Soulink links to the assistant as
  if it were a human relationship.
- Account deletion must remove or archive the assistant channel and synthetic
  assistant node data.

## Open Questions

- Should standalone Core act as its own OAuth issuer before this ships, or can
  standalone owners activate through a hosted `me3.app` account first?
- Should Soulink create `links` between owner and assistant, or exclude
  assistant chats from the human relationship graph?
- Do we want message attachments and voice notes in MVP, or text-only first?
- Should approval buttons like Telegram mailbox approvals be represented as
  Stream custom messages/actions, or should the first MVP only do plain text?
- How should users discover the chat: automatic inbox row, activation CTA,
  universal link, or all three?
- Does Soulink need a general `pinned_at` chat feature now, or just assistant
  priority sorting?

## Suggested Implementation Plan

1. Add a shared channel contract in ME3 for `soulink` dispatch payloads and
   responses.
2. Add Core migration support for `soulink` channel connections/events.
3. Add a Soulink Worker provisioning endpoint that upserts owner/assistant nodes
   and the stable direct Stream channel.
4. Add Soulink server-side Stream helpers for channel creation and assistant
   message sending.
5. Add a Soulink webhook bridge from assistant `message.new` events to ME3
   dispatch.
6. Add ME3 Account UI activation state: unavailable, needs public URL, ready,
   connected, disconnected.
7. Add Soulink inbox treatment for assistant channels, including priority sort
   and assistant identity display.
8. Add tests:
   - provisioning idempotency,
   - message dispatch idempotency,
   - assistant reply loop prevention,
   - unauthorized dispatch rejected,
   - deletion/disconnect cleanup,
   - no assistant chat in human link recommendations.

## Recommendation

Use Soulink as the primary portable assistant chat surface, but do it as a
server-provisioned connector owned by Soulink's chat backend. Keep Telegram as a
fallback/legacy channel during the transition.

The first usable milestone should be text-only, one stable assistant chat per
ME3 owner, Stream push/read/archive behavior through Soulink, and ME3 runtime
continuity through the same agent chat boundary Core already uses.
