# Assistant Image Generation Hardening Plan

Last updated: 2026-06-25

## Goal

Make assistant image generation failures understandable and recoverable without adding another image
provider yet.

## Essential Improvements

1. Split runtime failure reasons.
   - Provider call failed before image bytes: `image_generation_provider_failed`.
   - Provider refused or moderated the prompt/output: `image_generation_policy_blocked`.
   - Provider returned no usable bytes: `image_generation_empty_response`.
   - R2 save failed after bytes were returned: `image_generation_storage_failed`.
   - Attachment/message asset persistence failed: `image_generation_persistence_failed`.

2. Persist safe structured metadata.
   - Keep the stable reason in `imageAction.reason`.
   - Keep raw provider details in `debugError`/trace only.
   - Do not expose raw provider payloads in normal chat replies.

3. Improve owner-facing copy.
   - Policy/IP refusal: say the exact protected character cannot be generated and offer an original
     alternative with similar high-level traits.
   - Storage failure: say the image may have generated but could not be saved.
   - Provider outage: say the image provider failed before returning an image.
   - Empty response: suggest a simpler prompt or another image model.

4. Add a tiny obvious-IP preflight.
   - Keep the list small: `mickey mouse`, `peter griffin`, and major franchise mentions seen in QA.
   - Redirect to an original-character prompt before spending an image call.
   - Do not build a large IP database; provider moderation remains authoritative.

5. Add regression tests.
   - Mock provider policy failure.
   - Mock provider outage.
   - Mock empty/non-image provider response.
   - Mock R2 `put` failure.
   - Mock attachment insert failure and verify cleanup/reply.

## Notes

Current image route: Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b`.

Skipped for now: adding another provider. The Workers AI route is enough once failures are classified
and explained.
