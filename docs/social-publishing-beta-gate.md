# LinkedIn-first Social Publishing beta gate

Status: **not exposed**
Tracking: `me3-1dr.4.6`
Last reviewed: 2026-07-11

## Visibility decision

Keep `me3.social-publishing` hidden from the owner plugin list (`showInPluginList: false`) until every critical live check below passes. The bundled plugin can still be activated deliberately in development and controlled beta installations.

Automated coverage is strong enough to begin live smoke testing, but it is not evidence that LinkedIn accepted the managed application, that a real member token has the expected products/scopes, or that scheduled queue delivery works in the deployed Cloudflare environment.

## Automated gate

| Area | Evidence | Result |
| --- | --- | --- |
| Journal and Mission Control draft creation | Agent runtime and source-backed package tests | Pass |
| Exact variant approval | Edit invalidation, account ownership, and approval tests | Pass |
| LinkedIn text publishing | Current-version Posts API adapter and permalink tests | Pass |
| LinkedIn single image | Image initialize/upload and post attachment test | Pass |
| Duplicate prevention | Concurrent queue request and database uniqueness tests | Pass |
| Scheduling | Future-time validation and due-dispatch service coverage | Pass at service level |
| Token lifecycle | Encrypted storage, BYO refresh, expiry, disconnect, and reconnect paths | Pass |
| Delivery recovery | Classified failures, bounded retry, ambiguous outcome freeze, and owner resolution | Pass |
| Regression gate | Worker suite: 38 files / 459 tests; full `pnpm build` | Pass on 2026-07-11 |

## Local production-like checks

Checked on 2026-07-11 against the Wrangler/Vite development stack with migration `0018` applied:

- Social Publishing loaded for an authenticated owner with the plugin deliberately activated.
- Drafts, Scheduled, Published, Accounts, and the LinkedIn BYO connection dialog exposed coherent accessible names with no browser console errors.
- The workspace and LinkedIn connection dialog had no horizontal overflow at a 390 × 844 viewport.
- The Social Publishing workspace rendered without horizontal overflow in explicit light and dark themes; the original system-theme preference was restored afterwards.
- The local scheduled Worker handler returned HTTP 200.
- `pnpm verify:local-boot` passed after its me.json assertions were updated for the protocol 0.2 `handle` identity shape.

These checks cover the local shell and responsive layout only. They do not replace the real-account, populated-state, deployed queue, or managed OAuth checks below.

## Critical live gate

Run these against a beta installation with test LinkedIn accounts. Record the installation/environment, time, actor, resulting post URL, and any provider request/correlation ID without copying tokens or secrets.

- [ ] Managed OAuth: connect a LinkedIn personal account through the ME3 Cloud bridge and verify `openid profile email w_member_social` behavior.
- [ ] BYO OAuth: configure a separate LinkedIn developer app, complete the callback, and verify the account can reconnect after revocation.
- [ ] Publish now: generate from a Journal entry, revise, approve the exact account variant, publish once, and open the stored LinkedIn URL.
- [ ] Mission Control source: generate from a task and confirm the source reference and snapshot remain visible after publishing.
- [ ] Single image: publish one supported public image and verify it appears on the LinkedIn post.
- [ ] Scheduled delivery: schedule across a timezone boundary, restart/redeploy before the due time, and verify one—not early and not duplicate—post.
- [ ] Refresh/reconnect: exercise a real provider-issued refresh token where available; otherwise verify the pre-dispatch reconnect-required experience.
- [ ] Transient failure: confirm a known 429/5xx fixture retries no more than twice with recorded attempts.
- [ ] Ambiguous outcome: simulate an interrupted write, verify there is no automatic retry, then resolve both “found post” and “no post” paths.
- [ ] Responsive UI: complete Drafts, Scheduled, Published, Accounts, and recovery flows on narrow/mobile and desktop layouts in light and dark themes.
- [ ] Operations: verify queue failures, reconnect-required accounts, retry counts, and outcome-unknown publications are observable without logging tokens, source snapshots, or private post copy.

## Exposure decision

After all critical checks pass, record one of:

- **Expose controlled beta:** set `showInPluginList: true`, label the LinkedIn-only scope clearly, and keep Instagram/X publishing unavailable in the primary workflow; or
- **Remain hidden:** record the failed check, owner impact, workaround, and follow-up bead.

Do not treat Instagram or X readiness as a blocker for the LinkedIn-only beta. Do not advertise organisation pages, video, multi-image posts, or carousels in this gate.
