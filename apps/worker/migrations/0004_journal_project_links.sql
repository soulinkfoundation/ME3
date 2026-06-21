CREATE TABLE journal_project_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  journal_entry_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_text TEXT,
  created_task_id TEXT,
  created_reminder_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES mission_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_task_id) REFERENCES mission_tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_journal_project_links_project_created
  ON journal_project_links(user_id, project_id, created_at DESC);

CREATE INDEX idx_journal_project_links_entry
  ON journal_project_links(user_id, journal_entry_id);
