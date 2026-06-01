-- Optional first-party Accounts plugin for invoice, receipt, CSV, and Stripe triage context.

CREATE TABLE IF NOT EXISTS financial_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, entry_type, name),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_financial_categories_user_entry_type
  ON financial_categories(user_id, entry_type, sort_order);

CREATE TABLE IF NOT EXISTS financial_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'needs_review')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'email_triage', 'stripe', 'csv_import')),
  notes TEXT,
  source_ref TEXT,
  source_email_id TEXT,
  stripe_charge_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES financial_categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_user_entry_type_date
  ON financial_entries(user_id, entry_type, date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_entries_category
  ON financial_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_source
  ON financial_entries(user_id, source);
CREATE INDEX IF NOT EXISTS idx_financial_entries_status
  ON financial_entries(user_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_entries_stripe_charge
  ON financial_entries(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_source_email
  ON financial_entries(source_email_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_entries_user_source_ref
  ON financial_entries(user_id, source_ref)
  WHERE source_ref IS NOT NULL;
