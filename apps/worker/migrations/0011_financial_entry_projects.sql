ALTER TABLE financial_entries
  ADD COLUMN project_id TEXT REFERENCES mission_projects(id) ON DELETE SET NULL;

CREATE INDEX idx_financial_entries_project
  ON financial_entries(user_id, project_id);
