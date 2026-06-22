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
  UNIQUE(project_id, status),
  FOREIGN KEY (project_id) REFERENCES mission_projects(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO mission_project_columns
  (id, user_id, project_id, name, status, position)
SELECT id || ':backlog', user_id, id, 'Backlog', 'backlog', 0
FROM mission_projects;

INSERT OR IGNORE INTO mission_project_columns
  (id, user_id, project_id, name, status, position)
SELECT id || ':in_progress', user_id, id, 'Doing', 'in_progress', 1
FROM mission_projects;

INSERT OR IGNORE INTO mission_project_columns
  (id, user_id, project_id, name, status, position)
SELECT id || ':review', user_id, id, 'Review', 'review', 2
FROM mission_projects;

INSERT OR IGNORE INTO mission_project_columns
  (id, user_id, project_id, name, status, position)
SELECT id || ':done', user_id, id, 'Done', 'done', 3
FROM mission_projects;

ALTER TABLE mission_tasks ADD COLUMN column_id TEXT;

UPDATE mission_tasks
SET project_id = (
  SELECT p.id
  FROM mission_projects p
  WHERE p.user_id = mission_tasks.user_id AND p.slug = 'personal'
  LIMIT 1
)
WHERE project_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM mission_projects p
    WHERE p.user_id = mission_tasks.user_id AND p.slug = 'personal'
  );

UPDATE mission_tasks
SET column_id = project_id || ':' || status
WHERE project_id IS NOT NULL
  AND status IN ('backlog', 'in_progress', 'review', 'done');

CREATE INDEX idx_mission_project_columns_project_position
  ON mission_project_columns(project_id, archived_at, position);

CREATE INDEX idx_mission_tasks_column
  ON mission_tasks(column_id);
