CREATE UNIQUE INDEX IF NOT EXISTS idx_social_publications_one_active_variant
  ON social_publications(variant_id)
  WHERE variant_id LIKE 'social-variant-%'
    AND status IN ('queued', 'publishing', 'published');
