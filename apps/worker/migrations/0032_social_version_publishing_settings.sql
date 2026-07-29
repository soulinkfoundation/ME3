ALTER TABLE social_variants
  ADD COLUMN publishing_settings_json TEXT NOT NULL DEFAULT '{}';
