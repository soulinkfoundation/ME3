-- Source-backed Carousel media, immutable render inputs, and trusted SVG output.
-- Raster bytes stay in D1 for the first portable Core release. A hosted install
-- can move the byte payload behind the same content hash without changing the
-- persisted render model or generated SVG assets.

CREATE TABLE social_carousel_media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  immutable_url TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  pixel_width INTEGER NOT NULL CHECK (pixel_width > 0),
  pixel_height INTEGER NOT NULL CHECK (pixel_height > 0),
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(content_hash) = 71 AND substr(content_hash, 1, 7) = 'sha256:'),
  UNIQUE(user_id, site_id, content_hash),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_social_carousel_media_owner_site
  ON social_carousel_media(user_id, site_id, created_at DESC);

CREATE TABLE social_carousel_render_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  created_from_version_id TEXT,
  input_fingerprint TEXT NOT NULL,
  model_version TEXT NOT NULL,
  renderer_version TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  canvas_width INTEGER NOT NULL,
  canvas_height INTEGER NOT NULL,
  model_json TEXT NOT NULL CHECK (json_valid(model_json)),
  canonical_input TEXT NOT NULL CHECK (json_valid(canonical_input)),
  asset_manifest_json TEXT NOT NULL CHECK (json_valid(asset_manifest_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(input_fingerprint) = 71 AND substr(input_fingerprint, 1, 7) = 'sha256:'),
  UNIQUE(user_id, site_id, post_id, input_fingerprint),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES social_packages(id) ON DELETE CASCADE
);

CREATE INDEX idx_social_carousel_render_sets_post
  ON social_carousel_render_sets(post_id, created_at DESC);

CREATE TABLE social_carousel_render_assets (
  id TEXT PRIMARY KEY,
  render_set_id TEXT NOT NULL,
  slide_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  content_hash TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  immutable_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/svg+xml'),
  pixel_width INTEGER NOT NULL CHECK (pixel_width > 0),
  pixel_height INTEGER NOT NULL CHECK (pixel_height > 0),
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  alt_text TEXT NOT NULL,
  source_evidence_json TEXT NOT NULL CHECK (json_valid(source_evidence_json)),
  media_ref_ids_json TEXT NOT NULL CHECK (json_valid(media_ref_ids_json)),
  svg_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(content_hash) = 71 AND substr(content_hash, 1, 7) = 'sha256:'),
  UNIQUE(render_set_id, position),
  UNIQUE(render_set_id, slide_id),
  FOREIGN KEY (render_set_id) REFERENCES social_carousel_render_sets(id) ON DELETE CASCADE
);

CREATE INDEX idx_social_carousel_render_assets_set
  ON social_carousel_render_assets(render_set_id, position ASC);

CREATE TABLE social_carousel_render_set_media (
  render_set_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (render_set_id, media_id),
  FOREIGN KEY (render_set_id) REFERENCES social_carousel_render_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES social_carousel_media(id) ON DELETE RESTRICT
);

ALTER TABLE social_variants ADD COLUMN carousel_render_set_id TEXT
  REFERENCES social_carousel_render_sets(id) ON DELETE SET NULL;

CREATE INDEX idx_social_variants_carousel_render_set
  ON social_variants(carousel_render_set_id)
  WHERE carousel_render_set_id IS NOT NULL;
