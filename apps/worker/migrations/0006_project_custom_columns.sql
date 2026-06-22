DROP INDEX IF EXISTS idx_mission_project_columns_project_position;

ALTER TABLE mission_project_columns RENAME TO mission_project_columns_old;

CREATE TABLE mission_project_columns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('backlog', 'in_progress', 'review', 'done')),
  position INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES mission_projects(id) ON DELETE CASCADE
);

INSERT INTO mission_project_columns
  (id, user_id, project_id, name, status, position, archived_at, created_at, updated_at)
SELECT id, user_id, project_id, name, status, position, archived_at, created_at, updated_at
FROM mission_project_columns_old;

DROP TABLE mission_project_columns_old;

CREATE INDEX idx_mission_project_columns_project_position
  ON mission_project_columns(project_id, archived_at, position);
