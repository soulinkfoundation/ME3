-- Preserve explicit owner review for ordinary contacts while allowing their
-- assistants to initiate a scheduling request. Close contacts retain the
-- recorded candidate-sharing shortcut.
UPDATE scheduling_time_types
SET allowed_tiers_json = '["contact","close_contact","client"]',
    description = 'Informal 1:1 time for contacts.',
    updated_at = CURRENT_TIMESTAMP
WHERE title = 'Catch-up'
  AND description = 'Informal 1:1 time for close contacts.'
  AND allowed_tiers_json = '["close_contact"]'
  AND payment_mode = 'free'
  AND public_booking_offer_id IS NULL
  AND owner_pre_review = 'unless_close_contact'
  AND allow_close_contact_candidate_sharing = 1
  AND final_approval = 'both_owners'
  AND status = 'active';
