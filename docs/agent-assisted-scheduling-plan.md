# Agent-Assisted Scheduling Plan

Date: 2026-06-05

Planning reference: [agent harness roadmap](agent-harness-roadmap.md)
Related references:

- [Soulink assistant chat spike](soulink-agent-chat-spike.md)
- [Assistant jobs safety](assistant-jobs-safety.md)
- [Assistant jobs capability registry](assistant-jobs-capability-registry.md)

## Goal

Let ME3 assistants help their owners schedule time with known contacts through
Soulink, while keeping private calendar data private and owner-controlled.

The first useful version assumes:

- User A and User B both have ME3 Core installs.
- Both have Soulink connected for portable messaging.
- Both use ME3's built-in `/calendar` data as the only calendar source.
- Scheduling is for 1:1 time only.
- Agents can suggest and coordinate; humans still approve final booking writes.

## Core Distinction

There are two separate scheduling surfaces:

1. Public booking compatibility from `me.json`.
2. Private agent-assisted scheduling between trusted contacts.

`me.json` should describe public booking intent: services, public availability
windows, public booking actions, and public paid/free booking paths. It should
not expose private calendar state.

Private scheduling should happen agent-to-agent. A foreign assistant should not
read another user's calendar directly. Instead, User B's assistant reads B's
calendar locally, applies B's scheduling policy, and returns only safe candidate
slots.

## Current State

`WizardBookings.vue` already captures:

- 1:1 offers.
- Classes.
- Retreats.
- Weekly 1:1 availability windows.
- Buffer time.
- Timezone.
- Free and paid pricing.

`apps/web/src/stores/wizard.ts` already publishes 1:1 booking availability under
`intents.book.availability` and publishes public `actions.checkAvailability` and
`actions.createBooking` in generated `me.json`.

Hosted `me3-app` has public booking routes matching those action descriptors:

- `GET /api/book/:username/slots?date=YYYY-MM-DD`
- `POST /api/book/:username/confirm`

Core currently has public booking routes for:

- `POST /api/book/:username/free`
- `POST /api/book/:username/checkout-session`
- `POST /api/book/:username/complete-checkout`

So Core should re-add compatibility routes for the public `me.json` action
contract instead of leaving action descriptors that point to missing behavior.
This is separate from private agent-to-agent calendar availability.

## Product Decisions

- Close contacts can receive candidate availability from the owner's assistant
  without a manual pre-review by the owner.
- Final booking, rescheduling, cancellation, calendar writes, and payment
  actions still require explicit owner approval.
- "Spend time" means any kind of 1:1 time, not only public paid service offers.
- The product should still be opinionated: every agent-assisted scheduling
  request must resolve to a configured time type.
- Soulink coordination should be mostly hidden. Users should see only essential
  summaries, polls, approval cards, and final confirmation.
- Google Calendar and Apple Calendar are out of scope for v1. Only ME3
  `/calendar` data matters.
- Paid scheduling v1 can hand off with "here is B's booking checkout link" rather
  than managing payment entirely inside the agent flow.
- Later, Soulink Links, circles, active group chats, and active calls can
  automatically qualify someone as a close contact.
- Informal mutual scheduling should create calendar events, not booking rows.
  Public/service/paid/profile-widget scheduling should continue to create
  booking rows.
- Assistant activity should show one condensed record per scheduling request,
  updated as it succeeds, fails, or expires.

## Shared Availability Editor

Extract the availability section from `WizardBookings.vue` into a shared
component before building Calendar scheduling settings.

Suggested component:

```ts
type BookingAvailabilityEditorProps = {
  availability: Record<string, string[]>;
  bufferTime?: number;
  timezone?: string;
  showBuffer?: boolean;
  showTimezone?: boolean;
  showPresets?: boolean;
  description?: string;
};
```

Suggested events:

- `update:availability`
- `update:bufferTime`
- `update:timezone`

`WizardBookings.vue` should remain responsible for wiring the component to the
wizard store. A later `/calendar` modal can reuse the same component against
calendar/scheduling settings without importing the wizard store.

Keep the first extraction limited to the current 1:1 weekly window UI:

- Weekday presets.
- Mornings preset.
- Clear all.
- Per-day edit/clear.
- Buffer time.
- Timezone.

Classes and retreats should stay outside this shared component for now because
they have their own schedule shapes.

## Time Types

Agent-assisted scheduling needs a stricter concept than freeform "find time".
Call this a time type.

Examples:

- Catch-up.
- Coffee chat.
- Work call.
- Client session.
- Paid consultation.
- Intro call.

Each time type should define:

```ts
type SchedulingTimeType = {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  bufferMinutes: number;
  timezone: string;
  windows: Record<string, string[]>;
  allowedTiers: Array<"public" | "contact" | "close_contact" | "client">;
  paymentMode: "free" | "paid_checkout" | "owner_review";
  publicBookingOfferId?: string;
  ownerPreReview: "always" | "unless_close_contact";
  allowCloseContactCandidateSharing: boolean;
  finalApproval: "both_owners";
};
```

Existing 1:1 booking offers can become public time types. A private "Catch-up"
time type can be created for close contacts only. This keeps the agent rigid
enough to behave safely while still supporting informal social time.

## Privilege Tiers

Start with four tiers:

- `public`: not a saved contact. Route to public booking only.
- `contact`: saved contact. Candidate suggestions require owner pre-review.
- `close_contact`: close contact. Assistant may share candidate slots without
  manual pre-review.
- `client`: client relationship. Assistant may use service-specific scheduling
  rules and paid booking handoff.

Contacts already have `relationship` and closeness metadata. V1 can use those
fields as policy input without adding a dedicated `closeness` database column.

Later Soulink integration should be able to upgrade privilege automatically when
there is strong relationship evidence:

- Existing Soulink Link.
- Shared circle.
- Active group chat.
- Recent or active Soulink call.

That automatic upgrade should remain policy-driven and owner-visible.

Close-contact candidate sharing means the owner's assistant can share possible
times with the other person's assistant without first asking the owner to review
those candidate slots.

It does not allow:

- Reading raw calendar data across installs.
- Sharing event titles, event notes, busy reasons, or private calendar records.
- Booking automatically.
- Skipping final owner approval.

The receiving assistant should only see safe slot options such as "Tuesday
10:00-10:30" and enough metadata to continue the scheduling flow.

## V1 User Flow

1. User A messages their assistant in Soulink: "Find time with B next week."
2. A's assistant resolves B from contacts and Soulink metadata.
3. A's assistant asks which time type applies if it cannot infer one.
4. A's assistant creates a scheduling request with duration, time type, date
   range, and the reason for meeting.
5. A's assistant sends a structured scheduling request to B's assistant.
6. B's assistant resolves A's contact tier.
7. B's assistant checks B's time type policy.
8. B's assistant reads B's ME3 calendar, confirmed bookings, and imported
   calendar events for the requested window.
9. B's assistant returns candidate slots or a review-required response.
10. A's assistant intersects those slots with A's ME3 calendar.
11. Soulink posts a small poll or action card with the best shared options.
12. Each user selects acceptable times.
13. When one slot wins, both owners approve finalization.
14. ME3 creates the local calendar event or booking record for each owner.

For informal time types such as "Catch-up" or "Coffee chat", finalization should
create `user_calendar_event` rows for both owners. For public/service/paid
booking offers, finalization should create a `bookings` row and rely on the
existing booking display in `/calendar`.

## Availability Computation

Candidate slot generation should combine:

- The selected time type's weekly windows.
- Timezone.
- Duration.
- Buffer time.
- Existing confirmed bookings.
- User calendar events.
- Imported calendar events.
- Date range requested by the owner.

Reminders should not block time by default. All-day events should block time only
when the event is marked busy, or until ME3 has an explicit busy/free flag.

The response to another assistant should include only candidate slots and safe
metadata. It should not include event titles, event notes, busy reasons, or raw
calendar records.

## Public Booking Compatibility

Re-add the public routes that `me.json` advertises:

### `GET /api/book/:username/slots`

Inputs:

- `date`: required `YYYY-MM-DD`.
- `offerId`: required only when multiple public 1:1 offers exist.

Behavior:

- Load the published profile.
- Resolve the selected public 1:1 offer.
- Generate slots from public `intents.book.availability`.
- Exclude confirmed bookings and active holds.
- Return timezone, selected offer, and available slots.

This route is public and should not read private calendar events unless the
owner explicitly chooses that behavior later.

### `POST /api/book/:username/confirm`

Inputs should match the public action descriptor:

- `slotStart`.
- `slotEnd`.
- `guestName`.
- `guestEmail`.
- `offerId` when needed.
- `paymentIntentId` only for compatible paid flows.

Behavior:

- Validate the slot against published booking availability.
- Reject overlaps.
- For free offers, create the confirmed booking.
- For paid offers, either require payment evidence or direct the caller to the
  checkout route.

### `POST /api/book/:username/checkout-session`

Core already has this route. If any public offer is paid, generated `me.json`
should also expose a `createBookingCheckout` action like hosted `me3-app` does.

This route is the right v1 handoff for paid scheduling. Agent flows can share a
checkout link rather than collecting or handling payment details.

## Private Scheduling APIs

The private scheduling layer can start as internal agent runtime helpers, then
become explicit routes as the UX settles.

Useful eventual API shape:

- `GET /api/scheduling/time-types`
- `POST /api/scheduling/requests`
- `POST /api/scheduling/requests/:id/candidates`
- `POST /api/scheduling/requests/:id/votes`
- `POST /api/scheduling/requests/:id/finalize`

These APIs should be owner-authenticated or service-authenticated. They are not
public `me.json` actions.

## Secure Agent-To-Agent Path

Recommended v1 transport: Soulink-mediated signed scheduling envelopes.

Avoid direct Core-to-Core trust negotiation in v1. It would require every Core
install to discover, verify, rotate, and revoke trust for every other install.
Soulink already has the relevant relationship and messaging context, so it is
the better trust broker for the first robust version.

Flow:

1. A's assistant creates a scheduling request inside A's ME3 install.
2. A's ME3 sends a server-to-server request to Soulink using its existing
   connector trust.
3. Soulink verifies A's ME3 install and requester identity.
4. Soulink resolves the target ME3/Soulink identity for B.
5. Soulink sends B's ME3 install a signed scheduling envelope.
6. B's ME3 verifies the envelope before invoking B's assistant runtime.
7. B's assistant returns a signed/sanitized candidate response through Soulink.
8. Soulink relays the response back to A's ME3 and updates the visible chat/poll
   only when user action is needed.

The signed envelope should include:

- Issuer: Soulink.
- Audience: B's ME3 install or owner id.
- Subject: A's verified ME3/Soulink identity.
- Request id and idempotency key.
- Expiry timestamp.
- Requested time type/date range/duration.
- Relationship evidence Soulink is allowed to assert, such as Link or shared
  circle status.
- Signature key id for rotation.

B's ME3 should reject envelopes with the wrong audience, expired timestamps,
unknown key ids, replayed idempotency keys, or relationship claims that do not
match local policy.

This keeps private calendar reads local to each owner and avoids exposing a
general public "ask my calendar" endpoint. A later version can add direct
ME3-to-ME3 federation if there is a strong reason, but it should still use
short-lived signed envelopes and explicit owner-scoped policy.

## Agent-To-Agent Messages

Use structured messages rather than freeform prose between assistants:

```ts
type SchedulingAgentMessage =
  | {
      type: "schedule.request";
      requestId: string;
      requester: { me3Url?: string; soulinkNodeId?: string; name?: string };
      target: { me3Url?: string; soulinkNodeId?: string; name?: string };
      timeTypeHint?: string;
      durationMinutes?: number;
      dateRange: { start: string; end: string };
      reason?: string;
    }
  | {
      type: "schedule.candidates";
      requestId: string;
      status: "ok" | "review_required" | "not_allowed" | "needs_time_type";
      slots?: Array<{ startsAt: string; endsAt: string; timezone: string }>;
      message?: string;
    }
  | {
      type: "schedule.finalize";
      requestId: string;
      selectedSlot: { startsAt: string; endsAt: string; timezone: string };
    };
```

Transport can be implemented through Soulink/ME3 service endpoints while keeping
the user-facing chat clean. The visible Soulink channel should show only the
poll, summaries, and required decisions.

## Soulink UX

V1 Soulink surface:

- A concise assistant message: "I found a few times with B."
- A poll or action card with 3-5 candidate slots.
- A status line when B needs to approve candidate sharing.
- A final confirmation card.
- A checkout link when the selected time type is paid.

Stream Chat has a Polls API, so a native Stream poll is plausible. If poll
support is unavailable in a client, fall back to a custom scheduling action card
or ordinary message buttons.

## Safety And Approval

Policy defaults:

- Reading the owner's own ME3 calendar for candidate generation is allowed only
  inside the owner's assistant runtime.
- Sharing candidate slots with a close contact can happen without pre-review.
- Sharing candidate slots with ordinary contacts requires owner review.
- Public users get only the public booking route.
- External messages, final booking, rescheduling, cancellation, calendar writes,
  and payment-related actions require explicit approval.
- No assistant should reveal private event details to another assistant.
- Paid bookings should use checkout links and existing Stripe-backed flows.

This matches the existing safety direction: booking and external sends are
explicit-send actions, and payment/account actions require approval.

## Activity And Audit

The owner-facing assistant activity surface should show one condensed activity
record per scheduling request, not a stream of low-level logs.

Use a single updatable activity item with lifecycle status:

- `pending`
- `waiting_for_owner_review`
- `poll_open`
- `scheduled`
- `failed`
- `expired`
- `cancelled`

The activity row can say things like:

- "Scheduling with Alex: waiting for Alex to choose a time."
- "Scheduling with Alex: confirmed for Tuesday 10:00."
- "Scheduling with Alex: expired after no response."

The activity details can include safe metadata:

- Participant display names.
- Time type.
- Request date range.
- Current status.
- Selected slot when finalized.
- Whether approval or payment is still needed.

Do not include private calendar event titles, notes, busy reasons, or raw
agent-to-agent payloads in the visible activity row. Keep lower-level audit
events available for debugging and policy review, but do not show them as
separate rows in `/assistant?settings=activity`.

## Data Model Sketch

Likely new tables or records:

- `scheduling_time_types`: owner-defined time types and policy.
- `scheduling_requests`: one scheduling attempt across two users.
- `scheduling_candidates`: candidate slots proposed by each assistant.
- `scheduling_votes`: selected/acceptable slots from each participant.
- `scheduling_activity`: one owner-facing lifecycle summary per request, or a
  scheduling-specific wrapper around the existing activity surface.
- `scheduling_audit_events`: low-level request, candidate sharing, poll,
  approval, finalization, failure, and expiry records for debugging/policy
  review.

Existing tables stay relevant:

- `contacts`: relationship and closeness metadata.
- `bookings`: confirmed public/private bookings.
- `user_calendar_events`: local calendar events.
- `calendar_source_events`: imported calendar events.
- `agent_channel_connections` and `agent_channel_events`: Soulink transport
  audit and dispatch state.

Public/service scheduling and informal mutual scheduling should intentionally
write to different final records:

- Public/service/paid/profile-widget scheduling: `bookings`.
- Informal private time: `user_calendar_events`.

Both already appear in `/calendar`, so the user experience can stay unified
without overloading the meaning of `bookings`.

## Implementation Phases

### Phase 0: Shared Availability Editor

- Extract the 1:1 weekly availability UI from `WizardBookings.vue`.
- Keep `WizardBookings.vue` as the wizard-store adapter.
- Make the shared component reusable from a future `/calendar` scheduling modal.
- Add focused component tests for presets, day editing, buffer, and timezone
  emits.

### Phase 1: Public Booking Action Compatibility

- Re-add `GET /api/book/:username/slots`.
- Re-add `POST /api/book/:username/confirm`.
- Add `createBookingCheckout` to generated `me.json` when paid offers exist.
- Keep existing `/free`, `/checkout-session`, and `/complete-checkout` routes.
- Add tests proving `me.json` action descriptors point to working Core routes.
- Use hosted `me3-app` as behavioral reference, but do not bulk-copy hosted-only
  config or production assumptions into Core.

### Phase 2: Time Types And Policy

- Add a minimal owner-facing way to create scheduling time types.
- Seed public booking offers as public time types.
- Add one optional private time type such as "Catch-up" for close contacts.
- Add allowed tiers, close-contact candidate sharing, and pre-review policy.

### Phase 3: Private Availability Engine

- Build a shared slot generator that can combine time type windows, buffers,
  confirmed bookings, calendar events, and imported events.
- Return sanitized candidate slots only.
- Add tests for timezone, overlaps, buffer, all-day events, and contact-tier
  policy.

### Phase 4: Agent Scheduling Runtime

- Add structured scheduling request/candidate/finalize messages.
- Wire A's assistant and B's assistant through Soulink-mediated signed
  scheduling envelopes.
- Keep coordination hidden unless a user action is needed.

### Phase 5: Soulink Poll And Finalization

- Create a Stream poll or fallback action card for candidate slots.
- Record votes.
- Ask both owners for final approval.
- Create ME3 calendar events or booking records after approval.

### Phase 6: Paid Handoff

- For paid time types, generate or expose a checkout link.
- Keep payment outside the agent conversation for v1.
- Confirm booking only after checkout succeeds through existing Core commerce
  flow.

### Phase 7: Condensed Activity

- Upsert one visible activity record per scheduling request.
- Update that record as the request moves through pending, poll, scheduled,
  failed, expired, or cancelled states.
- Keep low-level scheduling audit records out of the default activity list.

## Resolved Questions

- Time type availability editing should start in the existing Bookings wizard and
  later become visible from `/calendar` through a shared availability component.
- Close-contact candidate sharing is allowed, ideally as a per-time-type policy.
- Informal private scheduling creates `user_calendar_event` rows, while
  public/service/paid scheduling creates `bookings` rows.
- The most robust v1 service-authenticated path is a Soulink-mediated signed
  envelope, not direct Core-to-Core trust negotiation.
- The assistant activity surface should show one condensed lifecycle record per
  scheduling request.

## Remaining Questions

- Should time types be edited first in Bookings, Calendar, or both in the first
  UI release?
- What default time types should a fresh ME3 install include?
- What expiry windows should apply when users do not vote or approve?
- Which Soulink relationship signals are strong enough to upgrade someone to
  `close_contact` automatically?

## Recommendation

Start with the shared availability editor and public booking route
compatibility. Core currently publishes `me.json` actions for routes it does not
implement, and the same availability UI will be needed again from `/calendar`.
Then add time types, close-contact policy, and the private availability engine.
Only after those are stable should Soulink-mediated signed scheduling envelopes,
polls, finalization, and condensed activity become visible.
