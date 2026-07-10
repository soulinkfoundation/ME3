CREATE TABLE site_pages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'landing_page'
    CHECK (kind IN ('landing_page', 'standard')),
  title TEXT NOT NULL,
  template_id TEXT,
  draft_json TEXT NOT NULL,
  published_revision_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  UNIQUE (site_id, slug),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE site_page_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  document_json TEXT NOT NULL,
  rendered_html TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES site_pages(id) ON DELETE CASCADE
);

CREATE INDEX idx_site_pages_site_updated
  ON site_pages(site_id, updated_at DESC);
CREATE INDEX idx_site_page_revisions_page_created
  ON site_page_revisions(page_id, created_at DESC);

ALTER TABLE subscribers ADD COLUMN page_id TEXT;
ALTER TABLE subscribers ADD COLUMN action_id TEXT;
ALTER TABLE subscribers ADD COLUMN campaign TEXT;

ALTER TABLE bookings ADD COLUMN page_id TEXT;
ALTER TABLE bookings ADD COLUMN action_id TEXT;
ALTER TABLE bookings ADD COLUMN campaign TEXT;

CREATE TABLE commerce_orders (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  page_id TEXT,
  action_id TEXT,
  campaign TEXT,
  product_slug TEXT NOT NULL,
  product_title TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_note TEXT,
  amount_paid INTEGER,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  provider TEXT NOT NULL DEFAULT 'stripe_direct'
    CHECK (provider IN ('stripe_direct', 'me3_cloud')),
  checkout_session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_commerce_orders_site_created
  ON commerce_orders(site_id, created_at DESC);
